import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

// usp_confirm_consent_request updates only WHERE Status = 'PENDING', so a row
// count of 0 does not distinguish "no such token" from "already recorded".
const confirmWith = async ({ rowsAffected, existing }) => {
  const { service, calls } = await withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        confirmConsentRequest: () => ({ run: async () => ({ rowsAffected: [rowsAffected] }) }),
        getConsentRequestByToken: existing
          ? rows(existing)
          : () => ({ run: async () => ({ recordset: [] }) }),
      },
    },
    REFERRAL_SERVICE,
  );

  const error = await captureThrown(() => service.confirmConsentRequest(TOKEN));
  return { error, calls };
};

test("a pending token is confirmed without a second lookup", async () => {
  const { error, calls } = await confirmWith({ rowsAffected: 1 });

  assert.equal(error, null);
  assert.equal(calls.some((c) => c.name === "getConsentRequestByToken"), false);
});

test("confirming an already-confirmed token succeeds instead of failing", async () => {
  // The client pressed back, refreshed, or opened the email link twice. They
  // did nothing wrong and must not be shown an error.
  const { error } = await confirmWith({
    rowsAffected: 0,
    existing: { Status: "CONFIRMED", ConsumedAt: null },
  });

  assert.equal(error, null);
});

test("a token already satisfied by an uploaded form also succeeds", async () => {
  const { error } = await confirmWith({
    rowsAffected: 0,
    existing: { Status: "UPLOADED", ConsumedAt: null },
  });

  assert.equal(error, null);
});

test("a token that does not exist is still a 404", async () => {
  const { error } = await confirmWith({ rowsAffected: 0, existing: null });

  assert.equal(error?.statusCode, 404);
});

test("an unrecognised status is refused and names itself", async () => {
  const { error } = await confirmWith({
    rowsAffected: 0,
    existing: { Status: "REVOKED", ConsumedAt: null },
  });

  assert.equal(error?.statusCode, 404);
  assert.match(error.message, /REVOKED/);
});

test("a malformed token never reaches the database", async () => {
  for (const bad of ["", "not-a-guid", undefined]) {
    const { service, calls } = await withStubbedModules(
      {
        [REFERRAL_MODEL]: {
          confirmConsentRequest: () => ({ run: async () => ({ rowsAffected: [1] }) }),
          getConsentRequestByToken: rows({ Status: "PENDING" }),
        },
      },
      REFERRAL_SERVICE,
    );

    const error = await captureThrown(() => service.confirmConsentRequest(bad));

    assert.equal(error?.statusCode, 404, `token ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0, `token ${JSON.stringify(bad)}`);
  }
});
