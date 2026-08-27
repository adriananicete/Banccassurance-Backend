import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { ACCOUNT_OFFICER, BRANCH_HEAD, GROUP_HEAD } from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const fields = (overrides) => ({
  firstName: "Test",
  lastName: "Head",
  birthday: "1980-03-02",
  email: "test.grouphead@example.com",
  mobileNumber: "09171234600",
  employeeNo: "TEST-GRH-01",
  role: GROUP_HEAD,
  groupCode: 1,
  ...overrides,
});

const model = (overrides) => ({
  checkGroupHeadExists: noRows,
  getSectorHead: rows({ UserCode: "USR-SEC-0029" }),
  getGroupHeadByArea: rows({ UserCode: "USR-GRH-0031" }),
  getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-0005" }),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: rows({
    Success: 1,
    Message: "User registered successfully.",
    UserCode: "USR-GRH-00002",
  }),
  ...overrides,
});

test("a group that already has a Group Head refuses the next one", async () => {
  const { service } = await withUserService(
    model({ checkGroupHeadExists: rows({ UserCode: "USR-GRH-0031" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /already has a Group Head/i);
});

test("the refusal does not name the account holding it", async () => {
  // POST /users/register takes no session, so anyone can send a groupCode and
  // read the answer. Naming the incumbent would hand an unauthenticated caller
  // a real UserCode, and a UserCode is one of the three login identifiers.
  const { service } = await withUserService(
    model({ checkGroupHeadExists: rows({ UserCode: "USR-GRH-0031" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.doesNotMatch(error.message, /USR-GRH-0031/);
});

test("a free group still accepts its first Group Head", async () => {
  const { service } = await withUserService(model());

  const result = await service.register(fields());

  assert.equal(result.success, true);
  assert.equal(result.userCode, "USR-GRH-00002");
});

test("the group is checked, not just the role", async () => {
  const { service, calls } = await withUserService(model());

  await service.register(fields({ groupCode: 9 }));

  assert.deepEqual(calls.find((c) => c.name === "checkGroupHeadExists").args, [9]);
});

test("no other role is checked against it", async () => {
  // Only the Group Head is one-per-group. A group holds 52 branches and many
  // Account Officers, and an Area Sales Head may hold several groups at all -
  // running this check for them would refuse legitimate registrations.
  for (const role of [ACCOUNT_OFFICER, BRANCH_HEAD]) {
    const { service, calls } = await withUserService(model());

    await captureThrown(() =>
      service.register(fields({ role, groupCode: 1, branchCode: role === BRANCH_HEAD ? 255 : undefined })),
    );

    assert.equal(
      calls.some((c) => c.name === "checkGroupHeadExists"),
      false,
      role,
    );
  }
});

test("nothing is written and no approver is looked up when it refuses", async () => {
  // Same ordering as the caps and the approver lookup: a refused registration
  // must not consume the email or the employee number, and must not notify a
  // Sector Head about an account that was never created.
  const { service, calls } = await withUserService(
    model({ checkGroupHeadExists: rows({ UserCode: "USR-GRH-0031" }) }),
  );

  await captureThrown(() => service.register(fields()));

  assert.equal(calls.some((c) => c.name === "checkOrRegisterUser"), false);
  assert.equal(calls.some((c) => c.name === "getSectorHead"), false);
  assert.equal(calls.some((c) => c.name === "checkEmployeeNoExists"), false);
});

test("the field rules still answer first", async () => {
  // A GROUP_HEAD sending no group would otherwise reach the query with NULL.
  const { service, calls } = await withUserService(model());

  const error = await captureThrown(() =>
    service.register(fields({ groupCode: undefined })),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /group is required/i);
  assert.equal(calls.some((c) => c.name === "checkGroupHeadExists"), false);
});

test("a pending Group Head holds the group; a rejected one frees it", async () => {
  // IsActive is SMALLINT: 1 approved, 0 pending, -1 rejected.
  //
  // Counting only the approved would let a queue build against one group that
  // can never all be approved, each entry holding an email and an employee
  // number permanently. Counting the rejected too would leave a group with no
  // way back except a database edit.
  //
  // getGroupHeadByArea next door filters IsActive = 1 and is deliberately left
  // alone - that one finds an approver, and a pending head cannot approve.
  const { model: userModel, queries, inputs } = await captureSql(USER_MODEL);

  await userModel.checkGroupHeadExists(1).run();
  restoreSqlCapture();

  assert.match(queries[0], /Role = 'GROUP_HEAD'/i);
  assert.match(queries[0], /IsActive\s*>=\s*0/i);
  assert.doesNotMatch(queries[0], /IsActive\s*=\s*1/i);
  assert.deepEqual(inputs, [{ name: "GroupCode", value: 1 }]);
});

test("junk falls back rather than reaching sql.Int", async () => {
  // asInt returns NaN for junk, not null, so binding it directly is EPARAM
  // before the query is even sent - a 500. The guard is Number.isFinite, the
  // same one getBranches uses two hundred lines up.
  //
  // groupCode arrives from an unauthenticated registration body, so junk is
  // reachable by anyone.
  for (const junk of ["abc", "5; DROP TABLE banc.Users", "NaN", "", null, undefined]) {
    const { model: userModel, queries, inputs } = await captureSql(USER_MODEL);

    await userModel.checkGroupHeadExists(junk).run();
    restoreSqlCapture();

    assert.doesNotMatch(queries[0], /DROP TABLE/i, String(junk));
    assert.equal(inputs.find((i) => i.name === "GroupCode").value, null, String(junk));
  }
});

test("a numeric string arrives as a number", async () => {
  const { model: userModel, inputs } = await captureSql(USER_MODEL);

  await userModel.checkGroupHeadExists("9").run();
  restoreSqlCapture();

  assert.equal(inputs.find((i) => i.name === "GroupCode").value, 9);
  assert.equal(typeof inputs.find((i) => i.name === "GroupCode").value, "number");
});
