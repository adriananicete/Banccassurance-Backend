import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";

const OPTIONS = {
  PageNumber: 1,
  PageSize: 20,
  Search: null,
  Status: null,
  Verified: null,
  DateFrom: null,
  DateTo: null,
  SortBy: null,
  SortDir: "DESC",
};

const paramsFor = async (build) => {
  const { model, inputs } = await captureSql(REFERRAL_MODEL);
  build(model);
  restoreSqlCapture();

  return Object.fromEntries(inputs.map(({ name, value }) => [name, value]));
};

const bothEntryPoints = [
  ["getReferralsByRole", (model, user) => model.getReferralsByRole(user, OPTIONS)],
  ["getReferralCountsByRole", (model, user) => model.getReferralCountsByRole(user)],
];

test("the session's GroupCode is bound as @GroupCode, as a number however it was carried", async () => {
  // Both ends finished moving on 2026-08-26 -- the session carries GroupCode
  // because usp_ValidateUser returns it, and the procedures declare @GroupCode
  // because the parameters were renamed in the same pass.
  //
  // Getting the parameter name wrong is not a bad result but a hard failure --
  // error 8145 for a name the procedure does not declare, error 201 for one it
  // declares and did not receive -- so the name is asserted as firmly as the
  // value. Both were live 500s that day, in both directions.
  for (const [name, call] of bothEntryPoints) {
    for (const GroupCode of [5, "5"]) {
      const params = await paramsFor((model) =>
        call(model, { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", BranchCode: null, GroupCode }),
      );

      assert.equal("AreaCode" in params, false, `${name} ${JSON.stringify(GroupCode)}`);
      assert.equal(typeof params.GroupCode, "number", `${name} ${JSON.stringify(GroupCode)}`);
      assert.equal(params.GroupCode, 5, `${name} ${JSON.stringify(GroupCode)}`);
    }
  }
});

test("a session still carrying only AreaCode is not read by mistake", async () => {
  // The session half of the rename fails silently where the parameter half fails
  // loudly: the old key is simply ignored and the caller sees an empty list.
  // Asserting the miss is what keeps a revert to user.AreaCode from passing.
  for (const [name, call] of bothEntryPoints) {
    const params = await paramsFor((model) =>
      call(model, { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", BranchCode: null, AreaCode: 5 }),
    );

    assert.equal(params.GroupCode, 0, name);
  }
});

test("a string BranchCode is sent as a number", async () => {
  // The mirror of the same defect: @BranchCode is INT, and a string is refused
  // just as firmly. Not observed yet, only because Account Officers carry null.
  for (const [name, call] of bothEntryPoints) {
    const params = await paramsFor((model) =>
      call(model, { Role: "BRANCH_STAFF", UserCode: "USR-STF-0115", BranchCode: "58", GroupCode: "1" }),
    );

    assert.equal(typeof params.BranchCode, "number", name);
    assert.equal(params.BranchCode, 58, name);
  }
});

test("the defaults for a missing scope are unchanged", async () => {
  // The stored procedures treat 0 as "no scope". Coercing the types must not
  // quietly turn that into NULL, which the procedures do not expect. Every
  // PhilLife head reaches here with both columns null.
  for (const [name, call] of bothEntryPoints) {
    for (const missing of [null, undefined, ""]) {
      const params = await paramsFor((model) =>
        call(model, { Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-0001", BranchCode: missing, GroupCode: missing }),
      );

      assert.equal(params.BranchCode, 0, `${name} ${JSON.stringify(missing)}`);
      assert.equal(params.GroupCode, 0, `${name} ${JSON.stringify(missing)}`);
    }
  }
});

test("the referrer's Account Officer is resolved from the branch, not from the stale snapshot", async () => {
  // Users.AOCode is written once, by usp_ins_register_user, from whoever held
  // the branch at that moment. Assigning an Account Officer afterwards does
  // nothing for the staff already in that branch, so every seeded Landbank
  // account carries NULL here and can never create a referral - the guard in
  // createReferral refuses them by design.
  //
  // Reading account_officer_branches live fixes that for everyone at once.
  //
  // The column is deliberately NOT coalesced back onto Users.AOCode. Falling
  // back to the stored value would let an Account Officer keep receiving
  // referrals from a branch that had been taken away from them, and the rule is
  // that a branch with no Account Officer refuses the referral outright.
  const { model, queries } = await captureSql(REFERRAL_MODEL);
  await model.getReferrerAttribution("USR-BRH-0300").run();
  restoreSqlCapture();

  const [text] = queries;

  assert.match(text, /FROM banc\.account_officer_branches aob/i);
  assert.match(text, /WHERE aob\.BranchCode = u\.BranchCode/i);
  assert.match(text, /live\.UserCode AS AOCode/i);
  assert.doesNotMatch(text, /COALESCE\(live\.UserCode/i);
});

test("the Account Officer's name is joined on the resolved code, not the stored one", async () => {
  // Easy to miss when changing the column: leaving the join on u.AOCode returns
  // a live AOCode beside a null or, worse, a stale AOName - and the referral
  // row carries both.
  const { model, queries } = await captureSql(REFERRAL_MODEL);
  await model.getReferrerAttribution("USR-BRH-0300").run();
  restoreSqlCapture();

  assert.match(queries[0], /ao\.UserCode = live\.UserCode/i);
  assert.doesNotMatch(queries[0], /ON u\.AOCode = ao\.UserCode/i);
});

test("the overseers' hand-written list query is gone", async () => {
  // It bound only paging, so every filter was dropped for a Sector Head and a
  // Department Head (R11). Their tenant scoping lives in usp_sel_referrals_by_role_1
  // now, with the other six roles'. A second copy here would be a fifth copy of
  // the scoping block that has already drifted four times.
  const { model } = await captureSql(REFERRAL_MODEL);
  restoreSqlCapture();

  assert.equal("getReferralsForSectorOrDepartmentHead" in model, false);
});

test("an overseer's filters are bound to the list procedure", async () => {
  const filters = {
    ...OPTIONS,
    Search: "Juan",
    Status: "Declined",
    Verified: 1,
    DateFrom: "2026-07-01",
    DateTo: "2026-09-30",
    SortBy: "StatusDate",
    SortDir: "ASC",
  };

  for (const user of [
    { Role: "SECTOR_HEAD", UserCode: "USR-SEC-0001" },
    { Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-0001" },
  ]) {
    const { model, inputs, queries } = await captureSql(REFERRAL_MODEL);
    await model.getReferralsByRole(user, filters).run();
    restoreSqlCapture();

    const params = Object.fromEntries(inputs.map(({ name, value }) => [name, value]));
    assert.deepEqual(queries, ["EXEC [banc].[usp_sel_referrals_by_role_1]"], user.Role);
    assert.equal(params.Role, user.Role);
    assert.equal(params.UserCode, user.UserCode);
    for (const name of ["Search", "Status", "Verified", "DateFrom", "DateTo", "SortBy", "SortDir"])
      assert.equal(params[name], filters[name], `${user.Role} ${name}`);
  }
});

test("every scope parameter is a type the procedure can accept", async () => {
  // Whatever the JWT happens to hold, nothing may reach tedious as a type it
  // will reject. This is the assertion that would have caught the defect
  // regardless of which column the JWT got wrong.
  const shapes = [
    { BranchCode: null, GroupCode: 5 },
    { BranchCode: "58", GroupCode: "1" },
    { BranchCode: 58, GroupCode: 1 },
    { BranchCode: undefined, GroupCode: undefined },
  ];

  for (const [name, call] of bothEntryPoints) {
    for (const shape of shapes) {
      const params = await paramsFor((model) =>
        call(model, { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", ...shape }),
      );

      assert.equal(typeof params.BranchCode, "number", `${name} ${JSON.stringify(shape)}`);
      assert.equal(typeof params.GroupCode, "number", `${name} ${JSON.stringify(shape)}`);
    }
  }
});
