import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, captureThrown, noRows } from "./helpers/userService.js";
import { alwaysRequiredFields } from "../src/services/userService.js";
import { ACCOUNT_OFFICER, BRANCH_STAFF } from "../src/utils/constant.js";

const model = {
  getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-0005" }),
  getBranchHeadByBranch: rows({ UserCode: "USR-BRH-0300" }),
  checkEmployeeNoExists: noRows,
  checkOrRegisterUser: rows({
    Success: 1,
    Message: "User registered successfully.",
    UserCode: "PHL-AO-0700",
  }),
  assignAreaSalesHeadArea: () => ({ run: async () => ({ recordset: [] }) }),
};

const complete = {
  firstName: "Test",
  lastName: "Officer",
  birthday: "1990-01-15",
  email: "test@example.com",
  mobileNumber: "09171116677",
  position: "Account Officer",
  employeeNo: "TEST-001",
  role: ACCOUNT_OFFICER,
  areaCode: 1,
};

test("a complete registration still reaches the procedure", async () => {
  const { service, calls } = await withUserService(model);

  const result = await service.register({ ...complete });

  assert.equal(result.success, true);
  assert.ok(calls.some((call) => call.name === "checkOrRegisterUser"));
});

test("each always-required field is refused by name", async () => {
  // usp_ins_register_user answers a missing one of these with "Missing required
  // registration fields." - true, and it does not say which. The role-specific
  // rules above already name theirs, so a caller got a precise message for a
  // missing areaCode and a guess for a missing birthday.
  for (const [field, label] of Object.entries(alwaysRequiredFields)) {
    const { service } = await withUserService(model);
    const incomplete = { ...complete };
    delete incomplete[field];

    const error = await captureThrown(() => service.register(incomplete));

    assert.equal(error?.statusCode, 400, field);
    assert.equal(error.message, `${label} is required`, field);
  }
});

test("an empty string is missing, not present", async () => {
  // A form that posts every field always sends the key. "" reaching sql.Date is
  // NULL by the time it is bound, so a truthiness check is the right one here -
  // asText and asInt already treat "" as absent at the model boundary.
  const { service } = await withUserService(model);

  const error = await captureThrown(() =>
    service.register({ ...complete, birthday: "" }),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /birthday is required/i);
});

test("nothing is written when a required field is missing", async () => {
  // The check has to run before the insert for the same reason the approver
  // lookup does: a half-completed registration consumes the employee number and
  // the email, and neither can be used again.
  const { service, calls } = await withUserService(model);

  await captureThrown(() =>
    service.register({ ...complete, birthday: undefined }),
  );

  assert.equal(calls.filter((call) => call.name === "checkOrRegisterUser").length, 0);
});

test("the role-specific rules still answer first", async () => {
  // Deliberate ordering: these run after the group and branch checks, so a
  // request that breaks both keeps the message it gave before this change.
  const { service } = await withUserService(model);

  const error = await captureThrown(() =>
    service.register({ ...complete, areaCode: undefined, birthday: undefined }),
  );

  assert.match(error.message, /group is required/i);
});

test("the superadmin creation path is held to the same rules", async () => {
  // createTopLevelUser calls register with createdBySuperadmin, which skips the
  // approver lookup. It must not skip this - an account created by IT with no
  // birthday fails in the procedure exactly as a public registration would.
  const { service } = await withUserService(model);

  const error = await captureThrown(() =>
    service.register({ ...complete, role: BRANCH_STAFF, branchCode: 255, areaCode: undefined, lastName: undefined },
      { createdBySuperadmin: true }),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /last name is required/i);
});
