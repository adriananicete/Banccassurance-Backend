import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const NOTIFICATION_SERVICE = "../../src/services/notificationService.js";
const UNDERWRITING_SERVICE = "../../src/services/underwritingService.js";

const referralIn = (status) =>
  rows({
    Status: status,
    FirstName: "Test",
    LastName: "Client",
    ReferrerCode: "USR-STF-0115",
    AOCode: "PHL-AO-0001",
    BranchCode: 58,
  });

const withUnderwriting = (status) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        getReferralContactInfo: referralIn(status),
        updateStatus: () => ({ run: async () => {} }),
      },
      [NOTIFICATION_SERVICE]: { safeNotify: async () => {} },
    },
    UNDERWRITING_SERVICE,
  );

const move = async (from, to) => {
  const { service, calls } = await withUnderwriting(from);
  const error = await captureThrown(() =>
    service.default.updateUnderwritingStatus("3f2504e0-4f89-11d3-9a0c-0305e82c3301", to),
  );
  return { error, calls };
};

test("a status underwriting cannot act on says so, and says retrying will not help", async () => {
  for (const status of ["Referred", "Deferred", "Lost", "Approved", "Declined"]) {
    const { error } = await move(status, "Approved");

    assert.equal(error?.statusCode, 400, status);
    assert.match(error.message, new RegExp(status));
    assert.match(error.message, /retrying will not help/i);
  }
});

test("a disallowed move names both statuses and what is allowed instead", async () => {
  const { error } = await move("Presented", "Approved");

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /Presented/);
  assert.match(error.message, /Approved/);
  assert.match(error.message, /Closed Pending/);
});

test("the two failures are told apart by their text, not their status code", async () => {
  const unusable = await move("Referred", "Approved");
  const disallowed = await move("Presented", "Approved");

  assert.equal(unusable.error.statusCode, disallowed.error.statusCode);
  assert.notEqual(unusable.error.message, disallowed.error.message);
});

test("nothing is written when the move is refused", async () => {
  const { calls } = await move("Presented", "Approved");
  assert.equal(calls.some((call) => call.name === "updateStatus"), false);
});

test("the allowed underwriting moves are accepted", async () => {
  const allowed = [
    ["Presented", "Closed Pending"],
    ["Closed Pending", "Approved"],
    ["Closed Pending", "Declined"],
    ["Closed Pending", "Postponed"],
    ["Postponed", "Approved"],
    ["Postponed", "Declined"],
  ];

  for (const [from, to] of allowed) {
    const { error, calls } = await move(from, to);

    assert.equal(error, null, `${from} -> ${to}`);
    assert.deepEqual(
      calls.find((call) => call.name === "updateStatus").args,
      ["3f2504e0-4f89-11d3-9a0c-0305e82c3301", to],
    );
  }
});

test("a referral that does not exist is a 404", async () => {
  const { service } = await withStubbedModules(
    {
      [REFERRAL_MODEL]: { getReferralContactInfo: () => ({ run: async () => ({ recordset: [] }) }) },
      [NOTIFICATION_SERVICE]: { safeNotify: async () => {} },
    },
    UNDERWRITING_SERVICE,
  );

  const error = await captureThrown(() =>
    service.default.updateUnderwritingStatus("3f2504e0-4f89-11d3-9a0c-0305e82c3301", "Approved"),
  );

  assert.equal(error?.statusCode, 404);
});
