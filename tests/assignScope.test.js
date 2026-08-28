import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scopeHit, scopeMiss, rows } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  DEPARTMENT_HEAD,
  REGIONAL_SALES_HEAD,
} from "../src/utils/constant.js";

const ash = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167" };
const rsh = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" };
const dh = { Role: DEPARTMENT_HEAD, UserCode: "PHL-DH-0001" };

const replaced = () => ({ run: async () => {} });

const branchesModel = (overrides) => ({
  getUserScopeById: target({ IsActive: true, Role: ACCOUNT_OFFICER }),
  isAreaInAreaSalesHeadScope: scopeHit,
  getBranchesOutsideAreaSalesHeadScope: noRows,
  getBranchesAssignedToOtherAO: noRows,
  replaceAccountOfficerBranches: replaced,
  ...overrides,
});

const areasModel = (overrides) => ({
  getUserScopeById: target({ IsActive: true, Role: AREA_SALES_HEAD }),
  isAshInRegionalScope: scopeHit,
  getAreasOutsideRegionalSalesHeadScope: noRows,
  replaceAreaSalesHeadAreas: replaced,
  ...overrides,
});

const groupsModel = (overrides) => ({
  getUserScopeById: target({ IsActive: true, Role: REGIONAL_SALES_HEAD }),
  getGroupsInRegion: rows(
    { GroupCode: 1, GroupName: "CENTRAL NCR", RegionCode: 1, RegionName: "NCR" },
    { GroupCode: 2, GroupName: "NORTH NCR", RegionCode: 1, RegionName: "NCR" },
    { GroupCode: 3, GroupName: "SOUTH NCR", RegionCode: 1, RegionName: "NCR" },
  ),
  replaceRegionalSalesHeadAreas: replaced,
  ...overrides,
});

test("an empty set is refused for areas alone, and the message says why", async () => {
  const { service } = await withUserService(areasModel());
  const error = await captureThrown(() =>
    service.replaceAreaSalesHeadAreas(rsh, 1784, []),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /at least one group/i);
  assert.match(error.message, /deactivate/i);
});

test("an empty set is accepted for branches", async () => {
  // Clearing an Account Officer's branches is a real operation -- somebody is
  // moving, and their branches go to whoever takes over.
  const branches = await withUserService(branchesModel());
  const cleared = await branches.service.replaceAccountOfficerBranches(ash, 1784, []);

  assert.deepEqual(cleared.data.branchCodes, []);
});

test("a region holding no groups is refused rather than clearing the head's scope", async () => {
  // Changed 2026-08-28 with the move to assigning by region. There is no empty
  // set to send any more -- a region either has groups or it does not.
  //
  // ⚠️ An empty result here is almost never "this region is empty on purpose".
  // group_areas.RegionCode is still nullable (DBA A13), so a group seeded
  // without a region belongs to no region at all and silently drops out. A 200
  // would tell the Department Head the assignment worked while the head held
  // nothing, and that surfaces two people away: the next Area Sales Head to
  // register into one of those groups gets "No Regional Sales Head is assigned",
  // which is how groups 7, 8 and 9 went unnoticed on 2026-08-27.
  const { service, calls } = await withUserService(
    groupsModel({ getGroupsInRegion: noRows }),
  );

  const error = await captureThrown(() =>
    service.replaceRegionalSalesHeadAreas(dh, 1784, 9),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /no groups/i);
  assert.match(error.message, /RegionCode/);
  assert.equal(calls.some((c) => c.name === "replaceRegionalSalesHeadAreas"), false);
});

