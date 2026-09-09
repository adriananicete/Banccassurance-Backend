import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";

// POST /consent/send used to take branchName and referrerName from the request
// body and put them straight into an email a client receives. Nothing checked
// them against the caller, so any signed-in user could send a Data Privacy
// consent notice attributed to somebody else's name and somebody else's branch.
//
// Both now come from the session. req.user carries FullName as of this change,
// and the branch name is resolved from the caller's own BranchCode.
//
// The Account Officer is the case that makes this awkward rather than trivial:
// Users.BranchCode is NULL for every AO -- they hold branches through
// banc.account_officer_branches, six to eight of them -- so there is no single
// branch to name, and the email has to read correctly without one.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const USER_MODEL = "../../src/models/userModel.js";
const EMAIL_SERVICE = "../../src/services/emailService.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";
const CONSENT_CONTROLLER = "../../src/controllers/consentController.js";

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CLIENT = "client@example.com";

const STAFF = {
  UserCode: "USR-STF-00001",
  FullName: "Maria Santos",
  BranchCode: 3,
  Role: "BRANCH_STAFF",
};

const OFFICER = {
  UserCode: "PHL-AO-00001",
  FullName: "Ramon Dela Cruz",
  BranchCode: null,
  Role: "ACCOUNT_OFFICER",
};

const withConsent = (branchRow = { BranchName: "Pasig Capitol" }) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        insertConsentRequest: () => ({ run: async () => ({ rowsAffected: [1] }) }),
      },
      [USER_MODEL]: {
        getBranchScope: branchRow === null ? rows() : rows(branchRow),
      },
      [EMAIL_SERVICE]: { sendConsentEmail: async () => {} },
    },
    REFERRAL_SERVICE,
  );

// sendConsentEmail(toEmail, token, name, branchName, referrerName, fullName)
const emailArgs = (calls) => calls.find((c) => c.name === "sendConsentEmail").args;

test("the referrer's name on the email is the caller's own, from the session", async () => {
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", STAFF);

  assert.equal(emailArgs(calls)[4], "Maria Santos");
});

test("the branch is resolved from the caller's BranchCode, not from anything sent in", async () => {
  // The argument assertion is the point: a lookup reading the wrong key gives a
  // confident wrong answer, and a real branch name in the wrong place looks
  // exactly like a correct one.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", STAFF);

  assert.deepEqual(calls.find((c) => c.name === "getBranchScope").args, [3]);
  assert.equal(emailArgs(calls)[3], "Pasig Capitol");
});

test("an Account Officer sends no branch, and no branch is looked up for one", async () => {
  // Users.BranchCode is NULL for every AO. Querying anyway would be a lookup on
  // null that answers zero rows -- harmless but wasteful, and it would read as
  // though the AO were expected to have one.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", OFFICER);

  assert.equal(calls.some((c) => c.name === "getBranchScope"), false);
  assert.equal(emailArgs(calls)[3], null);
  assert.equal(emailArgs(calls)[4], "Ramon Dela Cruz");
});

test("a branch code that resolves to nothing sends no branch rather than undefined", async () => {
  // consentConfirmedTemplate drops an empty detail row, so null renders as an
  // absent Branch line. The string "undefined" would render as a branch called
  // undefined on a Data Privacy notice.
  const { service, calls } = await withConsent(null);

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", STAFF);

  assert.equal(emailArgs(calls)[3], null);
});

test("a caller with no name on their row sends null, not the string undefined", async () => {
  // COALESCE(FullName, FirstName + ' ' + LastName) is NULL when both are, and
  // seeded rows do have null name parts.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", {
    ...STAFF,
    FullName: null,
  });

  assert.equal(emailArgs(calls)[4], null);
});

test("the identity is resolved before the consent row is written", async () => {
  // If the lookup threw after the insert, the client would hold a live token
  // for a request whose email never went out.
  const { service, calls } = await withConsent();

  await service.sendConsent(CLIENT, TOKEN, "Juan", "Juan Santos Cruz", STAFF);

  const order = calls.map((c) => c.name);
  assert.ok(
    order.indexOf("getBranchScope") < order.indexOf("insertConsentRequest"),
    order.join(" -> "),
  );
});

test("the controller ignores branchName and referrerName in the body", async () => {
  // The mutation guard for the whole change. Restoring either field to the
  // destructure in consentController passes every test above and fails this one.
  const { service, calls } = await withStubbedModules(
    { [REFERRAL_SERVICE]: { sendConsent: async () => {} } },
    CONSENT_CONTROLLER,
  );

  const req = {
    body: {
      email: CLIENT,
      firstName: "Juan",
      lastName: "Cruz",
      branchName: "Somebody Else's Branch",
      referrerName: "Somebody Else",
    },
    user: STAFF,
  };

  const res = { status: () => res, json: () => {} };

  await service.sendConsent(req, res, (error) => {
    if (error) throw error;
  });

  const args = calls.find((c) => c.name === "sendConsent").args;

  assert.equal(args.includes("Somebody Else"), false);
  assert.equal(args.includes("Somebody Else's Branch"), false);
  // sendConsent(email, token, name, fullName, user)
  assert.equal(args[4], STAFF);
});
