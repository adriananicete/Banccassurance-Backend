import test from "node:test";
import assert from "node:assert/strict";
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
  getUnknownAreas: noRows,
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

test("an empty set is accepted for branches and for groups", async () => {
  const branches = await withUserService(branchesModel());
  const cleared = await branches.service.replaceAccountOfficerBranches(ash, 1784, []);
  assert.deepEqual(cleared.data.branchCodes, []);

  const groups = await withUserService(groupsModel());
  const emptied = await groups.service.replaceRegionalSalesHeadAreas(dh, 1784, []);
  assert.deepEqual(emptied.data.groupCodes, []);
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

test("the Department Head assigns groups with no scope check of their own", async () => {
  const { service, calls } = await withUserService(groupsModel());
  await service.replaceRegionalSalesHeadAreas(dh, 1784, [1, 2, 3]);

  // No `record` at the end any more -- the audit row is written inside
  // replaceRegionalSalesHeadAreas, on its transaction.
  assert.deepEqual(calls.map((call) => call.name), [
    "getUserScopeById",
    "getUnknownAreas",
    "replaceRegionalSalesHeadAreas",
  ]);
});

test("a group code that does not exist is a 400, not a 403", async () => {
  const { service } = await withUserService(
    groupsModel({ getUnknownAreas: rows({ GroupCode: 99 }) }),
  );

  const error = await captureThrown(() =>
    service.replaceRegionalSalesHeadAreas(dh, 1784, [1, 99]),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /99/);
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
