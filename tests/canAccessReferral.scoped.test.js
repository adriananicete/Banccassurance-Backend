import "dotenv/config";
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
  AreaCode: 5,
  AOCode: "PHL-AO-0001",
  ...overrides,
});

test("Area Sales Head access follows area_sales_head_areas, not Users.AreaCode", async () => {
  const user = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167", AreaCode: null };

  const hit = await withStubbedUserModel({ isAreaInAreaSalesHeadScope: scopeHit });
  assert.equal(await hit.service.canAccessReferral(referral(), user), true);

  const miss = await withStubbedUserModel({ isAreaInAreaSalesHeadScope: scopeMiss });
  assert.equal(await miss.service.canAccessReferral(referral(), user), false);
});

test("Area Sales Head lookup is given the caller's UserCode and the referral's area", async () => {
  const user = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167", AreaCode: null };
  const { service, calls } = await withStubbedUserModel({
    isAreaInAreaSalesHeadScope: scopeHit,
  });

  await service.canAccessReferral(referral({ AreaCode: 5 }), user);

  assert.deepEqual(calls, [
    { name: "isAreaInAreaSalesHeadScope", args: ["PHL-ASH-1167", 5] },
  ]);
});

test("Sector Head lookup is keyed by UserId, the others by UserCode", async () => {
  const user = { Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" };
  const { service, calls } = await withStubbedUserModel({
    isAreaInSectorScope: scopeHit,
  });

  await service.canAccessReferral(referral({ AreaCode: 5 }), user);

  assert.deepEqual(calls, [{ name: "isAreaInSectorScope", args: [42, 5] }]);
});

test("Sector Head is denied when the area is outside banc.user_area", async () => {
  const user = { Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" };
  const { service } = await withStubbedUserModel({ isAreaInSectorScope: scopeMiss });
  assert.equal(await service.canAccessReferral(referral(), user), false);
});

test("Regional Sales Head access follows regional_sales_head_areas", async () => {
  const user = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001", AreaCode: null };

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

  await service.canAccessReferral(referral({ AreaCode: 12 }), user);

  assert.deepEqual(calls, [{ name: "isAreaInRegionalScope", args: ["PHL-RSH-0001", 12] }]);
});

test("the three scoped roles each consult exactly one lookup", async () => {
  const cases = [
    [{ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167" }, "isAreaInAreaSalesHeadScope"],
    [{ Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" }, "isAreaInSectorScope"],
    [{ Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" }, "isAreaInRegionalScope"],
  ];

  for (const [user, expected] of cases) {
    const { service, calls } = await withStubbedUserModel({
      isAreaInAreaSalesHeadScope: scopeHit,
      isAreaInSectorScope: scopeHit,
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
