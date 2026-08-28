import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, restoreStubs } from "./helpers/stubModel.js";
import { registrationCodeFields } from "../src/services/userService.js";

// ⚠️ This file exists because of a bug the suite could not see.
//
// regionCode was added to the registration contract on 2026-08-28 -- the
// service validated it, the model bound it, the model tests captured it, and
// 405 tests passed. The controller still destructured groupCode and branchCode
// only, so the field was dropped between the request body and the service and
// every Area Sales Head registration answered "Region is required for this
// role" while sending one. Adrian found it in Postman.
//
// Every other registration test calls userService.register directly, which is
// the right shape for testing rules -- and it means the controller is the one
// step nothing crosses. A field can be added everywhere else and still never
// arrive.

const USER_SERVICE = "../../src/services/userService.js";
const USER_CONTROLLER = "../../src/controllers/userController.js";

const body = {
  firstName: "Sara",
  middleName: "M",
  lastName: "Cruz",
  suffix: "Jr",
  birthday: "1985-04-12",
  email: "ash@example.com",
  mobileNumber: "09171230005",
  employeeNo: "2026-123",
  role: "AREA_SALES_HEAD",
  groupCode: 5,
  branchCode: 58,
  regionCode: 1,
};

const forwarded = async () => {
  let received = null;

  const { service: controller } = await withStubbedModules(
    {
      [USER_SERVICE]: {
        register: async (fields) => {
          received = fields;
          return { success: true };
        },
      },
    },
    USER_CONTROLLER,
  );

  await controller.register({ body }, { json: () => {} }, (error) => {
    throw error;
  });

  restoreStubs();

  return received;
};

test("every code field in the contract reaches the service from the body", async () => {
  // Assert the set, not regionCode alone. The next field added will be dropped
  // the same way, and naming only the one that was missed guards the fix rather
  // than the class.
  const received = await forwarded();

  for (const field of Object.keys(registrationCodeFields)) {
    assert.equal(received[field], body[field], field);
  }
});

test("the rest of the registration body reaches it too", async () => {
  // A field silently dropped here surfaces as a validation error about a value
  // the caller did send, which sends them looking at their own request.
  const received = await forwarded();

  for (const field of Object.keys(body)) {
    assert.equal(received[field], body[field], field);
  }
});
