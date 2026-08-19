import test from "node:test";
import assert from "node:assert/strict";
import { rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  REGIONAL_SALES_HEAD,
} from "../src/utils/constant.js";

const areaSalesHead = { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1167" };

const approved = rows({ Success: 1, Message: "User APPROVED successfully.", FirstName: "Test", Email: "x@example.com", UserCode: "PHL-AO-1168" });

const approvingAnAccountOfficer = (targetOverrides) => ({
  getUserScopeById: target(targetOverrides),
  isAreaInAreaSalesHeadScope: scopeHit,
  approveRejectUser: approved,
});

test("IsActive arrives from a bit column as a boolean, and pending must still be recognised", async () => {
  for (const pending of [false, 0]) {
    const { service } = await withUserService(approvingAnAccountOfficer({ IsActive: pending }));
    const result = await service.approveRejectUser(areaSalesHead, 1784, "APPROVE");
    assert.equal(result.success, true, `IsActive ${JSON.stringify(pending)}`);
  }
});

test("an already-settled user is refused, whichever shape the driver returns", async () => {
  for (const settled of [true, 1, -1, null, undefined]) {
    const { service } = await withUserService(approvingAnAccountOfficer({ IsActive: settled }));
    const error = await captureThrown(() =>
      service.approveRejectUser(areaSalesHead, 1784, "APPROVE"),
    );

    assert.equal(error?.statusCode, 400, `IsActive ${JSON.stringify(settled)}`);
    assert.match(error.message, /already been approved or rejected/i);
  }
});

test("an unknown user is a 404 before anything else is consulted", async () => {
  const { service, calls } = await withUserService({ getUserScopeById: noRows });
  const error = await captureThrown(() =>
    service.approveRejectUser(areaSalesHead, 999999, "APPROVE"),
  );

  assert.equal(error?.statusCode, 404);
  assert.deepEqual(calls.map((call) => call.name), ["getUserScopeById"]);
});

test("the role check runs before the state check, so an out-of-scope caller learns nothing", async () => {
  const { service } = await withUserService({
    getUserScopeById: target({ IsActive: true }),
    approveRejectUser: approved,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser({ Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" }, 1784, "APPROVE"),
  );

  assert.equal(error?.statusCode, 403);
  assert.match(error.message, /forbidden/i);
});

test("an Area Sales Head may only approve Account Officers", async () => {
  const { service } = await withUserService({
    getUserScopeById: target({ Role: BRANCH_STAFF }),
    isAreaInAreaSalesHeadScope: scopeHit,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(areaSalesHead, 1784, "APPROVE"),
  );
  assert.equal(error?.statusCode, 403);
});

test("an Area Sales Head is refused an Account Officer outside their areas", async () => {
  const { service } = await withUserService({
    getUserScopeById: target(),
    isAreaInAreaSalesHeadScope: scopeMiss,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(areaSalesHead, 1784, "APPROVE"),
  );
  assert.equal(error?.statusCode, 403);
});

test("the Area Sales Head scope lookup is given the caller's code and the target's area", async () => {
  const { service, calls } = await withUserService(approvingAnAccountOfficer());
  await service.approveRejectUser(areaSalesHead, 1784, "APPROVE");

  assert.deepEqual(
    calls.find((call) => call.name === "isAreaInAreaSalesHeadScope").args,
    ["PHL-ASH-1167", "5"],
  );
});

test("a Branch Head may only approve Branch Staff in their own branch", async () => {
  const branchHead = { Role: BRANCH_HEAD, UserCode: "USR-BRH-0058", BranchCode: 58 };

  const inBranch = await withUserService({
    getUserScopeById: target({ Role: BRANCH_STAFF, BranchCode: 58 }),
    approveRejectUser: approved,
  });
  assert.equal((await inBranch.service.approveRejectUser(branchHead, 1784, "APPROVE")).success, true);

  const otherBranch = await withUserService({
    getUserScopeById: target({ Role: BRANCH_STAFF, BranchCode: 59 }),
  });
  const error = await captureThrown(() =>
    otherBranch.service.approveRejectUser(branchHead, 1784, "APPROVE"),
  );
  assert.equal(error?.statusCode, 403);
});

test("a role with no approval branch at all is refused", async () => {
  const { service } = await withUserService({ getUserScopeById: target() });

  const error = await captureThrown(() =>
    service.approveRejectUser({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-0001" }, 1784, "APPROVE"),
  );
  assert.equal(error?.statusCode, 403);
});
