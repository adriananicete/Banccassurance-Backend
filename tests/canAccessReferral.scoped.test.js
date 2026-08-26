import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedUserModel, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import {
  AREA_SALES_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
} from "../src/utils/constant.js";

const referral = (overrides) => ({
  ReferrerCode: "USR-STF-0115",
  BranchCode: 58,
  GroupCode: 5,
  AOCode: "PHL-AO-0001",
  ...overrides,
});

test("Area Sales Head access follows area_sales_head_areas, not Users.AreaCode", async () => {
  const user = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167", GroupCode: null };

  const hit = await withStubbedUserModel({ isAreaInAreaSalesHeadScope: scopeHit });
  assert.equal(await hit.service.canAccessReferral(referral(), user), true);

  const miss = await withStubbedUserModel({ isAreaInAreaSalesHeadScope: scopeMiss });
  assert.equal(await miss.service.canAccessReferral(referral(), user), false);
});

test("Area Sales Head lookup is given the caller's UserCode and the referral's area", async () => {
  const user = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167", GroupCode: null };
  const { service, calls } = await withStubbedUserModel({
    isAreaInAreaSalesHeadScope: scopeHit,
  });

  await service.canAccessReferral(referral({ GroupCode: 5 }), user);

  assert.deepEqual(calls, [
    { name: "isAreaInAreaSalesHeadScope", args: ["PHL-ASH-1167", 5] },
  ]);
});

test("Sector Head consults no scope lookup at all", async () => {
  // There is one Sector Head and they hold the whole Landbank tenant, so a
  // tenant check is their entire scope. banc.user_area belongs to Group Heads;
  // reading it here resolved the role to nothing and froze every approval.
  const user = { Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" };
  const { service, calls } = await withStubbedUserModel({});

  assert.equal(await service.canAccessReferral(referral({ GroupCode: 5 }), user), true);
  assert.deepEqual(calls, []);
});

test("Sector Head reaches any area of their own tenant, and none of the other", async () => {
  const user = { Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" };
  const { service } = await withStubbedUserModel({});

  for (const GroupCode of [1, 9, 15]) {
    assert.equal(await service.canAccessReferral(referral({ GroupCode }), user), true);
  }

  assert.equal(
    await service.canAccessReferral(referral({ ReferrerCode: "PHL-AO-0001" }), user),
    false,
  );
});

test("Sector Head reads ReferrerCode, not AOCode", async () => {
  // Landbank scopes on who created the referral; PhilLife on who handles it.
  // Reading AOCode here would hand a Sector Head the PhilLife side of every
  // cross-tenant referral, which is the whole point of the boundary.
  const user = { Role: SECTOR_HEAD, UserCode: "USR-SEC-0001" };
  const { service } = await withStubbedUserModel({});

  const landbankReferral = referral({ ReferrerCode: "USR-STF-0115", AOCode: "PHL-AO-0001" });
  assert.equal(await service.canAccessReferral(landbankReferral, user), true);

  const philLifeReferral = referral({ ReferrerCode: "PHL-AO-0001", AOCode: "USR-STF-0115" });
  assert.equal(await service.canAccessReferral(philLifeReferral, user), false);
});

test("Sector Head is denied, not errored, when ReferrerCode is not a user code", async () => {
  const user = { Role: SECTOR_HEAD, UserCode: "USR-SEC-0001" };
  const { service } = await withStubbedUserModel({});

  for (const code of ["as-123", null, ""]) {
    assert.equal(
      await service.canAccessReferral(referral({ ReferrerCode: code }), user),
      false,
      String(code),
    );
  }
});

test("Regional Sales Head access follows regional_sales_head_areas", async () => {
  const user = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001", GroupCode: null };

  const hit = await withStubbedUserModel({ isAreaInRegionalScope: scopeHit });
  assert.equal(await hit.service.canAccessReferral(referral(), user), true);

  const miss = await withStubbedUserModel({ isAreaInRegionalScope: scopeMiss });
  assert.equal(await miss.service.canAccessReferral(referral(), user), false);
});

test("Regional Sales Head lookup is given the caller's UserCode and the referral's area", async () => {
  const user = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" };
  const { service, calls } = await withStubbedUserModel({
    isAreaInRegionalScope: scopeHit,
  });

  await service.canAccessReferral(referral({ GroupCode: 12 }), user);

  assert.deepEqual(calls, [{ name: "isAreaInRegionalScope", args: ["PHL-RSH-0001", 12] }]);
});

test("the two junction-scoped roles each consult exactly one lookup", async () => {
  // Only the PhilLife middle roles hold several areas and therefore need a
  // junction table. Sector Head is deliberately absent: it holds the tenant.
  const cases = [
    [{ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167" }, "isAreaInAreaSalesHeadScope"],
    [{ Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" }, "isAreaInRegionalScope"],
  ];

  for (const [user, expected] of cases) {
    const { service, calls } = await withStubbedUserModel({
      isAreaInAreaSalesHeadScope: scopeHit,
      isAreaInRegionalScope: scopeHit,
    });

    await service.canAccessReferral(referral(), user);

    assert.deepEqual(
      calls.map((call) => call.name),
      [expected],
      user.Role,
    );
  }
});
