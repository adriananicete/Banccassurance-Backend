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
  groupCode: 1,
};

test("a complete registration still reaches the procedure", async () => {
  const { service, calls } = await withUserService(model);

  const result = await service.register({ ...complete });

  assert.equal(result.success, true);
  assert.ok(calls.some((call) => call.name === "checkOrRegisterUser"));
});

test("the list matches what the procedure actually refuses", () => {
  // Read from usp_ins_register_user STEP 1. Five of these are its list;
  // PasswordHash is generated here and always present, and Role is covered by
  // registrationFields above. Email is ours and goes further than the
  // procedure - see the test below.
  //
  // position left on 2026-08-27 with the Users.Position column. It was free
  // text nobody read back: form -> controller -> model -> procedure, and it
  // stopped there. Role is the authorisation key and stays; the two only
  // looked like duplicates because the seed put job titles in both.
  assert.deepEqual(Object.keys(alwaysRequiredFields).sort(), [
    "birthday",
    "email",
    "employeeNo",
    "firstName",
    "lastName",
    "mobileNumber",
  ]);
});

test("a null email is refused here even though the procedure allows it", () => {
  // STEP 1 does not test @Email, and STEP 2's existence check compares
  // Email = @Email, which is never true for NULL - so the procedure would
  // happily insert a user with no email at all. That account cannot log in by
  // email and cannot be told it was approved. UQ_Users_Email permits exactly
  // one NULL in SQL Server, so a second such registration would surface as a
  // raw constraint violation rather than a message.
  assert.ok(Object.hasOwn(alwaysRequiredFields, "email"));
});

test("each always-required field is refused by name", async () => {
  // usp_ins_register_user answers a missing one of these with "Missing required
  // registration fields." - true, and it does not say which. The role-specific
  // rules above already name theirs, so a caller got a precise message for a
  // missing groupCode and a guess for a missing birthday.
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
    service.register({ ...complete, groupCode: undefined, birthday: undefined }),
  );

  assert.match(error.message, /group is required/i);
});

test("the superadmin creation path is held to the same rules", async () => {
  // createTopLevelUser calls register with createdBySuperadmin, which skips the
  // approver lookup. It must not skip this - an account created by IT with no
  // birthday fails in the procedure exactly as a public registration would.
  const { service } = await withUserService(model);

  const error = await captureThrown(() =>
    service.register({ ...complete, role: BRANCH_STAFF, branchCode: 255, groupCode: undefined, lastName: undefined },
      { createdBySuperadmin: true }),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /last name is required/i);
});
