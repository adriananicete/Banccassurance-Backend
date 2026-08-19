import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const noRows = () => ({ run: async () => ({ recordset: [] }) });

// getReferrerAttribution INNER JOINs Users to branches on BranchCode, which is
// NULL for every Account Officer, so it returns nothing for that role.
const withAttribution = ({ staff, ao }) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        getReferrerAttribution: staff ? rows(staff) : noRows,
        getAOAttribution: ao ? rows(ao) : noRows,
      },
    },
    REFERRAL_SERVICE,
  );

const AO_ROW = { ReferrerName: "Ana Reyes", AreaCode: 5, AreaName: "CENTRAL LUZON" };

const STAFF_ROW = {
  ReferrerCode: "USR-STF-0115",
  ReferrerName: "Juan Cruz",
  AOCode: "PHL-AO-0001",
  AOName: "Ana Reyes",
  BranchCode: 58,
  BranchName: "Makati",
  AreaCode: 1,
  AreaName: "NCR NORTH",
};

test("an Account Officer gets their own attribution instead of a 404", async () => {
  const { service } = await withAttribution({ ao: AO_ROW });

  const data = await service.getReferrerByCode({
    UserCode: "PHL-AO-1168",
    Role: "ACCOUNT_OFFICER",
  });

  assert.equal(data.ReferrerCode, "PHL-AO-1168");
  assert.equal(data.AreaCode, 5);
});

test("an Account Officer is their own Account Officer, and has no branch", async () => {
  // Matches the row createReferral writes for this role: ReferrerCode and
  // AOCode both the AO, BranchCode null, the referral belonging to an area.
  const { service } = await withAttribution({ ao: AO_ROW });

  const data = await service.getReferrerByCode({
    UserCode: "PHL-AO-1168",
    Role: "ACCOUNT_OFFICER",
  });

  assert.equal(data.AOCode, data.ReferrerCode);
  assert.equal(data.AOName, data.ReferrerName);
  assert.equal(data.BranchCode, null);
  assert.equal(data.BranchName, null);
});

test("an Account Officer is never sent through the branch-joined lookup", async () => {
  // The whole defect was calling the wrong one. Assert on which was asked for,
  // not just on the answer -- a plausible row from the wrong query passes any
  // shape-based check.
  const { service, calls } = await withAttribution({ ao: AO_ROW, staff: STAFF_ROW });

  await service.getReferrerByCode({ UserCode: "PHL-AO-1168", Role: "ACCOUNT_OFFICER" });

  assert.equal(calls.some((c) => c.name === "getAOAttribution"), true);
  assert.equal(calls.some((c) => c.name === "getReferrerAttribution"), false);
});

test("an Account Officer with no assigned branches is told exactly that", async () => {
  const { service } = await withAttribution({ ao: null });

  const error = await captureThrown(() =>
    service.getReferrerByCode({ UserCode: "PHL-AO-1168", Role: "ACCOUNT_OFFICER" }),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /no assigned branches/i);
});

test("Landbank roles still use the branch-joined lookup, unchanged", async () => {
  for (const Role of ["BRANCH_STAFF", "BRANCH_HEAD", "GROUP_HEAD", "SECTOR_HEAD"]) {
    const { service, calls } = await withAttribution({ staff: STAFF_ROW, ao: AO_ROW });

    const data = await service.getReferrerByCode({ UserCode: "USR-STF-0115", Role });

    assert.equal(data.BranchCode, 58, Role);
    assert.equal(calls.some((c) => c.name === "getReferrerAttribution"), true, Role);
    assert.equal(calls.some((c) => c.name === "getAOAttribution"), false, Role);
  }
});

test("a Landbank user with no branch row is still a 404", async () => {
  const { service } = await withAttribution({ staff: null });

  const error = await captureThrown(() =>
    service.getReferrerByCode({ UserCode: "USR-STF-9999", Role: "BRANCH_STAFF" }),
  );

  assert.equal(error?.statusCode, 404);
});
