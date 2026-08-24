import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
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
} from "../src/utils/constant.js";

const fields = (overrides) => ({
  firstName: "Test",
  middleName: "Dela",
  lastName: "Person",
  suffix: null,
  birthday: "1991-08-20",
  email: "candidate@example.com",
  mobileNumber: "09171234570",
  position: "Account Officer",
  role: ACCOUNT_OFFICER,
  areaCode: 5,
  branchCode: null,
  employeeNo: "TEST-AO-01",
  ...overrides,
});

const registered = rows({
  Success: 1,
  Message: "User registered successfully.",
  UserCode: "PHL-AO-1168",
});

const approverFound = rows({ UserCode: "PHL-ASH-1167" });

const happyPath = (overrides) => ({
  getAreaSalesHeadByArea: approverFound,
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: registered,
  ...overrides,
});

test("an unknown role is refused before anything is looked up", async () => {
  const { service, calls } = await withUserService(happyPath());
  const error = await captureThrown(() =>
    service.register(fields({ role: "SUPERADMIN" })),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /invalid role/i);
  assert.deepEqual(calls, []);
});

const belongsToAGroup = [ACCOUNT_OFFICER, AREA_SALES_HEAD, GROUP_HEAD];
const belongsToABranch = [BRANCH_STAFF, BRANCH_HEAD];
const belongsToNeither = [REGIONAL_SALES_HEAD, SECTOR_HEAD, DEPARTMENT_HEAD];

test("every self-registering role has a field rule", () => {
  // GROUP_HEAD had none. It matched no branch of the validation, so a
  // registration with no areaCode was accepted and produced a Group Head
  // belonging to no group - an account that can never approve anyone, because
  // getBranchHeadsForApproval filters on exactly the column left null. It shows
  // up as an empty list rather than an error. USR-GRH-0030 is that account.
  //
  // A missing rule cannot be caught by exercising the rules that exist, because
  // nothing throws and nothing fails. This asserts the set instead, so a role
  // added to landBankRoles or philLifeRoles without a rule fails here.
  assert.deepEqual(
    [...belongsToAGroup, ...belongsToABranch, ...belongsToNeither].sort(),
    [...landBankRoles, ...philLifeRoles].sort(),
  );
});

