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

test("AreaCode is sent as a number, whichever way the JWT carried it", async () => {
  // Both procedures declare @AreaCode INT. They were NVARCHAR(50) until the DBA
  // rebuilt Users and Referrals, and the coercion added then now points the
  // wrong way: a string only reaches the column through an implicit conversion,
  // and BranchCode two lines above already does this correctly.
  for (const [name, call] of bothEntryPoints) {
    for (const AreaCode of [5, "5"]) {
      const params = await paramsFor((model) =>
        call(model, { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", BranchCode: null, AreaCode }),
      );

      assert.equal(typeof params.AreaCode, "number", `${name} ${JSON.stringify(AreaCode)}`);
      assert.equal(params.AreaCode, 5, `${name} ${JSON.stringify(AreaCode)}`);
    }
  }
});

test("a string BranchCode is sent as a number", async () => {
  // The mirror of the same defect: @BranchCode is INT, and a string is refused
  // just as firmly. Not observed yet, only because Account Officers carry null.
  for (const [name, call] of bothEntryPoints) {
    const params = await paramsFor((model) =>
      call(model, { Role: "BRANCH_STAFF", UserCode: "USR-STF-0115", BranchCode: "58", AreaCode: "1" }),
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
        call(model, { Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-0001", BranchCode: missing, AreaCode: missing }),
      );

      assert.equal(params.BranchCode, 0, `${name} ${JSON.stringify(missing)}`);
      assert.equal(params.AreaCode, 0, `${name} ${JSON.stringify(missing)}`);
    }
  }
});

test("the overseer list carries a tenant guard on the column that side scopes by", async () => {
  // This query had no WHERE clause at all, so a PhilLife Department Head listed
  // Landbank referrals and the reverse. Stubbing the model cannot catch that —
  // only reading the SQL the model actually builds can. Landbank scopes on who
  // created the referral, PhilLife on who handles it.
  const { model, queries } = await captureSql(REFERRAL_MODEL);
  await model
    .getReferralsForSectorOrDepartmentHead("SECTOR_HEAD", "USR-%", OPTIONS)
    .run();
  restoreSqlCapture();

  const [text] = queries;

  assert.match(text, /SECTOR_HEAD'\s+AND r\.ReferrerCode\s+LIKE @TenantPrefix/i);
  assert.match(text, /DEPARTMENT_HEAD'\s+AND r\.AOCode\s+LIKE @TenantPrefix/i);
  assert.doesNotMatch(text, /ConsentToken/);
  assert.match(text, /COUNT\(\*\) OVER\(\) AS TotalCount/i);
  assert.match(text, /ORDER BY r\.CreatedAt DESC, r\.ReferralNo DESC/i);
});

test("every scope parameter is a type the procedure can accept", async () => {
  // Whatever the JWT happens to hold, nothing may reach tedious as a type it
  // will reject. This is the assertion that would have caught the defect
  // regardless of which column the JWT got wrong.
  const shapes = [
    { BranchCode: null, AreaCode: 5 },
    { BranchCode: "58", AreaCode: "1" },
    { BranchCode: 58, AreaCode: 1 },
    { BranchCode: undefined, AreaCode: undefined },
  ];

  for (const [name, call] of bothEntryPoints) {
    for (const shape of shapes) {
      const params = await paramsFor((model) =>
        call(model, { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", ...shape }),
      );

      assert.equal(typeof params.BranchCode, "number", `${name} ${JSON.stringify(shape)}`);
      assert.equal(typeof params.AreaCode, "number", `${name} ${JSON.stringify(shape)}`);
    }
  }
});
