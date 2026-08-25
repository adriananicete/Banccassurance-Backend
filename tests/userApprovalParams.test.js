import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const USER_MODEL = "../../src/models/userModel.js";

const capture = async (build) => {
  const { model, inputs, queries } = await captureSql(USER_MODEL);
  await build(model);
  restoreSqlCapture();

  return {
    params: Object.fromEntries(inputs.map(({ name, value }) => [name, value])),
    queries,
  };
};

const branchHead = {
  Role: "BRANCH_HEAD",
  UserCode: "USR-BRH-0300",
  BranchCode: 255,
  AreaCode: null,
};

test("getUsersForApproval binds every parameter the procedure requires", async () => {
  // usp_sel_users_for_approval declares @CallerRole and @CallerUserCode with no
  // defaults. Binding @Role instead - the name it used before 2026-08-25 - took
  // the approvals list down with error 201 the moment the DBA deployed, and the
  // suite could not see it because nothing asserted the binding.
  const { params } = await capture((model) =>
    model
      .getUsersForApproval(branchHead, {
        StatusFilter: "PENDING",
        Search: "santos",
        PageNumber: 2,
        PageSize: 20,
      })
      .run(),
  );

  assert.deepEqual(Object.keys(params).sort(), [
    "AreaCode",
    "BranchCode",
    "CallerRole",
    "CallerUserCode",
    "PageNumber",
    "PageSize",
    "Search",
    "StatusFilter",
  ]);

  assert.equal(params.CallerRole, "BRANCH_HEAD");
  assert.equal(params.CallerUserCode, "USR-BRH-0300");
  assert.equal(params.BranchCode, 255);
  assert.equal(params.StatusFilter, "PENDING");
  assert.equal(params.Search, "santos");
  assert.equal(params.PageNumber, 2);
  assert.equal(params.PageSize, 20);
});

test("no parameter named Role survives, under any caller", async () => {
  // The rename is the whole defect. @Role meant the role being listed; the
  // procedure now takes the caller's. A binding left behind under the old name
  // is rejected outright by SQL Server as an argument the procedure does not
  // declare, so this asserts the name is gone rather than merely joined.
  const { params } = await capture((model) =>
    model.getUsersForApproval(branchHead, {}).run(),
  );

  assert.equal("Role" in params, false);
});

test("the caller's scope columns are sent as numbers whatever the JWT held", async () => {
  // A JWT carries whatever the login response put in it, and AreaCode became an
  // INT column on 2026-08-19 while BranchCode always was one. tedious refuses a
  // type mismatch before the query is sent, so this is a 500 rather than a bad
  // result.
  for (const branchCode of ["255", 255]) {
    const { params } = await capture((model) =>
      model
        .getUsersForApproval({ ...branchHead, BranchCode: branchCode, AreaCode: "2" }, {})
        .run(),
    );

    assert.equal(typeof params.BranchCode, "number", JSON.stringify(branchCode));
    assert.equal(params.BranchCode, 255, JSON.stringify(branchCode));
    assert.equal(typeof params.AreaCode, "number", JSON.stringify(branchCode));
    assert.equal(params.AreaCode, 2, JSON.stringify(branchCode));
  }
});

test("a missing scope column is NULL rather than zero", async () => {
  // A Sector Head has neither a branch nor an area, and the procedure's block
  // for them tests neither. Sending 0 would still be wrong for the roles that
  // do filter: branch 0 exists in no row, so an accidental fallback reads as an
  // empty approvals list rather than an error.
  const { params } = await capture((model) =>
    model
      .getUsersForApproval({ Role: "SECTOR_HEAD", UserCode: "USR-SEC-0029" }, {})
      .run(),
  );

  assert.equal(params.BranchCode, null);
  assert.equal(params.AreaCode, null);
  assert.equal(params.CallerRole, "SECTOR_HEAD");
});

test("an empty search reaches the procedure as NULL", async () => {
  // The procedure normalises with NULLIF(LTRIM(RTRIM(@Search)), '') and then
  // tests only @Search IS NULL. An empty string arriving as '' would still be
  // caught there, but asText is what the rest of this codebase uses at the
  // boundary and it keeps the two layers agreeing.
  for (const search of ["", null, undefined]) {
    const { params } = await capture((model) =>
      model.getUsersForApproval(branchHead, { Search: search }).run(),
    );

    assert.equal(params.Search, null, JSON.stringify(search));
  }
});

test("paging falls back to page 1 of 20 rather than to the old hardcoded 100", async () => {
  // The model used to pass PageNumber 1 and PageSize 100 as literals, so the
  // caller could not page and an approver with more than a hundred pending
  // users silently saw the first hundred. There are 567 Branch Heads pending.
  const { params } = await capture((model) =>
    model.getUsersForApproval(branchHead, {}).run(),
  );

  assert.equal(params.PageNumber, 1);
  assert.equal(params.PageSize, 20);
});

test("the six hand-written approval queries are gone", async () => {
  // Each was a copy of one column list, one status filter and one ORDER BY, and
  // the copies had already drifted: two carried the UserId tiebreaker and four
  // did not, only one selected FullName. That is the shape behind DBA items 5,
  // 27b and 33, and it is now a single procedure.
  const { model } = await captureSql(USER_MODEL);
  restoreSqlCapture();

  for (const gone of [
    "getBranchHeadsForApproval",
    "getGroupHeadsForApproval",
    "getRegionalSalesHeadsForApproval",
    "getAreaSalesHeadsForApproval",
    "getAccountOfficersForApproval",
    "getTopLevelHeadsForApproval",
  ]) {
    assert.equal(model[gone], undefined, gone);
  }
});

test("the Sector Head lookup takes no area and reads no junction table", async () => {
  // A Sector Head is found by role alone. Joining user_area here meant a
  // registering Group Head was told no Sector Head was assigned to their group.
  const { queries, params } = await capture((model) => model.getSectorHead().run());

  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /user_area/i);
  assert.match(queries[0], /Role = 'SECTOR_HEAD'/);
  assert.match(queries[0], /IsActive = 1/);
  assert.deepEqual(params, {});
});