test("a non-numeric region is refused before the target is looked up", async () => {
  // asInt turns "abc" into NaN and sql.Int refuses NaN before the query is sent,
  // which is the EPARAM 500 that PR #116 took out of registration.
  const { service, calls } = await withUserService(groupsModel());

  const error = await captureThrown(() =>
    service.replaceRegionalSalesHeadAreas(dh, 1784, "abc"),
  );

  assert.equal(error?.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("the empty-areas refusal happens before the target is even looked up", async () => {
  const { service, calls } = await withUserService(areasModel());
  await captureThrown(() => service.replaceAreaSalesHeadAreas(rsh, 999999, []));

  assert.deepEqual(calls, []);
});

test("a target that is not approved cannot be given scope, whichever shape IsActive takes", async () => {
  for (const notApproved of [false, 0, -1, null, undefined]) {
    const { service } = await withUserService(
      branchesModel({ getUserScopeById: target({ IsActive: notApproved, Role: ACCOUNT_OFFICER }) }),
    );

    const error = await captureThrown(() =>
      service.replaceAccountOfficerBranches(ash, 1784, [40]),
    );
    assert.equal(error?.statusCode, 400, `IsActive ${JSON.stringify(notApproved)}`);
    assert.match(error.message, /not been approved/i);
  }
});

test("an approved target is accepted whether the driver returns true or 1", async () => {
  for (const isApproved of [true, 1]) {
    const { service } = await withUserService(
      branchesModel({ getUserScopeById: target({ IsActive: isApproved, Role: ACCOUNT_OFFICER }) }),
    );

    const result = await service.replaceAccountOfficerBranches(ash, 1784, [40]);
    assert.equal(result.success, true, `IsActive ${JSON.stringify(isApproved)}`);
  }
});

test("codes are deduplicated and normalised before they reach SQL", async () => {
  const { service, calls } = await withUserService(branchesModel());
  const result = await service.replaceAccountOfficerBranches(ash, 1784, [40, "41", 40, 41, 43]);

  assert.deepEqual(result.data.branchCodes, [40, 41, 43]);

  const args = calls.find((call) => call.name === "replaceAccountOfficerBranches").args;
  assert.deepEqual(args.slice(0, 2), ["PHL-AO-1168", "40,41,43"]);
  // Third argument is the audit entry, written on the same transaction.
  assert.equal(args[2].action, "BRANCHES_ASSIGNED");
});

test("a body that is not an array, or holds something that is not a whole number, is a 400", async () => {
  const cases = ["40,41", 40, null, [40, "abc"], [40, 1.5], [40, -1], [{}]];

  for (const branchCodes of cases) {
    const { service } = await withUserService(branchesModel());
    const error = await captureThrown(() =>
      service.replaceAccountOfficerBranches(ash, 1784, branchCodes),
    );
    assert.equal(error?.statusCode, 400, JSON.stringify(branchCodes));
  }
});

test("branches already held by another Account Officer are a 409 naming them", async () => {
  const { service } = await withUserService(
    branchesModel({ getBranchesAssignedToOtherAO: rows({ BranchCode: 58 }, { BranchCode: 59 }) }),
  );

  const error = await captureThrown(() =>
    service.replaceAccountOfficerBranches(ash, 1784, [58, 59]),
  );

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /58, 59/);
});

test("branches outside the caller's own groups are a 403 naming them", async () => {
  const { service } = await withUserService(
    branchesModel({
      getBranchesOutsideAreaSalesHeadScope: rows({ BranchCode: 999 }),
    }),
  );

  const error = await captureThrown(() =>
    service.replaceAccountOfficerBranches(ash, 1784, [999]),
  );

  assert.equal(error?.statusCode, 403);
  assert.match(error.message, /999/);
});

test("the scope conflict check runs before anything is written", async () => {
  const { service, calls } = await withUserService(
    branchesModel({ getBranchesAssignedToOtherAO: rows({ BranchCode: 58 }) }),
  );

  await captureThrown(() => service.replaceAccountOfficerBranches(ash, 1784, [58]));

  assert.equal(
    calls.some((call) => call.name === "replaceAccountOfficerBranches"),
    false,
  );
});

test("the assign routes are named for what they set, not for what they store", async () => {
  // The three PUTs were named a tier apart from what they do, a leftover of the
  // AreaCode -> GroupCode rename: /areas set groups, /groups set a region.
  // /:userId/region is the one that moved on 2026-08-28, so the path says what
  // the Department Head is choosing rather than what lands in the table.
  //
  // ⚠️ /areas still sets groups. Renaming it frees /groups for the Area Sales
  // Head's own groups, which is what a reader reaches for first -- not done, and
  // worth doing in the same frontend bundle rather than a second one.
  const source = await readFile(
    new URL("../src/routes/userRoutes.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /router\.put\('\/:userId\/region'/);
  assert.match(source, /router\.get\('\/:userId\/region'/);
  assert.doesNotMatch(source, /'\/:userId\/groups'/);
});

test("the Department Head names a region and holds every group in it", async () => {
  // The Department Head holds the whole tenant, so there is no scope of their
  // own to check against -- any region is theirs to assign.
  const { service, calls } = await withUserService(groupsModel());
  const result = await service.replaceRegionalSalesHeadAreas(dh, 1784, 1);

  // No `record` at the end -- the audit row is written inside
  // replaceRegionalSalesHeadAreas, on its transaction.
  assert.deepEqual(calls.map((call) => call.name), [
    "getUserScopeById",
    "getGroupsInRegion",
    "replaceRegionalSalesHeadAreas",
  ]);

  // The response says what the region expanded to. A caller that sent one
  // number and gets one number back has no way to see what it meant.
  assert.equal(result.data.regionCode, 1);
  assert.equal(result.data.regionName, "NCR");
  assert.deepEqual(result.data.groupCodes, [1, 2, 3]);
});

const heldRow = (overrides) => ({
  GroupCode: 1,
  GroupName: "CENTRAL NCR",
  RegionCode: 1,
  RegionName: "NCR",
  ...overrides,
});

test("the read hands back the region its PUT takes", async () => {
  // read -> edit -> write is the documented flow, so the GET has to return the
  // key the PUT expects. Since the PUT moved to regionCode, a screen handed only
  // groupCodes would have nothing to send back.
  const { service } = await withUserService(
    groupsModel({
      getRegionalSalesHeadScope: rows(heldRow(), heldRow({ GroupCode: 2, GroupName: "NORTH NCR" })),
    }),
  );

  const result = await service.getRegionalSalesHeadAreas(dh, 1784);

  assert.equal(result.data.regionCode, 1);
  assert.equal(result.data.regionName, "NCR");
  assert.deepEqual(result.data.groupCodes, [1, 2]);
});

test("a head whose groups straddle two regions reports no single region", async () => {
  // Unreachable through the PUT now, but older rows can hold it. Naming one of
  // the two would be a guess, and the screen would send that guess back and
  // silently move the head into that region alone.
  const { service } = await withUserService(
    groupsModel({
      getRegionalSalesHeadScope: rows(
        heldRow(),
        heldRow({ GroupCode: 4, GroupName: "BICOL", RegionCode: 2, RegionName: "Luzon" }),
      ),
    }),
  );

  const result = await service.getRegionalSalesHeadAreas(dh, 1784);

  assert.equal(result.data.regionCode, null);
  assert.equal(result.data.regionName, null);
  assert.deepEqual(result.data.groupCodes, [1, 4]);
});

test("the region reaches the write, not the groups it expanded to", async () => {
  // The expansion happens once, in SQL, inside the transaction. Passing the
  // group list down instead would mean the service read one set of groups and
  // the insert wrote another if group_areas changed between the two.
  const { service, calls } = await withUserService(groupsModel());
  await service.replaceRegionalSalesHeadAreas(dh, 1784, 1);

  const [, second] = calls.find(
    (c) => c.name === "replaceRegionalSalesHeadAreas",
  ).args;

  assert.equal(second, 1);
});

test("each assign endpoint refuses a target holding the wrong role", async () => {
  const wrong = [
    ["replaceAccountOfficerBranches", ash, branchesModel({ getUserScopeById: target({ IsActive: true, Role: AREA_SALES_HEAD }) })],
    ["replaceAreaSalesHeadAreas", rsh, areasModel({ getUserScopeById: target({ IsActive: true, Role: ACCOUNT_OFFICER }) })],
    ["replaceRegionalSalesHeadAreas", dh, groupsModel({ getUserScopeById: target({ IsActive: true, Role: ACCOUNT_OFFICER }) })],
  ];

  for (const [method, caller, model] of wrong) {
    const { service } = await withUserService(model);
    const error = await captureThrown(() => service[method](caller, 1784, [1]));
    assert.equal(error?.statusCode, 400, method);
  }
});

test("a non-numeric userId is a 404 and never reaches the database", async () => {
  const { service, calls } = await withUserService(branchesModel());
  const error = await captureThrown(() =>
    service.replaceAccountOfficerBranches(ash, "abc", [40]),
  );

  assert.equal(error?.statusCode, 404);
  assert.deepEqual(calls, []);
});
