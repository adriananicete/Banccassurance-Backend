import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { registrationCodeFields } from "../src/services/userService.js";
import { asInt } from "../src/utils/sqlValue.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
} from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const fields = (overrides) => ({
  firstName: "Test",
  lastName: "Person",
  birthday: "1990-01-15",
  email: "junk@example.com",
  mobileNumber: "09171234611",
  employeeNo: "TEST-JUNK-01",
  role: ACCOUNT_OFFICER,
  groupCode: 5,
  ...overrides,
});

const model = () => ({
  getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-0005" }),
  getGroupHeadByArea: rows({ UserCode: "USR-GRH-0031" }),
  getBranchHeadByBranch: rows({ UserCode: "USR-BRH-0300" }),
  getRegionalSalesHeadByArea: rows({ UserCode: "PHL-RSH-0002" }),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: rows({
    Success: 1,
    Message: "User registered successfully.",
    UserCode: "PHL-AO-00003",
  }),
  assignAreaSalesHeadArea: () => ({ run: async () => ({ recordset: [] }) }),
});

test("asInt answers null for anything that is not a finite number", () => {
  // This is the whole defect in one assertion. asInt used to return the raw
  // Number(), which is NaN for junk - and NaN bound to sql.Int is EPARAM,
  // thrown by tedious *before* the query is sent, so it surfaces as a 500.
  //
  // Two call sites had already worked around it locally: getBranches guards
  // every binding with Number.isFinite, and getUsersForApproval writes
  // `asInt(x) ?? 1`, which does not help because NaN is not null.
  for (const junk of ["abc", "5; DROP TABLE banc.Users", "NaN", {}, [1, 2], Infinity]) {
    assert.equal(asInt(junk), null, JSON.stringify(junk));
  }

  assert.equal(asInt(""), null);
  assert.equal(asInt(null), null);
  assert.equal(asInt(undefined), null);
});

test("asInt still passes a real number through, string or not", () => {
  assert.equal(asInt(5), 5);
  assert.equal(asInt("5"), 5);
  assert.equal(asInt("0"), 0);
  assert.equal(asInt(-1), -1);
  assert.equal(asInt([5]), 5);
});

test("the two code fields are the set that gets checked", () => {
  // Assert the set: a code field missing from here is validated by nothing and
  // throws nothing to say so.
  assert.deepEqual(Object.keys(registrationCodeFields).sort(), ["branchCode", "groupCode"]);
});

test("a non-numeric groupCode is a 400 that says so, not a 500", async () => {
  // Reachable by anyone: POST /users/register takes no session. Before this,
  // BRANCH_HEAD, ACCOUNT_OFFICER and AREA_SALES_HEAD all reached a model that
  // bound NaN, and the caller got a 500 with no explanation.
  for (const junk of ["abc", "5; DROP TABLE banc.Users", "NaN", "1.5", "0", "-1"]) {
    const { service, calls } = await withUserService(model());

    const error = await captureThrown(() => service.register(fields({ groupCode: junk })));

    assert.equal(error?.statusCode, 400, junk);
    assert.match(error.message, /group must be a whole number/i, junk);
    assert.equal(calls.length, 0, `${junk} must reach no query at all`);
  }
});

test("a non-numeric branchCode is refused the same way", async () => {
  for (const junk of ["abc", "1.5", "0"]) {
    const { service } = await withUserService(model());

    const error = await captureThrown(() =>
      service.register(fields({ role: BRANCH_STAFF, groupCode: null, branchCode: junk })),
    );

    assert.equal(error?.statusCode, 400, junk);
    assert.match(error.message, /branch must be a whole number/i, junk);
  }
});

test("a numeric string is still accepted — the form sends strings", async () => {
  const { service } = await withUserService(model());

  const result = await service.register(fields({ groupCode: "5" }));

  assert.equal(result.success, true);
});

test("an absent code is not junk", async () => {
  // A role that must not send a group sends null, and that has to stay legal.
  for (const blank of [null, undefined, ""]) {
    const { service } = await withUserService(model());

    const error = await captureThrown(() =>
      service.register(fields({ role: BRANCH_STAFF, groupCode: blank, branchCode: 255 })),
    );

    assert.equal(error, null, String(blank));
  }
});

test("the role and field rules still answer before this one", async () => {
  // Ordering: a role sending a forbidden group gets the field-rule message, not
  // a lecture about whole numbers.
  const { service } = await withUserService(model());

  const error = await captureThrown(() =>
    service.register(fields({ role: ACCOUNT_OFFICER, groupCode: undefined })),
  );

  assert.match(error.message, /group is required/i);
});

const captureQuery = async (call) => {
  const { model: userModel, queries, inputs } = await captureSql(USER_MODEL);
  await call(userModel);
  restoreSqlCapture();

  return { query: queries[0], inputs };
};

test("every approver lookup binds a group through asInt, not Number", async () => {
  // These five reached sql.Int with a raw Number(). Registration is the caller
  // for the first three, and the value comes straight from an unauthenticated
  // request body.
  for (const build of [
    (m) => m.getAreaSalesHeadByArea("abc").run(),
    (m) => m.getRegionalSalesHeadByArea("abc").run(),
    (m) => m.getGroupHeadByArea("abc").run(),
    (m) => m.assignAreaSalesHeadArea("PHL-ASH-0005", "abc").run(),
    (m) => m.isAreaInAreaSalesHeadScope("PHL-ASH-0005", "abc").run(),
  ]) {
    const { inputs } = await captureQuery(build);

    assert.equal(inputs.find((i) => i.name === "GroupCode").value, null);
  }
});

test("the branch lookup does the same", async () => {
  const { inputs } = await captureQuery((m) => m.getBranchHeadByBranch("abc").run());

  assert.equal(inputs.find((i) => i.name === "BranchCode").value, null);
});

test("approval paging falls back to 1 rather than binding NaN", async () => {
  // `asInt(x) ?? 1` only works once asInt answers null. With NaN it bound NaN,
  // so ?page=abc on the approvals list was a 500 rather than page 1.
  const { inputs } = await captureQuery((m) =>
    m.getUsersForApproval(
      { Role: "BRANCH_HEAD", UserCode: "USR-BRH-0300", BranchCode: 255, GroupCode: 1 },
      { PageNumber: "abc", PageSize: "abc" },
    ).run(),
  );

  assert.equal(inputs.find((i) => i.name === "PageNumber").value, 1);
  assert.equal(inputs.find((i) => i.name === "PageSize").value, 20);
});
