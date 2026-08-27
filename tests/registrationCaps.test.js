import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { roleCaps } from "../src/services/userService.js";
import {
  ACCOUNT_OFFICER,
  DEPARTMENT_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
  topLevelRoles,
} from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const ADMIN = { UserCode: "SYS-ADM-0001", UserId: 9001, Role: SUPERADMIN };

const fields = (overrides) => ({
  firstName: "Top",
  lastName: "Person",
  birthday: "1975-01-01",
  email: "top@example.com",
  mobileNumber: "09171234599",
  position: "Sector Head",
  employeeNo: "TEST-SEC-02",
  role: SECTOR_HEAD,
  ...overrides,
});

const model = (overrides) => ({
  countUsersByRole: rows({ Total: 0 }),
  getSuperadmins: rows({ UserCode: "SYS-ADM-0001" }),
  getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-0005" }),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: rows({
    Success: 1,
    Message: "User registered successfully.",
    UserCode: "USR-SEC-0623",
  }),
  findUserIdByCode: rows({ UserId: 1790 }),
  approveRejectUser: rows({
    Success: 1,
    Message: "User approved successfully.",
    FirstName: "Top",
    Email: "top@example.com",
    UserCode: "USR-SEC-0623",
  }),
  ...overrides,
});

const held = (total, overrides) =>
  model({ countUsersByRole: rows({ Total: total }), ...overrides });

test("the capped roles are exactly the two the establishment fixes at one", () => {
  // Assert the set, not one entry: a role missing from this object is capped by
  // nothing at all and throws no error to say so. REGIONAL_SALES_HEAD is
  // deliberately absent -- its max of 3 already lives in usp_ins_register_user,
  // and a second cap here would refuse with a different status than the
  // procedure does.
  assert.deepEqual(Object.keys(roleCaps).sort(), [DEPARTMENT_HEAD, SECTOR_HEAD].sort());
  assert.deepEqual(Object.keys(roleCaps).sort(), [...topLevelRoles].sort());
  assert.equal(Object.hasOwn(roleCaps, REGIONAL_SALES_HEAD), false);

  for (const role of Object.keys(roleCaps)) {
    assert.equal(roleCaps[role].limit, 1, role);
  }
});

test("a second Sector Head is refused with 409", async () => {
  const { service } = await withUserService(held(1));

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /Sector Head role is limited to 1 account/i);
});

test("a second Department Head is refused the same way", async () => {
  const { service } = await withUserService(held(1));

  const error = await captureThrown(() =>
    service.register(fields({ role: DEPARTMENT_HEAD, position: "Department Head" })),
  );

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /Department Head role is limited to 1 account/i);
});

test("the count is taken for the role being registered, not the caller's", async () => {
  const { service, calls } = await withUserService(held(0));

  await service.register(fields({ role: DEPARTMENT_HEAD }));

  assert.deepEqual(calls.find((c) => c.name === "countUsersByRole").args, [DEPARTMENT_HEAD]);
});

test("the first holder of a capped role still registers", async () => {
  // The cap is >= limit, not > limit. Off by one here refuses the very first
  // Sector Head, which is the account every Group Head registration needs.
  const { service } = await withUserService(held(0));

  const result = await service.register(fields());

  assert.equal(result.success, true);
  assert.equal(result.userCode, "USR-SEC-0623");
});

test("an uncapped role is never counted", async () => {
  // Six of the eight roles have no cap. Counting them would be a query per
  // registration that can only ever answer "allowed".
  const { service, calls } = await withUserService(
    held(99, { checkOrRegisterUser: rows({ Success: 1, Message: "ok", UserCode: "PHL-AO-0701" }) }),
  );

  await service.register(
    fields({ role: ACCOUNT_OFFICER, position: "Account Officer", groupCode: 1 }),
  );

  assert.equal(calls.some((c) => c.name === "countUsersByRole"), false);
});

test("nothing is written and no approver is looked up when the cap refuses", async () => {
  // Ordering, for the same reason the approver lookup runs before the insert: a
  // refused registration must not consume the email or the employee number, and
  // must not notify a superadmin about an account that was never created.
  const { service, calls } = await withUserService(held(1));

  await captureThrown(() => service.register(fields()));

  assert.equal(calls.some((c) => c.name === "checkOrRegisterUser"), false);
  assert.equal(calls.some((c) => c.name === "getSuperadmins"), false);
  assert.equal(calls.some((c) => c.name === "checkEmployeeNoExists"), false);
});

test("the role-specific field rules still answer first", async () => {
  // Deliberate ordering: the cap runs after the field rules, so a Sector Head
  // sent with a groupCode keeps the message it gave before this change.
  const { service } = await withUserService(held(1));

  const error = await captureThrown(() => service.register(fields({ groupCode: 5 })));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /not selected at registration/i);
});

test("the superadmin creation path is capped too", async () => {
  // createTopLevelUser goes through register(), so one check covers both doors.
  // Without it, POST /users mints top-level accounts the public path refuses.
  const { service, calls } = await withUserService(held(1));

  const error = await captureThrown(() => service.createTopLevelUser(ADMIN, fields()));

  assert.equal(error?.statusCode, 409);
  assert.equal(calls.some((c) => c.name === "checkOrRegisterUser"), false);
  assert.equal(calls.some((c) => c.name === "approveRejectUser"), false);
});

test("a missing count row reads as zero rather than throwing", async () => {
  // COUNT(*) always returns a row, so this is defensive -- but recordset[0] is
  // read for Total, and the same access on an empty recordset is what the branch
  // list had to be fixed for.
  const { service } = await withUserService(model({ countUsersByRole: noRows }));

  const result = await service.register(fields());

  assert.equal(result.success, true);
});

test("the count includes pending registrations and excludes rejected ones", async () => {
  // IsActive is SMALLINT: 1 approved, 0 pending, -1 rejected (DBA item 2).
  //
  // Counting only IsActive = 1 lets a queue of pending Sector Heads build that
  // can never all be approved, each one holding an email and an employee number
  // permanently. Counting -1 as well would make a rejected holder unreplaceable
  // without a database edit.
  const { model: userModel, queries, inputs } = await captureSql(USER_MODEL, [{ Total: 1 }]);

  await userModel.countUsersByRole(SECTOR_HEAD).run();
  restoreSqlCapture();

  assert.match(queries[0], /COUNT\(\*\)\s+AS\s+Total/i);
  assert.match(queries[0], /FROM banc\.Users/i);
  assert.match(queries[0], /IsActive\s*>=\s*0/i);
  assert.doesNotMatch(queries[0], /IsActive\s*=\s*1/i);
  assert.deepEqual(inputs, [{ name: "Role", value: SECTOR_HEAD }]);
});

test("the role reaches SQL as a parameter, never as text in the query", async () => {
  const injection = "SECTOR_HEAD'; DROP TABLE banc.Users; --";
  const { model: userModel, queries, inputs } = await captureSql(USER_MODEL, [{ Total: 0 }]);

  await userModel.countUsersByRole(injection).run();
  restoreSqlCapture();

  assert.doesNotMatch(queries[0], /DROP TABLE/i);
  assert.equal(inputs.find((i) => i.name === "Role").value, injection);
});
