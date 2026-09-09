import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { consentFormTemplate } from "../src/templates/consentFormTemplate.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const USER_MODEL = "../../src/models/userModel.js";
const EMAIL_SERVICE = "../../src/services/emailService.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CLIENT = "client@example.com";
const STAFF = { UserCode: "USR-STF-00001", FullName: "Maria", BranchCode: 3 };

const withConsent = () =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        insertConsentRequest: () => ({ run: async () => ({ rowsAffected: [1] }) }),
        getConsentRequestByToken: rows({ Status: "PENDING", ConsumedAt: null }),
        checkConsent: rows({ Status: "PENDING" }),
      },
      [USER_MODEL]: { getBranchScope: rows({ BranchName: "Makati" }) },
      [EMAIL_SERVICE]: { sendConsentEmail: async () => {} },
    },
    REFERRAL_SERVICE,
  );

test("the full name reaches the email service alongside the short one", async () => {
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan Cruz", "Juan Santos Cruz Jr.", STAFF);

  const emailed = calls.find((c) => c.name === "sendConsentEmail").args;

  assert.equal(emailed[2], "Juan Cruz");
  assert.equal(emailed[5], "Juan Santos Cruz Jr.");
});

test("the greeting escapes the name it is given", async () => {
  // fullName arrives from the query string, so whoever builds the link controls
  // it. Every other value in this page is escaped; this one was not.
  const html = consentFormTemplate(TOKEN, "n", "b", "r", '<script>alert(1)</script>');

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a name with an ampersand or a quote survives as readable text", async () => {
  // Escaping must not mangle real names. Dela Cruz & Sons, O'Brien.
  const html = consentFormTemplate(TOKEN, "n", "b", "r", "Maria O'Brien & Co.");

  assert.match(html, /Maria O&#39;Brien &amp; Co\./);
});

test("a missing full name renders the greeting without printing undefined", async () => {
  // The template is called with whatever the query string held. An older link,
  // sent before fullName existed, carries nothing.
  const html = consentFormTemplate(TOKEN, "n", "b", "r", undefined);

  assert.doesNotMatch(html, /undefined/);
  assert.match(html, /Dear Valued Client/);
});
