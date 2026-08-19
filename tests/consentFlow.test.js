import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const EMAIL_SERVICE = "../../src/services/emailService.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CLIENT = "client@example.com";

const affected = (count) => () => ({ run: async () => ({ rowsAffected: [count] }) });

const withConsent = (overrides = {}, emailOverrides = {}) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        insertConsentRequest: affected(1),
        getConsentRequestByToken: rows({ Status: "PENDING", ConsumedAt: null }),
        uploadConsentFile: affected(1),
        ...overrides,
      },
      [EMAIL_SERVICE]: { sendConsentEmail: async () => {}, ...emailOverrides },
    },
    REFERRAL_SERVICE,
  );

// ---------------------------------------------------------------- sendConsent

test("a malformed email is refused before anything is written or sent", async () => {
  // The row and the email are both side effects on a client's record. Neither
  // may happen for an address that cannot receive the link.
  for (const bad of ["", null, undefined, "not-an-email", "missing@tld", "@example.com"]) {
    const { service, calls } = await withConsent();

    const error = await captureThrown(() =>
      service.sendConsent(bad, TOKEN, "Juan", "Makati", "Maria"),
    );

    assert.equal(error?.statusCode, 400, `email ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0, `email ${JSON.stringify(bad)} must not act`);
  }
});

test("the consent request is written before the email goes out", async () => {
  // If the order were reversed, a client could receive a link whose token has
  // no row behind it -- and clicking it would answer the invalid-consent page.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Makati", "Maria");

  const order = calls.map((c) => c.name);
  assert.ok(order.indexOf("insertConsentRequest") < order.indexOf("sendConsentEmail"), order.join(" -> "));
});

test("the token reaching the row is the token reaching the email", async () => {
  // Two separate calls carry it. If they ever diverge, the link in the client's
  // inbox points at a row that will never be found.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Makati", "Maria");

  const written = calls.find((c) => c.name === "insertConsentRequest").args;
  const emailed = calls.find((c) => c.name === "sendConsentEmail").args;

  assert.deepEqual(written, [CLIENT, TOKEN]);
  assert.equal(emailed[0], CLIENT);
  assert.equal(emailed[1], TOKEN);
});

test("a failing email does not hide the fact that a request now exists", async () => {
  // Deliberately not swallowed, unlike safeNotify: the row is already written,
  // so the caller has to know the client never received the link.
  const { service } = await withConsent({}, {
    sendConsentEmail: async () => {
      throw new Error("graph send failed");
    },
  });

  await assert.rejects(() => service.sendConsent(CLIENT, TOKEN, "Juan", "Makati", "Maria"));
});

// -------------------------------------------------------- validateConsentToken

test("a token that is not a GUID never reaches the database", async () => {
  for (const bad of ["", null, undefined, "notatoken", "3f2504e0-4f89-11d3-9a0c"]) {
    const { service, calls } = await withConsent();

    const error = await captureThrown(() => service.validateConsentToken(bad));

    assert.equal(error?.statusCode, 404, `token ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0, `token ${JSON.stringify(bad)} must not query`);
  }
});

test("a well-formed token with no row is a 404, not an empty success", async () => {
  const { service } = await withConsent({
    getConsentRequestByToken: () => ({ run: async () => ({ recordset: [] }) }),
  });

  const error = await captureThrown(() => service.validateConsentToken(TOKEN));

  assert.equal(error?.statusCode, 404);
});

test("a valid token returns the row, including the status the pages branch on", async () => {
  // confirmConsent reads Status off this to decide whether to render the form
  // or the confirmation, so the row has to come back whole.
  const { service } = await withConsent({
    getConsentRequestByToken: rows({ Status: "CONFIRMED", ConsumedAt: null }),
  });

  const row = await service.validateConsentToken(TOKEN);

  assert.equal(row.Status, "CONFIRMED");
});

// -------------------------------------------------------------- uploadConsent

test("an uploaded file with no consent request at all is a 404", async () => {
  // usp_upload_consent_file has no status filter -- it updates every row for the
  // address -- so zero rows means the email has no consent request whatsoever.
  // The message says "no pending consent request", which is narrower than what
  // the procedure actually checks. Item 24 of the DBA request would make the two
  // agree by adding the filter; until then, read the message as approximate.
  const { service } = await withConsent({ uploadConsentFile: affected(0) });

  const error = await captureThrown(() => service.uploadConsent(CLIENT, "1787038740554.pdf"));

  assert.equal(error?.statusCode, 404);
  assert.match(error.message, /no pending consent request/i);
});

test("a successful upload reports success and passes the stored filename through", async () => {
  const { service, calls } = await withConsent();

  const result = await service.uploadConsent(CLIENT, "1787038740554.pdf");

  assert.equal(result.success, true);
  assert.deepEqual(calls.find((c) => c.name === "uploadConsentFile").args, [
    CLIENT,
    "1787038740554.pdf",
  ]);
});
