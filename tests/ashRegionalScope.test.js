import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import { AREA_SALES_HEAD, REGIONAL_SALES_HEAD } from "../src/utils/constant.js";

// isAshInRegionalScope answered "does this Area Sales Head hold a group that I
// hold", by joining area_sales_head_areas to regional_sales_head_areas. That was
// right while an ASH claimed its group at registration.
//
// Since 2026-08-28 it does not: an ASH registers with a region and gets its
// groups from the RSH after approval. So a pending head holds nothing, the join
// matched nothing, and the Regional Sales Head could see the pending head in
// their queue and then be refused when they tried to approve them.
//
// ⚠️ Three call sites failed the same way and only one was visible. Approving
// was the one Adrian hit; assigning the groups and reading the scope would have
// failed next, on a head that had just been approved and still held nothing.
//
// It now asks the question the row can answer before any scope exists: is this
// head's region one of mine. That mirrors the Regional Sales Head block the DBA
// wrote into usp_sel_users_for_approval, so the queue and the action agree.

const USER_MODEL = "../../src/models/userModel.js";

const RSH = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-00001" };

const pendingAsh = target({
  IsActive: 0,
  Role: AREA_SALES_HEAD,
  UserCode: "PHL-ASH-00001",
  GroupCode: null,
});

test("the check reads the region on the user row, not the groups they hold", async () => {
  const { model, queries } = await captureSql(USER_MODEL);
  await model.isAshInRegionalScope("PHL-RSH-00001", "PHL-ASH-00001").run();
  restoreSqlCapture();

  assert.match(queries[0], /r\.RegionCode = u\.RegionCode/i);
  // The join that could not answer for a head with no groups yet.
  assert.doesNotMatch(queries[0], /area_sales_head_areas/i);
});

test("a pending Area Sales Head with no groups can be approved", async () => {
  // The failure Adrian hit: the head appeared in the queue and the approval
  // answered 403. A queue that lists somebody you cannot act on is worse than
  // one that hides them -- it reads as a permissions bug in the caller.
  const { service } = await withUserService({
    getUserScopeById: pendingAsh,
    isAshInRegionalScope: scopeHit,
    approveRejectUser: rows({
      Success: 1,
      Message: "User approved successfully.",
      FirstName: "Sara",
      Email: "ash@example.com",
      UserCode: "PHL-ASH-00001",
    }),
  });

  const result = await service.approveRejectUser(RSH, 7, "APPROVE");

  assert.equal(result.success, true);
});

test("a head in another region is still refused", async () => {
  // Non-vacuous half: dropping the check entirely would pass the test above and
  // let any Regional Sales Head approve any Area Sales Head in the country.
  const { service } = await withUserService({
    getUserScopeById: pendingAsh,
    isAshInRegionalScope: scopeMiss,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(RSH, 7, "APPROVE"),
  );

  assert.equal(error?.statusCode, 403);
});

test("the same check guards assigning and reading, not only approving", async () => {
  // The two that had not been reached yet. Both take a freshly approved head
  // who still holds nothing, which is exactly when the old query answered no.
  const model = {
    getUserScopeById: target({ IsActive: 1, Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-00001" }),
    isAshInRegionalScope: scopeMiss,
    getAreasOutsideRegionalSalesHeadScope: noRows,
    getGroupsAssignedToOtherASH: noRows,
    getAreaSalesHeadScope: noRows,
    replaceAreaSalesHeadAreas: () => ({ run: async () => {} }),
  };

  for (const call of [
    (s) => s.replaceAreaSalesHeadAreas(RSH, 7, [1]),
    (s) => s.getAreaSalesHeadAreas(RSH, 7),
  ]) {
    const { service } = await withUserService(model);
    const error = await captureThrown(() => call(service));

    assert.equal(error?.statusCode, 403);
  }
});
