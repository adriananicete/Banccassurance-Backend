import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import {
  AREA_SALES_HEAD,
  REGIONAL_SALES_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

// Settled by Adrian 2026-08-28, and it is two rules that read like one:
//
//   an Area Sales Head may hold several groups   -- yes, by design
//   a group may have several Area Sales Heads    -- no, never
//
// The first is why the assign endpoint keeps a groupCodes array. The second is
// what this file enforces. Getting only the first right is what the old
// "one ASH per group is the target, blocked on headcount" note in HIERARCHY.md
// was doing, and it left the second unguarded entirely.

const USER_MODEL = "../../src/models/userModel.js";

const RSH = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-00001" };
const ADMIN = { Role: SUPERADMIN, UserCode: "SYS-ADM-00001" };

const assignModel = (overrides) => ({
  getUserScopeById: target({ IsActive: 1, Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-00002" }),
  isAshInRegionalScope: rows({ InScope: 1 }),
  getAreasOutsideRegionalSalesHeadScope: noRows,
  getGroupsAssignedToOtherASH: noRows,
  getUnknownAreas: noRows,
  replaceAreaSalesHeadAreas: () => ({ run: async () => {} }),
  ...overrides,
});

test("a second Area Sales Head cannot register into a group that has one", async () => {
  // Registration is where an ASH claims their group -- assignAreaSalesHeadArea
  // writes the junction row immediately, so the guard has to be here and not
  // only on the assign endpoint.
  const { service } = await withUserService({
    checkAreaSalesHeadExists: rows({ UserCode: "PHL-ASH-00001" }),
    getRegionalSalesHeadByArea: rows({ UserCode: "PHL-RSH-00001" }),
    checkEmployeeNoExists: noRows,
    countUsersByRole: rows({ Total: 0 }),
  });

  const error = await captureThrown(() =>
    service.register({
      firstName: "Test", lastName: "ASH", birthday: "1980-01-01",
      email: "ash2@example.com", mobileNumber: "09171234567",
      employeeNo: "TEST-ASH-02", role: AREA_SALES_HEAD, groupCode: 1,
    }),
  );

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /already has an Area Sales Head/);
});

test("a group with no Area Sales Head accepts one", async () => {
  // Non-vacuous half: refusing every ASH registration would pass the test above
  // and close the role entirely.
  const { service, calls } = await withUserService({
    checkAreaSalesHeadExists: noRows,
    getRegionalSalesHeadByArea: rows({ UserCode: "PHL-RSH-00001" }),
    checkEmployeeNoExists: noRows,
    countUsersByRole: rows({ Total: 0 }),
    checkOrRegisterUser: rows({
      Success: 1, Message: "User registered successfully.", UserCode: "PHL-ASH-00002",
    }),
    assignAreaSalesHeadArea: () => ({ run: async () => {} }),
  });

  const result = await service.register({
    firstName: "Test", lastName: "ASH", birthday: "1980-01-01",
    email: "ash2@example.com", mobileNumber: "09171234567",
    employeeNo: "TEST-ASH-02", role: AREA_SALES_HEAD, groupCode: 1,
  });

  assert.equal(result.success, true);
  assert.equal(calls.some((c) => c.name === "assignAreaSalesHeadArea"), true);
});

test("assigning a group already held by another head is a 409", async () => {
  const { service } = await withUserService(
    assignModel({ getGroupsAssignedToOtherASH: rows({ GroupCode: 2 }, { GroupCode: 3 }) }),
  );

  const error = await captureThrown(() =>
    service.replaceAreaSalesHeadAreas(RSH, 1784, [1, 2, 3]),
  );

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /already held by another Area Sales Head/);
  assert.match(error.message, /2, 3/);
});

test("several groups on one head is accepted, which is the rule that is not symmetric", async () => {
  // The whole point of keeping the array. One head over three groups is a normal
  // arrangement; three heads over one group is not.
  const { service } = await withUserService(assignModel());

  const result = await service.replaceAreaSalesHeadAreas(RSH, 1784, [1, 2, 3]);

  assert.equal(result.success, true);
  assert.deepEqual(result.data.groupCodes, [1, 2, 3]);
});

test("a head keeping its own groups is not blocked by itself", async () => {
  // The query excludes the target: re-sending the same set on an edit must not
  // read the head's own rows as somebody else's claim.
  const { model, queries } = await captureSql(USER_MODEL);
  await model.getGroupsAssignedToOtherASH("PHL-ASH-00002", "1,2").run();
  restoreSqlCapture();

  assert.match(queries[0], /a\.UserCode <> @UserCode/i);
});

test("a rejected head does not keep hold of a group", async () => {
  // IsActive >= 0 counts approved and pending, and excludes rejected -- the same
  // window checkGroupHeadExists uses. A refused registration must not park a
  // group forever, and a pending one must still reserve it.
  const { model, queries } = await captureSql(USER_MODEL);

  await model.checkAreaSalesHeadExists(1).run();
  await model.getGroupsAssignedToOtherASH("PHL-ASH-00002", "1").run();

  restoreSqlCapture();

  for (const query of queries) {
    assert.match(query, /u\.IsActive >= 0/i);
  }
});

test("the superadmin is bound by it too", async () => {
  // A superadmin skips the caller's own scope checks, because those are about
  // where the caller may reach. This is a rule about the data, and nobody is
  // above it.
  const { service } = await withUserService(
    assignModel({ getGroupsAssignedToOtherASH: rows({ GroupCode: 1 }) }),
  );

  const error = await captureThrown(() =>
    service.replaceAreaSalesHeadAreas(ADMIN, 1784, [1]),
  );

  assert.equal(error?.statusCode, 409);
});
