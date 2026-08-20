import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const USER_MODEL = "../../src/models/userModel.js";
const NOTIFICATION_SERVICE = "../../src/services/notificationService.js";

const AO = { UserCode: "PHL-AO-1168", Role: "ACCOUNT_OFFICER" };
const ID = "0D6D5F27-B839-4F41-A484-7314D1876951";

const referral = (overrides) =>
  rows({
    Id: ID,
    Status: "Referred",
    AOCode: AO.UserCode,
    ReferrerCode: "USR-STF-0131",
    BranchCode: 110,
    FirstName: "Quinn",
    LastName: "Dela Vega",
    ...overrides,
  });

const ok = () => ({ run: async () => ({ recordset: [], rowsAffected: [1] }) });

const withReferrals = (overrides = {}) =>
  withStubbedModules({
    [REFERRAL_MODEL]: {
      getReferralContactInfo: referral(),
      updateStatus: ok,
      ...overrides,
    },
    [USER_MODEL]: { getBranchHeadByBranch: rows() },
    [NOTIFICATION_SERVICE]: { safeNotify: async () => {} },
  });

test("an unrecognized stored status names the status in the message", async () => {
  // The guard was written with single quotes, so the interpolation was literal
  // text -- the caller was told the status was "${referral.Status}". It fires on
  // real data: `Closed` has been seen in banc.Referrals and is not in the map.
  const { service } = await withReferrals({
    getReferralContactInfo: referral({ Status: "Closed" }),
  });

  const error = await captureThrown(() =>
    service.updateReferralStatus(ID, "Presented", AO),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /unrecognized status \(Closed\)/);
  assert.doesNotMatch(error.message, /\$\{/, "the placeholder survived un-interpolated");
});

test("nothing is written when the stored status is unrecognized", async () => {
  const { service, calls } = await withReferrals({
    getReferralContactInfo: referral({ Status: "Closed" }),
  });

  await captureThrown(() => service.updateReferralStatus(ID, "Presented", AO));

  assert.equal(calls.some((c) => c.name === "updateStatus"), false);
});

test("a terminal status and a disallowed move are told apart by their text", async () => {
  // Three different 400s reach this endpoint and only the wording separates
  // them. Read the body, never just the status code.
  const terminal = await withReferrals({
    getReferralContactInfo: referral({ Status: "Approved" }),
  });
  const terminalError = await captureThrown(() =>
    terminal.service.updateReferralStatus(ID, "Presented", AO),
  );

  const disallowed = await withReferrals();
  const disallowedError = await captureThrown(() =>
    disallowed.service.updateReferralStatus(ID, "Approved", AO),
  );

  assert.match(terminalError.message, /cannot be changed from Approved/i);
  assert.match(disallowedError.message, /Cannot transition from Referred to Approved/i);
  assert.notEqual(terminalError.message, disallowedError.message);
});

test("only the assigned Account Officer may move a referral", async () => {
  const { service, calls } = await withReferrals({
    getReferralContactInfo: referral({ AOCode: "PHL-AO-9999" }),
  });

  const error = await captureThrown(() =>
    service.updateReferralStatus(ID, "Presented", AO),
  );

  assert.equal(error?.statusCode, 403);
  assert.equal(calls.some((c) => c.name === "updateStatus"), false);
});

test("a status outside the whitelist is refused before the referral is read", async () => {
  const { service, calls } = await withReferrals();

  const error = await captureThrown(() =>
    service.updateReferralStatus(ID, "Cancelled", AO),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /Invalid status value/);
  assert.equal(calls.length, 0);
});

test("a missing referral is a 404", async () => {
  const { service } = await withReferrals({ getReferralContactInfo: rows() });

  const error = await captureThrown(() =>
    service.updateReferralStatus(ID, "Presented", AO),
  );

  assert.equal(error?.statusCode, 404);
});

test("an allowed move writes once and notifies the referrer", async () => {
  const notified = [];
  const { service, calls } = await withStubbedModules({
    [REFERRAL_MODEL]: { getReferralContactInfo: referral(), updateStatus: ok },
    [USER_MODEL]: { getBranchHeadByBranch: rows() },
    [NOTIFICATION_SERVICE]: {
      safeNotify: async (code, message) => notified.push({ code, message }),
    },
  });

  await service.updateReferralStatus(ID, "Presented", AO);

  assert.deepEqual(calls.find((c) => c.name === "updateStatus").args, [ID, "Presented"]);
  assert.equal(notified[0].code, "USR-STF-0131");
  assert.match(notified[0].message, /Presented/);
});
