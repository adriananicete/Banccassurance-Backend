import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture, selectedColumns } from "./helpers/captureSql.js";

// ⚠️ This file imports nothing from src/ at the top on purpose.
//
// captureSql mocks config/db.js and re-imports the module under test, but the
// modules *that* module imports resolve to the cached copy. referralModel
// imports auditModel, so if anything here loaded referralService first,
// auditModel would already be bound to the real sql and its INSERT would try to
// reach a database that is not there. Keeping this test alone in its own file
// is what makes the nested binding come out right.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const ID = "6F9619FF-8B86-D011-B42D-00C04FC964FF";

test("the delete lookup reads no scope column, so scope cannot decide the answer", async () => {
  // Deleting is an ownership question and reading is a scope question, and the
  // two have different answers. canAccessReferral lets a Branch Head reach
  // their staff's referrals through BranchCode and an Account Officer reach
  // theirs through AOCode -- both can read a row neither created.
  //
  // Making the service compare ReferrerCode is one half. Not selecting the
  // scope columns at all is the other, and it is the half that survives
  // somebody later "reusing" canAccessReferral here: with no BranchCode and no
  // AOCode in the recordset there is nothing for it to match on.
  const { model, queries } = await captureSql("../../src/models/referralModel.js");

  await model.getReferralForDeletion(ID).run();
  restoreSqlCapture();

  // referralModel brackets its identifiers; selectedColumns keeps them.
  const selected = selectedColumns(queries[0]).map((c) => c.replace(/[[\]]/g, ""));

  assert.ok(selected.includes("ReferrerCode"));
  assert.equal(selected.includes("BranchCode"), false);
  assert.equal(selected.includes("AOCode"), false);
  assert.equal(selected.includes("GroupCode"), false);
});

test("the consent is released before the referral goes, in one transaction", async () => {
  // The half that makes this a cleanup rather than a hole. usp_ins_referrals
  // stamps ConsumedAt and ConsumedByReferralId on the consent when the referral
  // is created, and consent is single use -- usp_check_consent only offers a
  // row where ConsumedAt IS NULL. Deleting the referral without releasing it
  // would burn that client's consent permanently: the test referral is gone and
  // cannot be made again, which is the opposite of cleaning up.
  //
  // Matching on ConsumedByReferralId rather than on the referral's own
  // ConsentToken copy: that column is what usp_ins_referrals wrote, so it is
  // the link itself rather than a denormalised echo of it.
  const { model, transactions } = await captureSql(REFERRAL_MODEL);

  await model
    .deleteReferral(ID, {
      actorUserCode: "USR-STF-00007",
      action: "REFERRAL_DELETED",
      entityType: "REFERRAL",
      entityId: "REF-20260828-A1B2C3",
      detail: "Referred",
    })
    .run();

  restoreSqlCapture();

  const events = transactions[0].events;
  const at = (needle) => events.findIndex((e) => e.includes(needle));

  assert.equal(events[0], "begin");
  assert.equal(events[events.length - 1], "commit");

  assert.notEqual(at("consent_request"), -1, "the consent is never released");
  assert.ok(at("consent_request") < at("DELETE FROM [banc].[Referrals]"));
  assert.ok(at("AuditLog") < at("DELETE FROM [banc].[Referrals]"));

  // Clearing ConsumedAt alone would leave ConsumedByReferralId pointing at a
  // row that no longer exists.
  const release = events[at("consent_request")];
  assert.match(release, /ConsumedAt\]\s*=\s*NULL/);
  assert.match(release, /ConsumedByReferralId\]\s*=\s*NULL/);
});
