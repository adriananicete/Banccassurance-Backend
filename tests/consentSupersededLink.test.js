import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";
import { consentInvalidTemplate, supersededReason } from "../src/templates/consentInvalidTemplate.js";

// DBA A32 landed 2026-09-09. usp_insert_consent_request now retires the live
// rows for an address before inserting the new one:
//
//   UPDATE banc.consent_request SET Status = 'SUPERSEDED'
//   WHERE Email = @Email AND ConsumedAt IS NULL
//     AND Status IN ('PENDING', 'CONFIRMED', 'UPLOADED');
//
// That closes two live links, which was the point. It also puts a status into
// the table that none of our code had ever seen, and two paths read it.
//
// The worst of the two was silent: GET /consent/confirm branched on
// validConsentStatus and fell through to the "I Agree" form for anything else --
// so a client opening a retired link read the whole notice, agreed, and was then
// told the link was invalid. Nothing threw; the page just looked live.
//
// The row also keeps ConsumedAt NULL, so once the newer row is consumed by a
// referral the retired one becomes the newest unconsumed row for that address
// and usp_check_consent returns it.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";
const CONSENT_CONTROLLER = "../../src/controllers/consentController.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CLIENT = "client@example.com";

const withToken = (status) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        confirmConsentRequest: () => ({ run: async () => ({ rowsAffected: [0] }) }),
        getConsentRequestByToken: rows({ Status: status, ConsumedAt: null }),
        checkConsent: status === null ? rows() : rows({ Status: status }),
      },
    },
    REFERRAL_SERVICE,
  );

// ------------------------------------------------------------ the service

test("confirming a superseded token is a 410, not the generic 404", async () => {
  // The status code is what the controller branches on to pick the page. A 404
  // here renders "Invalid or Expired Link", which sends the client to their
  // branch instead of to the newer email sitting in their inbox.
  const { service } = await withToken("SUPERSEDED");

  const error = await captureThrown(() => service.confirmConsentRequest(TOKEN));

  assert.equal(error?.statusCode, 410);
});

test("a genuinely unknown status is still a 404 that names itself", async () => {
  // The existing refusal has to survive. A reseed can put anything in this
  // column, and an unrecognised value must not be quietly treated as retired.
  const { service } = await withToken("REVOKED");

  const error = await captureThrown(() => service.confirmConsentRequest(TOKEN));

  assert.equal(error?.statusCode, 404);
  assert.match(error.message, /REVOKED/);
});

test("checkConsent reports a superseded row as PENDING", async () => {
  // The retired row keeps ConsumedAt NULL, so it surfaces as the newest
  // unconsumed row once the row that replaced it has been consumed. PENDING is
  // already this endpoint's word for "no usable consent", and the frontend has
  // never been told about any other value.
  const { service } = await withToken("SUPERSEDED");

  assert.equal(await service.checkConsent(CLIENT), "PENDING");
});

test("a confirmed consent still reports CONFIRMED", async () => {
  const { service } = await withToken("CONFIRMED");

  assert.equal(await service.checkConsent(CLIENT), "CONFIRMED");
});

// ---------------------------------------------------------- the templates

test("the superseded page tells the client where the live link is", async () => {
  const html = consentInvalidTemplate(supersededReason);

  assert.match(html, /replaced/i);
  assert.match(html, /most recent consent email/i);
  assert.doesNotMatch(html, /contact your branch representative/i);
});

test("the default invalid page is unchanged", async () => {
  // Called with no argument in the ordinary failure path, and that wording is
  // correct there -- a token that never existed has no newer email behind it.
  const html = consentInvalidTemplate();

  assert.match(html, /Invalid or Expired Link/);
  assert.match(html, /contact your branch representative/i);
});

// --------------------------------------------------------- the controller

const getConfirm = async (status) => {
  const { service } = await withStubbedModules(
    {
      [REFERRAL_SERVICE]: {
        validateConsentToken: async () => ({ Status: status, ConsumedAt: null }),
      },
    },
    CONSENT_CONTROLLER,
  );

  const captured = { status: 200, body: null };
  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    send(body) {
      captured.body = body;
    },
  };

  await service.confirmConsent({ query: { token: TOKEN, name: "Juan" } }, res);

  return captured;
};

test("opening a retired link does not render the I Agree form", async () => {
  // The mutation guard for the whole change, and the failure it prevents is the
  // one nobody would report as a bug: the page looked live, so the client
  // believes they gave consent.
  const { status, body } = await getConfirm("SUPERSEDED");

  assert.equal(status, 410);
  assert.doesNotMatch(body, /I Agree/);
  assert.match(body, /replaced/i);
});

test("opening a pending link still renders the form", async () => {
  const { status, body } = await getConfirm("PENDING");

  assert.equal(status, 200);
  assert.match(body, /I Agree/);
});

test("opening an already-confirmed link still renders the confirmation", async () => {
  const { body } = await getConfirm("CONFIRMED");

  assert.match(body, /Referral Details|Consent Confirmation/);
  assert.doesNotMatch(body, /I Agree/);
});
