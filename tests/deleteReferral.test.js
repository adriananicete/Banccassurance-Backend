import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { withStubbedModules, rows, restoreStubs } from "./helpers/stubModel.js";
import {
  ACCOUNT_OFFICER,
  BRANCH_HEAD,
  BRANCH_STAFF,
} from "../src/utils/constant.js";

// A UAT cleanup, scoped to the one person who can be sure the referral was a
// test: whoever created it. Nobody else -- not the Branch Head above them, not
// the Account Officer it was assigned to, not a superadmin. Access to read a
// referral is a scope question; deleting one is an ownership question, and
// canAccessReferral answers the wrong one for this.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const ID = "6F9619FF-8B86-D011-B42D-00C04FC964FF";

const staff = { UserCode: "USR-STF-00007", Role: BRANCH_STAFF, BranchCode: 71 };

const referral = (overrides) =>
  rows({
    Id: ID,
    ReferralNo: "REF-20260828-A1B2C3",
    ReferrerCode: "USR-STF-00007",
    Status: "Referred",
    ...overrides,
  });

const withService = (model) =>
  withStubbedModules({ [REFERRAL_MODEL]: model }, REFERRAL_SERVICE);

const model = (overrides) => ({
  getReferralForDeletion: referral(),
  deleteReferral: () => ({ run: async () => {} }),
  ...overrides,
});

const thrown = async (action) => {
  try {
    await action();
    return null;
  } catch (error) {
    return error;
  }
};

test("the referrer deletes their own referral, and it is audited", async () => {
  const { service, calls } = await withService(model());

  const result = await service.deleteReferral(ID, staff);
  const [, audit] = calls.find((c) => c.name === "deleteReferral").args;

  restoreStubs();

  assert.equal(result.success, true);
  assert.equal(result.referralNo, "REF-20260828-A1B2C3");
  assert.equal(audit.action, "REFERRAL_DELETED");
  assert.equal(audit.actorUserCode, "USR-STF-00007");
  assert.equal(audit.entityId, "REF-20260828-A1B2C3");
});

test("somebody else's referral is refused, even by the Branch Head above it", async () => {
  // A Branch Head can read every referral from their branch and did not create
  // this one. deleteReferralSql.test.js carries the structural half: the lookup
  // selects no BranchCode and no AOCode, so scope has nothing to match on even
  // if somebody later reaches for canAccessReferral here.
  const head = { UserCode: "USR-BRH-00002", Role: BRANCH_HEAD, BranchCode: 71 };

  const { service } = await withService(model());
  const error = await thrown(() => service.deleteReferral(ID, head));

  restoreStubs();

  assert.equal(error.statusCode, 403);
  assert.match(error.message, /only delete a referral you created/);
});

test("an Account Officer may delete the referral they made themselves", async () => {
  // An AO's own referral carries ReferrerCode and AOCode both set to their own
  // UserCode. It is the one case where creator and handler are the same person,
  // and the ownership rule has to let it through.
  const ao = { UserCode: "PHL-AO-00003", Role: ACCOUNT_OFFICER, BranchCode: null };

  const { service } = await withService(
    model({ getReferralForDeletion: referral({ ReferrerCode: "PHL-AO-00003" }) }),
  );

  const result = await service.deleteReferral(ID, ao);
  restoreStubs();

  assert.equal(result.success, true);
});

test("a referral assigned to an Account Officer is not theirs to delete", async () => {
  // The other half of the case above: a Landbank referral sets AOCode to the
  // handler and ReferrerCode to somebody else. Reading AOCode here instead of
  // ReferrerCode would pass the test above and be wrong.
  const ao = { UserCode: "PHL-AO-00003", Role: ACCOUNT_OFFICER, BranchCode: null };

  const { service } = await withService(model());
  const error = await thrown(() => service.deleteReferral(ID, ao));

  restoreStubs();

  assert.equal(error.statusCode, 403);
});

test("a missing referral is a 404", async () => {
  const { service } = await withService(
    model({ getReferralForDeletion: () => ({ run: async () => ({ recordset: [] }) }) }),
  );

  const error = await thrown(() => service.deleteReferral(ID, staff));
  restoreStubs();

  assert.equal(error.statusCode, 404);
});

test("it is refused in production, whoever asks", async () => {
  // A referral is a client record, not a row. There is no pending-only carve
  // out here the way there is for accounts.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const { service } = await withService(model());
  const error = await thrown(() => service.deleteReferral(ID, staff));

  process.env.NODE_ENV = previous;
  restoreStubs();

  assert.equal(error.statusCode, 403);
  assert.match(error.message, /production/);
});

// The SQL this issues is asserted in deleteReferralSql.test.js. It has to live
// in a file of its own: captureSql re-imports the module under test, but the
// modules *that* module imports resolve to the cached copy, so auditModel would
// stay bound to the real sql once anything here has loaded referralService.
