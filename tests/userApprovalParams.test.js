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

test("getUsersForApproval binds every parameter the procedure requires", async () => {
  // usp_sel_users_for_approval declares @Role and @BranchCode with no defaults.
  // The model bound only BranchCode and StatusFilter, so a Branch Head opening
  // the approvals list got a SQL error instead of a list. Nothing asserted the
  // binding, which is the only reason it reached main.
  const { params } = await capture((model) =>
    model.getUsersForApproval("BRANCH_STAFF", 58, "PENDING").run(),
  );

  assert.equal(params.Role, "BRANCH_STAFF");
  assert.equal(params.BranchCode, 58);
  assert.equal(params.StatusFilter, "PENDING");
  assert.equal(typeof params.PageNumber, "number");
  assert.equal(typeof params.PageSize, "number");
});

test("getUsersForApproval sends BranchCode as a number whatever the JWT held", async () => {
  for (const branchCode of ["58", 58]) {
    const { params } = await capture((model) =>
      model.getUsersForApproval("BRANCH_STAFF", branchCode, "ALL").run(),
    );

    assert.equal(typeof params.BranchCode, "number", JSON.stringify(branchCode));
    assert.equal(params.BranchCode, 58, JSON.stringify(branchCode));
  }
});

test("the Sector Head's Group Head list carries no area filter", async () => {
  // banc.user_area is the Group Heads' own scope table. Filtering this query on
  // the caller's rows in it resolved the one Sector Head to nothing, so their
  // approvals list came back empty and sixteen Group Heads sat pending.
  const { queries, params } = await capture((model) =>
    model.getGroupHeadsForApproval("PENDING").run(),
  );

  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /user_area/i);
  assert.match(queries[0], /Role = 'GROUP_HEAD'/);
  assert.equal(params.StatusFilter, "PENDING");
  assert.equal("UserId" in params, false);
});

test("the Group Head list orders by a column that cannot tie", async () => {
  // Users.CreatedAt is NULL on every seeded row, so CreatedAt alone is a total
  // tie rather than an occasional one.
  const { queries } = await capture((model) =>
    model.getGroupHeadsForApproval("ALL").run(),
  );

  assert.match(queries[0], /ORDER BY\s+CreatedAt DESC,\s*UserId DESC/i);
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
