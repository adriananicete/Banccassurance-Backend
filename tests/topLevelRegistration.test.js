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

// Total 0 is "the seat is free". Both top roles are capped at one since
// 2026-08-27, so every case here would otherwise refuse with 409 before it
// reached the behaviour it is testing. registrationCaps.test.js owns the cap
// itself.
const seatFree = rows({ Total: 0 });

const selfRegisterPath = (overrides) => ({
  countUsersByRole: seatFree,
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
  for (const key of ["groupCode", "branchCode"]) {
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
  countUsersByRole: seatFree,
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
  // register throws on a refusal since 2026-08-25, so createTopLevelUser no
  // longer needs its own success check - the throw is what stops it. The
  // guarantee is unchanged and matters more than the mechanism: approving a
  // UserId that was never created would approve somebody else's account.
  const { service, calls } = await withUserService(
    createPath({
      checkOrRegisterUser: rows({ Success: 0, Message: "Email is already registered." }),
    }),
  );

  const error = await captureThrown(() => service.createTopLevelUser(ADMIN, fields()));

  assert.equal(error?.statusCode, 409);
  assert.equal(calls.some((c) => c.name === "approveRejectUser"), false);
});

// createTopLevelUser is three writes and no transaction. Collapsing it into one
// was considered on 2026-09-09 and dropped: usp_ins_register_user takes
// @IsActive, so an insert-already-approved is possible, but it does not mint the
// AgentCode -- and AgentCode == null is exactly what the REACTIVATE guard reads
// as "rejected at registration, never approved". A one-write create would make
// an active Sector Head that could never be reactivated after a deactivation.
//
// Not worth a DBA change for an endpoint that runs about twice in the system's
// lifetime -- there is one Sector Head and one Department Head, capped. What is
// worth having is the failure saying what happened, which is what these two
// cover.

test("an approval that fails still names the account it left pending", async () => {
  // The half that was missing. A failure here leaves a PENDING top-level account
  // holding the single seat for its role, so the next attempt answers 409 "the
  // role is limited to 1 account" -- and without the user code in this message
  // there is nothing pointing at the row that has to be approved or deleted.
  const { service } = await withUserService(
    createPath({
      approveRejectUser: () => ({
        run: async () => {
          throw new Error("deadlock victim");
        },
      }),
    }),
  );

  const error = await captureThrown(() => service.createTopLevelUser(ADMIN, fields()));

  assert.equal(error?.statusCode, 500);
  assert.match(error.message, /USR-SEC-0002/);
  assert.match(error.message, /approvals list/i);
});

test("a lookup that finds nothing gives the same answer as an approval that throws", async () => {
  // Two different failures, one recovery. They used to read differently, and the
  // one that threw did not identify the account at all.
  const { service } = await withUserService(createPath({ findUserIdByCode: noRows }));

  const error = await captureThrown(() => service.createTopLevelUser(ADMIN, fields()));

  assert.equal(error?.statusCode, 500);
  assert.match(error.message, /USR-SEC-0002/);
  assert.match(error.message, /approvals list/i);
});
