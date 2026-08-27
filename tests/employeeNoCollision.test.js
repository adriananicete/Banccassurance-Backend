import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { ACCOUNT_OFFICER } from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const fields = (overrides) => ({
  firstName: "Test",
  lastName: "Officer",
  birthday: "1990-01-15",
  email: "collision@example.com",
  mobileNumber: "09171116677",
  position: "Account Officer",
  employeeNo: "PHL-AO-0700",
  role: ACCOUNT_OFFICER,
  groupCode: 1,
  ...overrides,
});

const model = (overrides) => ({
  getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-0005" }),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: rows({
    Success: 1,
    Message: "User registered successfully.",
    UserCode: "PHL-AO-0701",
  }),
  assignAreaSalesHeadArea: () => ({ run: async () => ({ recordset: [] }) }),
  ...overrides,
});

const build = async (employeeNo) => {
  const { model: userModel, queries, inputs } = await captureSql(USER_MODEL);
  await userModel.checkEmployeeNoExists(employeeNo).run();
  restoreSqlCapture();

  return { query: queries[0], inputs };
};

test("the check reads UserCode as well as EmployeeNo", async () => {
  // Login resolves an identifier by UserCode first, then Email, then EmployeeNo
  // (DBA item 31). All three are unique-constrained, so the only collision left
  // is one person's employee number equal to another person's user code -- and
  // this check read EmployeeNo alone, so it let that through. The seed makes it
  // easy to hit: every seeded row carries EmployeeNo equal to its own UserCode,
  // so typing a real user code into the employee number field is enough.
  const { query } = await build("PHL-AO-0700");

  assert.match(query, /EmployeeNo\s*=\s*@EmployeeNo/i);
  assert.match(query, /UserCode\s*=\s*@EmployeeNo/i);
  assert.match(query, /FROM banc\.Users/i);
});

test("one parameter is bound, and the value is never written into the SQL", async () => {
  const injection = "TEST-01'; DROP TABLE banc.Users; --";
  const { query, inputs } = await build(injection);

  assert.doesNotMatch(query, /DROP TABLE/i);
  assert.deepEqual(inputs, [{ name: "EmployeeNo", value: injection }]);
});

test("two matching rows resolve to one, and the employee number wins", async () => {
  // Both arms can match at once: this user's employee number is taken by A while
  // the same string is B's user code. Without TOP 1 the service reads
  // recordset[0] of an unordered result, so the message would depend on the plan.
  // The employee-number match is the one to report -- it is the field the person
  // filled in.
  const { query } = await build("PHL-AO-0700");

  assert.match(query, /SELECT\s+TOP 1/i);
  assert.match(query, /ORDER BY CASE WHEN EmployeeNo = @EmployeeNo THEN 0 ELSE 1 END/i);
});

test("a taken employee number keeps the message it always had", async () => {
  // Adrian's Postman cases assert this wording. The new arm is a different
  // message; this one must not move.
  const { service } = await withUserService(
    model({ checkEmployeeNoExists: rows({ MatchedOn: "EMPLOYEE_NO" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.equal(error.message, "Employee number already registered");
});

test("an employee number that is somebody's user code says so instead", async () => {
  // "Employee number already registered" would be wrong here and would send the
  // person looking for a duplicate registration that does not exist.
  const { service } = await withUserService(
    model({ checkEmployeeNoExists: rows({ MatchedOn: "USER_CODE" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /user code/i);
});

test("neither collision writes a user row", async () => {
  for (const matchedOn of ["EMPLOYEE_NO", "USER_CODE"]) {
    const { service, calls } = await withUserService(
      model({ checkEmployeeNoExists: rows({ MatchedOn: matchedOn }) }),
    );

    await captureThrown(() => service.register(fields()));

    assert.equal(
      calls.some((c) => c.name === "checkOrRegisterUser"),
      false,
      matchedOn,
    );
  }
});

test("a free employee number still registers", async () => {
  const { service } = await withUserService(model());

  const result = await service.register(fields());

  assert.equal(result.success, true);
  assert.equal(result.userCode, "PHL-AO-0701");
});

test("a row with no MatchedOn is still a refusal", async () => {
  // Defensive: the column comes from the query above, so it is always present.
  // A refusal must never depend on reading it -- length > 0 is what refuses, and
  // MatchedOn only chooses the wording.
  const { service } = await withUserService(
    model({ checkEmployeeNoExists: rows({ EmployeeNo: "TEST-AO-01" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /already registered/i);
});
