import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

// usp_insert_consent_request is a plain INSERT -- read from the body 2026-09-09.
// Every send appends a row and touches none of the older ones, and
// usp_check_consent reads TOP 1 WHERE ConsumedAt IS NULL ORDER BY CreatedAt DESC.
//
// So sending again to a client who has already given consent buries it: the new
// PENDING row outranks the CONFIRMED one, which is still sitting there unconsumed.
// createReferral then answers 403 for a client who did everything asked of them,
// and the only way back is to make them click a second link.
//
// The staff member has no way to know they did it. Both sends answer 200.
//
// This guard is ours and stands on its own. A DBA change to supersede the older
// rows would make the loss deliberate rather than accidental -- it would not
// stop it, because the row being destroyed is the confirmed one.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const USER_MODEL = "../../src/models/userModel.js";
const EMAIL_SERVICE = "../../src/services/emailService.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CLIENT = "client@example.com";
const STAFF = { UserCode: "USR-STF-00001", FullName: "Maria Santos", BranchCode: 3 };

const withStatus = (status) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        insertConsentRequest: () => ({ run: async () => ({ rowsAffected: [1] }) }),
        checkConsent: status === null ? rows() : rows({ Status: status }),
      },
      [USER_MODEL]: { getBranchScope: rows({ BranchName: "Pasig Capitol" }) },
      [EMAIL_SERVICE]: { sendConsentEmail: async () => {} },
    },
    REFERRAL_SERVICE,
  );

const send = (service) =>
  service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", STAFF);

test("a client who has already confirmed is not sent another request", async () => {
  const { service, calls } = await withStatus("CONFIRMED");

  const error = await captureThrown(() => send(service));

  assert.equal(error?.statusCode, 409);
  assert.equal(calls.some((c) => c.name === "insertConsentRequest"), false);
  assert.equal(calls.some((c) => c.name === "sendConsentEmail"), false);
});

test("an uploaded paper form counts the same as a confirmed email", async () => {
  // Both satisfy the referral check, so both are consent that a resend would
  // destroy. Asserting the set matters here: covering only CONFIRMED would pass
  // with UPLOADED missing from the list, and nothing would throw.
  const { service, calls } = await withStatus("UPLOADED");

  const error = await captureThrown(() => send(service));

  assert.equal(error?.statusCode, 409);
  assert.equal(calls.some((c) => c.name === "insertConsentRequest"), false);
});

test("the refusal tells the staff member what to do instead", async () => {
  // They are looking at a client who has consented and a button that just
  // failed. Without the second half of this message the obvious next move is to
  // press it again.
  const { service } = await withStatus("CONFIRMED");

  const error = await captureThrown(() => send(service));

  assert.match(error.message, /already given consent/i);
  assert.match(error.message, /create the referral/i);
});

test("a client who has not answered yet is sent the request", async () => {
  // The ordinary resend, and the reason the guard is not simply "one send per
  // client". A client who lost the email must be able to get another.
  const { service, calls } = await withStatus("PENDING");

  const error = await captureThrown(() => send(service));

  assert.equal(error, null);
  assert.equal(calls.some((c) => c.name === "sendConsentEmail"), true);
});

test("a client with no consent request at all is sent one", async () => {
  // checkConsent answers PENDING for an address it has never seen, so this
  // reaches the guard by the same path as a real pending row.
  const { service, calls } = await withStatus(null);

  const error = await captureThrown(() => send(service));

  assert.equal(error, null);
  assert.equal(calls.some((c) => c.name === "insertConsentRequest"), true);
});

test("consent already consumed by a referral does not block the next one", async () => {
  // usp_check_consent excludes consumed rows, so a client referred once comes
  // back as PENDING. A second plan needs a second consent -- BusinessLogic.md
  // section 5, marked Confirmed -- and this guard must not stand in its way.
  const { service, calls } = await withStatus("PENDING");

  await send(service);

  assert.equal(calls.some((c) => c.name === "sendConsentEmail"), true);
});

test("the status is checked before anything is written or sent", async () => {
  const { service, calls } = await withStatus("CONFIRMED");

  await captureThrown(() => send(service));

  assert.deepEqual(calls.map((c) => c.name), ["checkConsent"]);
});

test("a malformed email is still refused before the status is read", async () => {
  // The email check stays first. Reading a status for an address that cannot
  // receive anything is a query with no purpose.
  const { service, calls } = await withStatus("CONFIRMED");

  const error = await captureThrown(() =>
    service.sendConsent("not-an-email", TOKEN, "Juan", "Juan Santos Cruz", STAFF),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.length, 0);
});