test("a role that belongs to a group is refused without one", async () => {
  for (const role of belongsToAGroup) {
    const { service } = await withUserService(happyPath());
    const error = await captureThrown(() =>
      service.register(fields({ role, areaCode: null, branchCode: null })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /group is required/i, role);
  }
});

test("a role that belongs to a group is refused a branch", async () => {
  for (const role of belongsToAGroup) {
    const { service } = await withUserService(happyPath());
    const error = await captureThrown(() =>
      service.register(fields({ role, areaCode: 5, branchCode: 58 })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /branch is not selected/i, role);
  }
});

test("no field rule runs before the role itself is checked", async () => {
  // An unknown role must be refused as an unknown role, not as a missing group.
  const { service } = await withUserService(happyPath());
  const error = await captureThrown(() =>
    service.register(fields({ role: "CLUSTER_HEAD", areaCode: null, branchCode: null })),
  );

  assert.match(error.message, /invalid role/i);
});

test("a Regional Sales Head registers with neither a group nor a branch", async () => {
  const model = happyPath({ getDepartmentHead: rows({ UserCode: "PHL-DH-0001" }) });

  for (const extra of [{ areaCode: 5 }, { branchCode: 58 }]) {
    const { service } = await withUserService(model);
    const error = await captureThrown(() =>
      service.register(fields({ role: REGIONAL_SALES_HEAD, areaCode: null, branchCode: null, ...extra })),
    );
    assert.equal(error?.statusCode, 400, JSON.stringify(extra));
  }

  const { service } = await withUserService(model);
  const result = await service.register(
    fields({ role: REGIONAL_SALES_HEAD, areaCode: null, branchCode: null }),
  );
  assert.equal(result.success, true);
});

test("Landbank field rules: staff and branch heads need a branch", async () => {
  for (const role of [BRANCH_STAFF, BRANCH_HEAD]) {
    const { service } = await withUserService(happyPath());
    const error = await captureThrown(() =>
      service.register(fields({ role, areaCode: null, branchCode: null })),
    );
    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /branch is required/i);
  }
});

test("each role is routed to its own approver lookup", async () => {
  const routes = [
    [BRANCH_STAFF, { branchCode: 58 }, "getBranchHeadByBranch"],
    [BRANCH_HEAD, { branchCode: 58, areaCode: 5 }, "getGroupHeadByArea"],
    [GROUP_HEAD, { areaCode: 5 }, "getSectorHead"],
    [ACCOUNT_OFFICER, { areaCode: 5 }, "getAreaSalesHeadByArea"],
    [AREA_SALES_HEAD, { areaCode: 5 }, "getRegionalSalesHeadByArea"],
    [REGIONAL_SALES_HEAD, { areaCode: null, branchCode: null }, "getDepartmentHead"],
  ];

  for (const [role, extra, expected] of routes) {
    const model = happyPath({
      getBranchHeadByBranch: approverFound,
      getGroupHeadByArea: approverFound,
      getSectorHead: approverFound,
      getAreaSalesHeadByArea: approverFound,
      getRegionalSalesHeadByArea: approverFound,
      getDepartmentHead: approverFound,
      assignAreaSalesHeadArea: () => ({ run: async () => {} }),
    });

    const { service, calls } = await withUserService(model);
    await service.register(fields({ role, areaCode: null, branchCode: null, ...extra }));

    const lookups = calls
      .map((call) => call.name)
      .filter((name) => name.startsWith("get") && name !== "getUserScopeById");

    assert.deepEqual(lookups, [expected], role);
  }
});

test("no approver means no user row, and the message names the missing role", async () => {
  const { service, calls } = await withUserService(
    happyPath({ getAreaSalesHeadByArea: noRows }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /no area sales head/i);
  assert.equal(
    calls.some((call) => call.name === "checkOrRegisterUser"),
    false,
    "the insert must not run when there is no approver",
  );
});

test("every approver is notified, not only the first", async () => {
  const { service, calls } = await withUserService(
    happyPath({
      getAreaSalesHeadByArea: rows(
        { UserCode: "PHL-ASH-1167" },
        { UserCode: "PHL-ASH-0001" },
      ),
    }),
  );

  await service.register(fields());

  const notified = calls
    .filter((call) => call.name === "safeNotify")
    .map((call) => call.args[0]);

  assert.deepEqual(notified, ["PHL-ASH-1167", "PHL-ASH-0001"]);
});

test("an Area Sales Head stores no AreaCode on the user row, and gets a junction row instead", async () => {
  const { service, calls } = await withUserService(
    happyPath({
      getRegionalSalesHeadByArea: approverFound,
      assignAreaSalesHeadArea: () => ({ run: async () => {} }),
    }),
  );

  await service.register(fields({ role: AREA_SALES_HEAD, areaCode: 5 }));

  const insert = calls.find((call) => call.name === "checkOrRegisterUser");
  assert.equal(insert.args[0].areaCode, null);

  assert.deepEqual(
    calls.find((call) => call.name === "assignAreaSalesHeadArea").args,
    ["PHL-AO-1168", 5],
  );
});

test("an Account Officer does store its AreaCode on the user row", async () => {
  const { service, calls } = await withUserService(happyPath());
  await service.register(fields({ role: ACCOUNT_OFFICER, areaCode: 5 }));

  const insert = calls.find((call) => call.name === "checkOrRegisterUser");
  assert.equal(insert.args[0].areaCode, 5);
});

test("a taken employee number answers success false rather than throwing", async () => {
  const { service, calls } = await withUserService(
    happyPath({ checkEmployeeNoExists: rows({ EmployeeNo: "TEST-AO-01" }) }),
  );

  const result = await service.register(fields());

  assert.equal(result.success, false);
  assert.match(result.message, /already registered/i);
  assert.equal(
    calls.some((call) => call.name === "checkOrRegisterUser"),
    false,
  );
});

test("a failing welcome email does not fail the registration", async () => {
  const { service } = await withUserService(happyPath(), {
    email: {
      sendWelcomeEmail: async () => {
        throw new Error("mailbox unavailable");
      },
    },
  });

  const result = await service.register(fields());
  assert.equal(result.success, true);
});

test("a failing notification does not fail the registration", async () => {
  const { service } = await withUserService(happyPath(), {
    notifications: {
      safeNotify: async () => {
        throw new Error("notification insert failed");
      },
    },
  });

  const result = await service.register(fields());
  assert.equal(result.success, true);
});

test("a rejected insert is reported without a userCode", async () => {
  const { service } = await withUserService(
    happyPath({
      checkOrRegisterUser: rows({ Success: 0, Message: "Email already registered" }),
    }),
  );

  const result = await service.register(fields());

  assert.equal(result.success, false);
  assert.equal(result.userCode, undefined);
});
