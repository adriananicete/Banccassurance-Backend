import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { scopeReach } from "../src/services/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  landBankRoles,
  philLifeRoles,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const session = (overrides) => ({
  UserId: 622,
  UserCode: "PHL-ASH-0617",
  Role: AREA_SALES_HEAD,
  BranchCode: null,
  GroupCode: null,
  ...overrides,
});

const selfRow = (overrides) =>
  rows({
    UserId: 622,
    UserCode: "PHL-ASH-0617",
    IsActive: true,
    Role: AREA_SALES_HEAD,
    BranchCode: null,
    GroupCode: null,
    ...overrides,
  });

const groupRow = (overrides) => ({
  GroupCode: 1,
  GroupName: "NORTH NCR",
  RegionCode: 1,
  RegionName: "NCR",
  ClusterCode: null,
  ClusterName: null,
  ...overrides,
});

const branchRow = (overrides) => ({
  BranchCode: 71,
  BranchName: "Tandang Sora",
  GroupCode: 1,
  GroupName: "NORTH NCR",
  RegionCode: 1,
  RegionName: "NCR",
  ClusterCode: null,
  ClusterName: null,
  ...overrides,
});

test("every role has a reach, and the three values mean three different things", () => {
  // Assert the set. A role missing here falls back to ASSIGNED and reports
  // empty arrays -- which for a Department Head would read as "holds nothing"
  // when the truth is "holds the whole tenant". That confusion is what produced
  // DBA item 5, and it is why reach exists at all.
  assert.deepEqual(
    Object.keys(scopeReach).sort(),
    [...landBankRoles, ...philLifeRoles, SUPERADMIN].sort(),
  );

  assert.equal(scopeReach[BRANCH_STAFF], "SELF");
  assert.equal(scopeReach[SECTOR_HEAD], "TENANT");
  assert.equal(scopeReach[DEPARTMENT_HEAD], "TENANT");
  assert.equal(scopeReach[SUPERADMIN], "TENANT");

  for (const role of [BRANCH_HEAD, GROUP_HEAD, ACCOUNT_OFFICER, AREA_SALES_HEAD, REGIONAL_SALES_HEAD]) {
    assert.equal(scopeReach[role], "ASSIGNED", role);
  }
});

test("an Area Sales Head can finally read the scope the JWT does not carry", async () => {
  // registration writes Users.GroupCode = NULL for this role and puts the truth
  // in area_sales_head_areas, so the token carries null. Before this endpoint the
  // only way to discover your own groups was to attempt an assignment and read
  // the codes out of the 403.
  const { service, calls } = await withUserService({
    getUserScopeById: selfRow(),
    getAreaSalesHeadScope: rows(groupRow(), groupRow({ GroupCode: 2, GroupName: "CENTRAL NCR" })),
  });

  const result = await service.getOwnScope(session());

  assert.equal(result.data.reach, "ASSIGNED");
  assert.equal(result.data.tenant, "PHL");
  assert.deepEqual(result.data.scopes.map((s) => s.code), [1, 2]);
  assert.equal(result.data.scopes[0].level, "GROUP");
  assert.equal(result.data.scopes[0].name, "NORTH NCR");
  assert.equal(result.data.scopes[0].regionName, "NCR");
  assert.deepEqual(result.data.branches, []);
  assert.equal(calls.some((c) => c.name === "getAreaSalesHeadScope"), true);
});

test("the scope is read from the row, not from the token", async () => {
  // #99 made AO attribution live for the same reason. A token is eight hours
  // old; scope is reassigned inside that window, and the stale value here would
  // be a screen showing groups the server would refuse to act on.
  const { service } = await withUserService({
    getUserScopeById: selfRow({ Role: GROUP_HEAD, UserCode: "USR-GRH-0031", GroupCode: 9 }),
    getGroupScope: rows(groupRow({ GroupCode: 9, GroupName: "SOUTHWEST LUZON", RegionCode: 2, RegionName: "Luzon" })),
  });

  const result = await service.getOwnScope(session({ Role: AREA_SALES_HEAD, GroupCode: 1 }));

  assert.equal(result.data.role, GROUP_HEAD);
  assert.equal(result.data.tenant, "USR");
  assert.deepEqual(result.data.scopes.map((s) => s.code), [9]);
});

