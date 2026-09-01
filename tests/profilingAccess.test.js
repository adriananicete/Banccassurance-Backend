import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import referralRoutes from "../src/routes/referralRoutes.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";

const ID = "3821C86D-FED5-4D6B-9F23-A88E0D6AEAAB";

const STAFF = { UserCode: "USR-STF-00001", Role: "BRANCH_STAFF" };
const HEAD = { UserCode: "USR-BRH-00001", Role: "BRANCH_HEAD" };
const AO = { UserCode: "PHL-AO-00001", Role: "ACCOUNT_OFFICER" };
const OTHER_AO = { UserCode: "PHL-AO-00002", Role: "ACCOUNT_OFFICER" };

// A Landbank referral: the staff member created it, the AO is assigned to work it.
const landbank = (overrides) =>
  rows({
    Id: ID,
    Status: "Referred",
    ReferrerCode: STAFF.UserCode,
    AOCode: AO.UserCode,
    BranchCode: 3,
    FirstName: "Rosalinda",
    LastName: "Bacani",
    ...overrides,
  });

// An Account Officer's own referral. ReferrerCode and AOCode are both theirs and
// BranchCode is NULL -- the row shape that has no Landbank side at all.
const aoOwn = () =>
  landbank({ ReferrerCode: AO.UserCode, AOCode: AO.UserCode, BranchCode: null });

const ok = () => ({ run: async () => ({ recordset: [], rowsAffected: [1] }) });

const withReferral = (contact = landbank()) =>
  withStubbedModules({
    [REFERRAL_MODEL]: { getReferralContactInfo: contact, updateProfiling: ok },
  });

const profiling = { civilStatus: "Married", occupation: undefined };

test("the referrer may profile their own referral", async () => {
  const { service, calls } = await withReferral();

  await service.updateReferralProfiling(ID, profiling, STAFF);

  assert.ok(calls.find((c) => c.name === "updateProfiling"));
});

test("the assigned Account Officer may profile it too", async () => {
  // Added 2026-09-01. The AO is the one who meets the client, so the profiling
  // conversation is theirs -- but the route allowed only BRANCH_HEAD and
  // BRANCH_STAFF and the service compared ReferrerCode, so the AO was refused
  // twice over.
  const { service, calls } = await withReferral();

  await service.updateReferralProfiling(ID, profiling, AO);

  assert.ok(calls.find((c) => c.name === "updateProfiling"));
});

test("an Account Officer's own referral is profilable by them", async () => {
  // The row shape with no Landbank side. Before this change nobody could fill
  // its profiling: the AO was blocked by the route, and no Branch Staff matches
  // a ReferrerCode that is a PHL- code.
  const { service, calls } = await withReferral(aoOwn());

  await service.updateReferralProfiling(ID, profiling, AO);

  assert.ok(calls.find((c) => c.name === "updateProfiling"));
});

test("an Account Officer the referral is not assigned to is refused", async () => {
  // The AO arm must key on AOCode, not merely on the role. Matching by role
  // alone would let any Account Officer write any client's profiling.
  const { service, calls } = await withReferral();

  const error = await captureThrown(() =>
    service.updateReferralProfiling(ID, profiling, OTHER_AO),
  );

  assert.equal(error?.statusCode, 403);
  assert.equal(calls.find((c) => c.name === "updateProfiling"), undefined);
});

test("a Branch Head who did not create it is still refused", async () => {
  // Deliberately unchanged. canAccessReferral lets a Branch Head READ their
  // staff's referrals; writing the client's profiling stays with whoever
  // gathered it. Widening this was not part of the change.
  const { service } = await withReferral();

  const error = await captureThrown(() =>
    service.updateReferralProfiling(ID, profiling, HEAD),
  );

  assert.equal(error?.statusCode, 403);
});

test("a Landbank role is never matched against AOCode", async () => {
  // The guard branches on role rather than trying both columns. If it tried
  // both, a future role added to the route would silently match whichever
  // column happened to hold its code.
  const { service } = await withReferral(
    landbank({ ReferrerCode: "USR-STF-99999", AOCode: STAFF.UserCode }),
  );

  const error = await captureThrown(() =>
    service.updateReferralProfiling(ID, profiling, STAFF),
  );

  assert.equal(error?.statusCode, 403);
});

test("a missing referral is a 404 before any authorisation is decided", async () => {
  const { service } = await withReferral(rows());

  const error = await captureThrown(() =>
    service.updateReferralProfiling(ID, profiling, AO),
  );

  assert.equal(error?.statusCode, 404);
});

test("the model binds the fourteen parameters the procedure declares, and no Position", async () => {
  // banc.usp_upd_referrals_profiling takes @Id plus thirteen fields. We bound a
  // fourteenth, @Position, and every call answered 8144 "too many arguments".
  //
  // Position was the client's job title. It duplicated Occupation, which is
  // captured at creation and is the one the list procedure actually selects --
  // the same Role-versus-Position shape that removed Users.Position in A18.
  // Nothing in src/ ever read it back.
  //
  // banc.Referrals.Position is left alone deliberately. Asking for a column to
  // be dropped on a "nothing reads it" claim we cannot verify is what took the
  // login down on 2026-09-01.
  const { model, inputs } = await captureSql("../../src/models/referralModel.js");

  await model.updateProfiling("3821C86D-FED5-4D6B-9F23-A88E0D6AEAAB", {}).run();
  restoreSqlCapture();

  assert.equal(inputs.length, 14);
  assert.equal(inputs.find((i) => i.name === "Position"), undefined);
  assert.ok(inputs.find((i) => i.name === "Occupation") === undefined);
});

test("the route admits exactly the three roles that may profile", async () => {
  // The service guard is useless if the route refuses the AO first. This is the
  // half that was actually blocking, and it lives in a different file.
  const layer = referralRoutes.stack.find(
    (l) => l.route?.path === "/:id/profiling",
  );

  assert.ok(layer, "PUT /:id/profiling is not mounted");
  assert.equal(layer.route.stack.length, 3);
});
