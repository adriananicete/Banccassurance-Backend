import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  DEPARTMENT_HEAD,
  landBankRoles,
  philLifeRoles,
  SECTOR_HEAD,
  SUPERADMIN,
  topLevelRoles,
} from "../src/utils/constant.js";

const ADMIN = { UserCode: "SYS-ADM-0001", UserId: 9001, Role: SUPERADMIN };

const fields = (overrides) => ({
  firstName: "Top",
  middleName: null,
  lastName: "Person",
  suffix: null,
  birthday: "1975-01-01",
  email: "top@example.com",
  mobileNumber: "09171234599",
  position: "Sector Head",
  role: SECTOR_HEAD,
  employeeNo: "TEST-SEC-01",
  ...overrides,
});

const registered = (userCode) =>
  rows({ Success: 1, Message: "User registered successfully.", UserCode: userCode });

const superadmins = (...codes) => rows(...codes.map((UserCode) => ({ UserCode })));

const selfRegisterPath = (overrides) => ({
  getSuperadmins: superadmins("SYS-ADM-0001"),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: registered("USR-SEC-0002"),
  ...overrides,
});

test("the two top roles are self-registerable now; SUPERADMIN still is not", async () => {
  assert.equal(landBankRoles.includes(SECTOR_HEAD), true);
  assert.equal(philLifeRoles.includes(DEPARTMENT_HEAD), true);

  // The one account that must stay a seeded row -- nobody exists to approve the
  // first superadmin, so letting it self-register would create an account that
  // can never be activated, or worse, a way to mint one.
  assert.equal(landBankRoles.includes(SUPERADMIN), false);
  assert.equal(philLifeRoles.includes(SUPERADMIN), false);

  // The two lists stay disjoint: one role belongs to one tenant.
  for (const role of landBankRoles) {
    assert.equal(philLifeRoles.includes(role), false, role);
  }
  assert.deepEqual(topLevelRoles, [SECTOR_HEAD, DEPARTMENT_HEAD]);
});

test("a Sector Head registering is routed to the superadmins for approval", async () => {
  const { service, calls } = await withUserService(selfRegisterPath());

  const result = await service.register(fields());

  assert.equal(result.success, true);
  assert.equal(result.userCode, "USR-SEC-0002");
  assert.equal(calls.some((c) => c.name === "getSuperadmins"), true);
  assert.equal(calls.some((c) => c.name === "getDepartmentHead"), false);
});

test("a Department Head registering is routed the same way", async () => {
  const { service, calls } = await withUserService(
    selfRegisterPath({ checkOrRegisterUser: registered("PHL-DH-0002") }),
  );

  const result = await service.register(
    fields({ role: DEPARTMENT_HEAD, position: "Department Head" }),
  );

  assert.equal(result.success, true);
  assert.equal(calls.some((c) => c.name === "getSuperadmins"), true);
});

test("every superadmin is notified, not just the first", async () => {
  // Same rule as every other approver lookup: loop the recordset. TOP 1 here
  // silently leaves the second superadmin unaware of a pending top-level account.
  const notified = [];
  const { service } = await withUserService(
    selfRegisterPath({ getSuperadmins: superadmins("SYS-ADM-0001", "SYS-ADM-0002") }),
    { notifications: { safeNotify: async (code) => notified.push(code) } },
  );

  await service.register(fields());

  assert.deepEqual(notified, ["SYS-ADM-0001", "SYS-ADM-0002"]);
});

test("no active superadmin refuses the registration and writes no user row", async () => {
  // The same ordering that protects every other role: the approver lookup runs
  // before the insert, so a person cannot be stranded holding a taken employee
  // number with nobody able to approve them.
  const { service, calls } = await withUserService(
    selfRegisterPath({ getSuperadmins: noRows }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /superadmin/i);
  assert.equal(calls.some((c) => c.name === "checkOrRegisterUser"), false);
});

test("the top roles pick neither a branch nor a group", async () => {
  for (const key of ["areaCode", "branchCode"]) {
    const { service } = await withUserService(selfRegisterPath());

    const error = await captureThrown(() => service.register(fields({ [key]: 5 })));

    assert.equal(error?.statusCode, 400, key);
    assert.match(error.message, /not selected at registration/i, key);
  }
});

test("a registration body cannot promote itself to a superadmin creation", async () => {
  // createdBySuperadmin is a second parameter rather than a field for exactly
  // this reason. If it were read off `fields`, a public registration could send
  // it and skip the "is there an approver" guard entirely.
  const { service, calls } = await withUserService(
    selfRegisterPath({ getSuperadmins: noRows }),
  );

  const error = await captureThrown(() =>
    service.register(fields({ createdBySuperadmin: true })),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.some((c) => c.name === "checkOrRegisterUser"), false);
});

const createPath = (overrides) => ({
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: registered("USR-SEC-0002"),
  findUserIdByCode: rows({ UserId: 1790 }),
  approveRejectUser: rows({
    Success: 1,
    Message: "User approved successfully.",
    FirstName: "Top",
    Email: "top@example.com",
    UserCode: "USR-SEC-0002",
  }),
  ...overrides,
});

test("a superadmin creates a Sector Head that arrives already approved", async () => {
  const { service, calls } = await withUserService(createPath());

  const result = await service.createTopLevelUser(ADMIN, fields());

  assert.equal(result.success, true);
  assert.equal(result.userCode, "USR-SEC-0002");

  const names = calls.map((c) => c.name);
  assert.equal(names.includes("checkOrRegisterUser"), true);
  assert.equal(names.includes("approveRejectUser"), true);
  assert.deepEqual(calls.find((c) => c.name === "approveRejectUser").args, [1790, "APPROVE"]);
});

test("creating looks up no approver and tells nobody something is pending", async () => {
  // The creator is the approver and is approving in the same breath. A
  // "pending approval" notification here would describe a state that never
  // existed for longer than one round trip.
  const notified = [];
  const { service, calls } = await withUserService(createPath(), {
    notifications: { safeNotify: async (code) => notified.push(code) },
  });

  await service.createTopLevelUser(ADMIN, fields());

  assert.equal(calls.some((c) => c.name === "getSuperadmins"), false);
  assert.deepEqual(notified, []);
});

test("creating records USER_CREATED against the superadmin, not the new user", async () => {
  const recorded = [];
  const { service } = await withUserService(createPath(), {
    audit: { record: async (entry) => recorded.push(entry) },
  });

  await service.createTopLevelUser(ADMIN, fields());

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].actorUserCode, ADMIN.UserCode);
  assert.equal(recorded[0].action, "USER_CREATED");
  assert.equal(recorded[0].entityId, "USR-SEC-0002");
  assert.equal(recorded[0].detail, SECTOR_HEAD);
});

test("a superadmin may not create any role but the two top ones", async () => {
  for (const role of [ACCOUNT_OFFICER, SUPERADMIN]) {
    const { service, calls } = await withUserService(createPath());

    const error = await captureThrown(() =>
      service.createTopLevelUser(ADMIN, fields({ role })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /Sector Heads and Department Heads/i, role);
    assert.equal(calls.length, 0, `${role} must not be written`);
  }
});

test("a failed insert is not followed by an approval", async () => {
  const { service, calls } = await withUserService(
    createPath({
      checkOrRegisterUser: rows({ Success: 0, Message: "Email is already registered." }),
    }),
  );

  const result = await service.createTopLevelUser(ADMIN, fields());

  assert.equal(result.success, false);
  assert.equal(calls.some((c) => c.name === "approveRejectUser"), false);
});