test("a superadmin never reaches getTenant", async () => {
  // getTenant throws 400 on anything that is not USR- or PHL-, deliberately, so
  // SYS-ADM-0001 must be answered before that call is made.
  const { service, calls } = await withUserService({ getUserScopeById: selfRow() });

  const result = await service.getOwnScope(
    session({ UserCode: "SYS-ADM-0001", Role: SUPERADMIN, UserId: 1 }),
  );

  assert.equal(result.data.tenant, null);
  assert.equal(result.data.reach, "TENANT");
  assert.equal(calls.length, 0);
});

test("holding everything and holding nothing do not look alike", async () => {
  // Both answer with empty arrays. reach is the only thing that separates a
  // Department Head who sees the whole tenant from an approved Account Officer
  // with no branches, and the second is a blocking state -- that AO cannot
  // create a referral.
  const { service } = await withUserService({
    getUserScopeById: selfRow({ Role: DEPARTMENT_HEAD, UserCode: "PHL-DH-0001", GroupCode: null }),
  });
  const head = await service.getOwnScope(session({ Role: DEPARTMENT_HEAD }));

  const { service: second } = await withUserService({
    getUserScopeById: selfRow({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-1168", GroupCode: 5 }),
    getGroupScope: rows(groupRow({ GroupCode: 5, GroupName: "CENTRAL LUZON" })),
    getAccountOfficerBranchScope: noRows,
  });
  const officer = await second.getOwnScope(session({ Role: ACCOUNT_OFFICER }));

  assert.deepEqual(head.data.branches, []);
  assert.deepEqual(officer.data.branches, []);
  assert.equal(head.data.reach, "TENANT");
  assert.equal(officer.data.reach, "ASSIGNED");
});

test("a tenant-wide role runs no scope query at all", async () => {
  const { service, calls } = await withUserService({
    getUserScopeById: selfRow({ Role: SECTOR_HEAD, UserCode: "USR-SEC-0029", GroupCode: null }),
  });

  const result = await service.getOwnScope(session({ Role: SECTOR_HEAD }));

  assert.deepEqual(result.data.scopes, []);
  assert.equal(result.data.reach, "TENANT");
  assert.deepEqual(
    calls.map((c) => c.name),
    ["getUserScopeById"],
  );
});

test("branch staff read their branch, and their reach is SELF", async () => {
  // A Branch Staff sees only their own referrals, so SELF rather than ASSIGNED:
  // the branch is where they sit, not a set they oversee.
  const { service } = await withUserService({
    getUserScopeById: selfRow({ Role: BRANCH_STAFF, UserCode: "USR-STF-0613", BranchCode: 71 }),
    getBranchScope: rows(branchRow()),
  });

  const result = await service.getOwnScope(session({ Role: BRANCH_STAFF }));

  assert.equal(result.data.reach, "SELF");
  assert.deepEqual(result.data.branches.map((b) => b.branchCode), [71]);
  assert.equal(result.data.branches[0].groupName, "NORTH NCR");
});

test("an Account Officer gets a group and its branches, both", async () => {
  const { service } = await withUserService({
    getUserScopeById: selfRow({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-1168", GroupCode: 5 }),
    getGroupScope: rows(groupRow({ GroupCode: 5, GroupName: "CENTRAL LUZON", RegionCode: 2, RegionName: "Luzon" })),
    getAccountOfficerBranchScope: rows(
      branchRow({ BranchCode: 58, BranchName: "San Fernando - Dolores", GroupCode: 5, GroupName: "CENTRAL LUZON" }),
    ),
  });

  const result = await service.getOwnScope(session({ Role: ACCOUNT_OFFICER }));

  assert.deepEqual(result.data.scopes.map((s) => s.code), [5]);
  assert.deepEqual(result.data.branches.map((b) => b.branchCode), [58]);
});

test("a null region reads as null, never as the group code", async () => {
  // group_areas.RegionCode is still nullable. Falling back to the group code
  // would report a group as a region, which is the one-word-two-meanings failure
  // the whole tier structure exists to end. A null region is honest: it means an
  // unassigned group.
  const { service } = await withUserService({
    getUserScopeById: selfRow(),
    getAreaSalesHeadScope: rows(groupRow({ RegionCode: null, RegionName: null })),
  });

  const result = await service.getOwnScope(session());

  assert.equal(result.data.scopes[0].regionCode, null);
  assert.equal(result.data.scopes[0].regionName, null);
  assert.equal(result.data.scopes[0].groupCode, 1);
});

const officerTarget = (overrides) =>
  rows({
    UserId: 1784,
    UserCode: "PHL-AO-1168",
    IsActive: true,
    Role: ACCOUNT_OFFICER,
    BranchCode: null,
    GroupCode: 5,
    ...overrides,
  });

const ASH = session({ UserCode: "PHL-ASH-0005", Role: AREA_SALES_HEAD });
const ADMIN = { UserId: 1, UserCode: "SYS-ADM-0001", Role: SUPERADMIN };

test("reading an Account Officer's branches gives the PUT's own key back", async () => {
  // branchCodes is the round-trip key: the write payload is data.branchCodes
  // from this read, edited. A round trip with no edit has to be a provable
  // no-op, because PUT replaces the whole set -- on 2026-08-25 a live test sent
  // [71, 255], and [71] alone would have dropped 255 with no error and no trace.
  const { service } = await withUserService({
    getUserScopeById: officerTarget(),
    isAreaInAreaSalesHeadScope: scopeHit,
    getAccountOfficerBranchScope: rows(
      branchRow({ BranchCode: 71 }),
      branchRow({ BranchCode: 255, BranchName: "Novaliches" }),
    ),
  });

  const result = await service.getAccountOfficerBranches(ASH, 1784);

  assert.deepEqual(result.data.branchCodes, [71, 255]);
  assert.equal(result.data.userCode, "PHL-AO-1168");
  assert.equal(result.data.branches[1].branchName, "Novaliches");
});

test("the read refuses exactly where the write refuses", async () => {
  // A GET that answers where the PUT would refuse teaches the client a scope
  // model the server does not hold. Same check, same 403.
  const { service } = await withUserService({
    getUserScopeById: officerTarget(),
    isAreaInAreaSalesHeadScope: scopeMiss,
    getAccountOfficerBranchScope: noRows,
  });

  const error = await captureThrown(() => service.getAccountOfficerBranches(ASH, 1784));

  assert.equal(error?.statusCode, 403);
});

test("a superadmin skips the caller-scope check on the read, as on the write", async () => {
  const { service, calls } = await withUserService({
    getUserScopeById: officerTarget(),
    getAccountOfficerBranchScope: noRows,
  });

  const result = await service.getAccountOfficerBranches(ADMIN, 1784);

  assert.equal(result.success, true);
  assert.equal(calls.some((c) => c.name === "isAreaInAreaSalesHeadScope"), false);
});

test("the target still has to be the right role and approved", async () => {
  const wrongRole = await withUserService({
    getUserScopeById: officerTarget({ Role: BRANCH_HEAD }),
    isAreaInAreaSalesHeadScope: scopeHit,
  });
  const notApproved = await withUserService({
    getUserScopeById: officerTarget({ IsActive: false }),
    isAreaInAreaSalesHeadScope: scopeHit,
  });
  const missing = await withUserService({ getUserScopeById: noRows });

  const first = await captureThrown(() => wrongRole.service.getAccountOfficerBranches(ASH, 1784));
  const second = await captureThrown(() => notApproved.service.getAccountOfficerBranches(ASH, 1784));
  const third = await captureThrown(() => missing.service.getAccountOfficerBranches(ASH, 9999));

  assert.equal(first?.statusCode, 400);
  assert.equal(second?.statusCode, 400);
  assert.equal(third?.statusCode, 404);
});

test("a junk userId is a 404 rather than a query", async () => {
  const { service, calls } = await withUserService({ getUserScopeById: noRows });

  const error = await captureThrown(() => service.getAccountOfficerBranches(ASH, "abc"));

  assert.equal(error?.statusCode, 404);
  assert.equal(calls.length, 0);
});

test("reading an Area Sales Head's groups runs the regional check its PUT runs", async () => {
  const ashTarget = rows({
    UserId: 700,
    UserCode: "PHL-ASH-0005",
    IsActive: true,
    Role: AREA_SALES_HEAD,
    BranchCode: null,
    GroupCode: null,
  });

  const allowed = await withUserService({
    getUserScopeById: ashTarget,
    isAshInRegionalScope: scopeHit,
    getAreaSalesHeadScope: rows(groupRow({ GroupCode: 5 }), groupRow({ GroupCode: 6 })),
  });
  const refused = await withUserService({
    getUserScopeById: ashTarget,
    isAshInRegionalScope: scopeMiss,
    getAreaSalesHeadScope: noRows,
  });

  const RSH = { UserId: 800, UserCode: "PHL-RSH-0002", Role: REGIONAL_SALES_HEAD };

  const result = await allowed.service.getAreaSalesHeadAreas(RSH, 700);
  const error = await captureThrown(() => refused.service.getAreaSalesHeadAreas(RSH, 700));

  assert.deepEqual(result.data.groupCodes, [5, 6]);
  assert.equal(error?.statusCode, 403);
});

test("reading a Regional Sales Head's groups runs no caller-scope check, because its PUT runs none", async () => {
  // Deliberate asymmetry, mirrored rather than tidied: a Department Head sees
  // the whole tenant, so there is nothing to check them against.
  const { service, calls } = await withUserService({
    getUserScopeById: rows({
      UserId: 900,
      UserCode: "PHL-RSH-0002",
      IsActive: true,
      Role: REGIONAL_SALES_HEAD,
      BranchCode: null,
      GroupCode: null,
    }),
    getRegionalSalesHeadScope: rows(groupRow({ GroupCode: 4 }), groupRow({ GroupCode: 5 })),
  });

  const DH = { UserId: 5, UserCode: "PHL-DH-0001", Role: DEPARTMENT_HEAD };
  const result = await service.getRegionalSalesHeadAreas(DH, 900);

  assert.deepEqual(result.data.groupCodes, [4, 5]);
  assert.equal(calls.some((c) => c.name === "isAshInRegionalScope"), false);
  assert.equal(calls.some((c) => c.name === "isAreaInAreaSalesHeadScope"), false);
});

test("assignable branches say who holds each, so a 409 is not the way to find out", async () => {
  // A branch already held by another Account Officer is otherwise discoverable
  // only by attempting the write and reading the 409 -- a data rule that applies
  // even to the superadmin. aoCode null means free.
  const { service, calls } = await withUserService({
    getAssignableBranches: rows(
      { ...branchRow({ BranchCode: 71 }), AOCode: null },
      { ...branchRow({ BranchCode: 255, BranchName: "Novaliches" }), AOCode: "PHL-AO-1168" },
    ),
  });

  const result = await service.getAssignableBranches(ASH, undefined);

  assert.equal(result.data[0].aoCode, null);
  assert.equal(result.data[1].aoCode, "PHL-AO-1168");
  assert.deepEqual(calls.find((c) => c.name === "getAssignableBranches").args, [
    "PHL-ASH-0005",
    null,
  ]);
});

test("a superadmin has to name a group rather than ask for all 567", async () => {
  // The junction scopes an Area Sales Head to at most a few groups. A superadmin
  // holds no junction rows, so an unfiltered answer is every branch in the
  // country -- the same unpaged 34 KB response /lookups/branches was just fixed
  // for. The largest group holds 52.
  const { service, calls } = await withUserService({ getAssignableBranches: noRows });

  const error = await captureThrown(() => service.getAssignableBranches(ADMIN, undefined));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /name a group/i);
  assert.equal(calls.length, 0);
});

test("a superadmin naming a group passes no user code at all", async () => {
  const { service, calls } = await withUserService({ getAssignableBranches: noRows });

  await service.getAssignableBranches(ADMIN, "5");

  assert.deepEqual(calls.find((c) => c.name === "getAssignableBranches").args, [null, 5]);
});

test("a junk groupCode is refused before it reaches sql.Int", async () => {
  for (const junk of ["abc", "0", "-1", "1.5"]) {
    const { service } = await withUserService({ getAssignableBranches: noRows });

    const error = await captureThrown(() => service.getAssignableBranches(ASH, junk));

    assert.equal(error?.statusCode, 400, junk);
  }
});

test("the two static reads are declared above the first /:userId route", async () => {
  // /users/scope and /users/assignable-branches are static paths under a router
  // that also declares /:userId/... . Declared below it, they bind
  // :userId = "scope" and surface as 400 "invalid GUID" rather than 404 -- which
  // sends a frontend developer looking in their own code. It has happened twice,
  // with /referrals/notifications and /referrals/plans.
  const source = await readFile(
    new URL("../src/routes/userRoutes.js", import.meta.url),
    "utf8",
  );

  const firstParam = source.indexOf("'/:userId");

  assert.ok(firstParam > 0);
  for (const path of ["'/scope'", "'/assignable-branches'"]) {
    assert.ok(source.indexOf(path) > 0, path);
    assert.ok(source.indexOf(path) < firstParam, path);
  }
});

const captureQuery = async (call) => {
  const { model, queries, inputs } = await captureSql(USER_MODEL);
  await call(model);
  restoreSqlCapture();

  return { query: queries[0], inputs };
};

test("a cluster is joined on its group as well as its code", async () => {
  // 31 branches carry a ClusterCode belonging to another group, and
  // area_sales_head_areas.ClusterCode is backfilled with clusters outside the
  // head's group. banc.clusters runs 1-33, so a join on the code alone resolves
  // and returns a plausible wrong name -- Ortigas reading as a Pampanga cluster.
  // Joining on both columns makes a mismatch read as null, which is true.
  for (const build of [
    (model) => model.getBranchScope(71).run(),
    (model) => model.getAccountOfficerBranchScope("PHL-AO-1168").run(),
    (model) => model.getAreaSalesHeadScope("PHL-ASH-0005").run(),
    (model) => model.getAssignableBranches("PHL-ASH-0005", 1).run(),
  ]) {
    const { query } = await captureQuery(build);

    assert.match(query, /JOIN banc\.clusters c ON c\.ClusterCode = \w+\.ClusterCode AND c\.GroupCode = \w+\.GroupCode/i);
  }
});

test("the cluster code is selected from the join, so it nulls with its own name", async () => {
  // Found by Adrian on 2026-08-27, running GET /users/scope as PHL-ASH-0005:
  // clusterCode came back 1 with clusterName null. The name nulled because the
  // join carries GroupCode, but the code was read straight off the junction row,
  // where it is 1 -- Quezon City District, a group 1 cluster, on a head that
  // holds group 5. A client resolving that code against a cluster lookup gets a
  // real name back for a cluster this head does not hold, which is the plausible
  // wrong answer the double-column join exists to prevent.
  //
  // Selecting c.ClusterCode makes the pair null together: no cluster for this
  // group means no cluster, not somebody else's.
  const selectClause = (text) => text.match(/SELECT([\s\S]*?)\sFROM\s/i)[1];

  for (const build of [
    (model) => model.getBranchScope(71).run(),
    (model) => model.getAccountOfficerBranchScope("PHL-AO-0615").run(),
    (model) => model.getAreaSalesHeadScope("PHL-ASH-0005").run(),
    (model) => model.getAssignableBranches("PHL-ASH-0005", 5).run(),
  ]) {
    const { query } = await captureQuery(build);
    const selected = selectClause(query);

    assert.match(selected, /c\.ClusterCode/);
    assert.doesNotMatch(selected, /[ab]\.ClusterCode/);
  }
});

test("the region comes from group_areas, never from the junction's copy", async () => {
  // regional_sales_head_areas carries its own RegionCode, written by the PUT
  // from group_areas. Reading the copy would let the two disagree; group_areas
  // is where the structural fact lives.
  const { query } = await captureQuery((model) =>
    model.getRegionalSalesHeadScope("PHL-RSH-0002").run(),
  );

  assert.match(query, /INNER JOIN banc\.group_areas g ON g\.GroupCode = rsa\.GroupCode/i);
  assert.match(query, /LEFT JOIN banc\.regions r ON r\.RegionCode = g\.RegionCode/i);
  assert.doesNotMatch(query, /rsa\.RegionCode/i);
});

test("assignable branches bind both filters and scope by EXISTS, not a join", async () => {
  // An INNER JOIN to area_sales_head_areas would repeat a branch once per
  // matching junction row. Two Area Sales Heads already hold group 1.
  const { query, inputs } = await captureQuery((model) =>
    model.getAssignableBranches("PHL-ASH-0005", 5).run(),
  );

  assert.match(query, /EXISTS \(/i);
  assert.match(query, /@UserCode IS NULL OR EXISTS/i);
  assert.match(query, /@GroupCode IS NULL OR b\.GroupCode = @GroupCode/i);
  assert.deepEqual(inputs, [
    { name: "UserCode", value: "PHL-ASH-0005" },
    { name: "GroupCode", value: 5 },
  ]);
});

test("the scope reads bind their key and never write it into the SQL", async () => {
  const injection = "PHL-ASH-0005'; DROP TABLE banc.Users; --";

  for (const build of [
    (model) => model.getAreaSalesHeadScope(injection).run(),
    (model) => model.getRegionalSalesHeadScope(injection).run(),
    (model) => model.getAccountOfficerBranchScope(injection).run(),
  ]) {
    const { query, inputs } = await captureQuery(build);

    assert.doesNotMatch(query, /DROP TABLE/i);
    assert.equal(inputs.find((i) => i.name === "UserCode").value, injection);
  }
});
