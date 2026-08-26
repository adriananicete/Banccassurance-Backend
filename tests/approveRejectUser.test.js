import test from "node:test";
import assert from "node:assert/strict";
import { rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
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
    ["PHL-ASH-1167", 5],
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

const groupHead = { Role: GROUP_HEAD, UserCode: "USR-GRH-0031", GroupCode: 2 };

const approvingABranchHead = (targetOverrides) => ({
  getUserScopeById: target({ Role: BRANCH_HEAD, AreaCode: 2, ...targetOverrides }),
  approveRejectUser: approved,
});

test("a Group Head approves a Branch Head in their own group", async () => {
  // This branch compares the session's group against the target's row and had no
  // test at all, so the rename from AreaCode to GroupCode passed through it
  // unseen. It is a scope check: getting it wrong is a 403 for every legitimate
  // approval, or an approval nobody was entitled to make.
  const { service } = await withUserService(approvingABranchHead());

  const result = await service.approveRejectUser(groupHead, 1784, "APPROVE");

  assert.equal(result.success, true);
});

test("a Group Head may not approve a Branch Head from another group", async () => {
  const { service } = await withUserService(approvingABranchHead({ AreaCode: 7 }));

  const error = await captureThrown(() =>
    service.approveRejectUser(groupHead, 1784, "APPROVE"),
  );

  assert.equal(error?.statusCode, 403);
});

test("a Group Head session carrying only the old AreaCode approves nobody", async () => {
  // Fails closed rather than open: undefined matches no group, so a stale
  // session is refused instead of being let through against the wrong one.
  const stale = { Role: GROUP_HEAD, UserCode: "USR-GRH-0031", AreaCode: 2 };
  const { service } = await withUserService(approvingABranchHead());

  const error = await captureThrown(() => service.approveRejectUser(stale, 1784, "APPROVE"));

  assert.equal(error?.statusCode, 403);
});

test("a Group Head may only approve Branch Heads", async () => {
  // The role check and the group check sit in one condition. Asserting the role
  // half separately keeps a future edit from dropping it while the group half
  // still passes.
  const { service } = await withUserService(approvingABranchHead({ Role: BRANCH_STAFF }));

  const error = await captureThrown(() =>
    service.approveRejectUser(groupHead, 1784, "APPROVE"),
  );

  assert.equal(error?.statusCode, 403);
});

const sectorHead = { Role: SECTOR_HEAD, UserId: 42, UserCode: "USR-SEC-0001" };

test("a Sector Head approves a Group Head from any group, consulting no scope lookup", async () => {
  // One Sector Head holds all of Landbank. This branch used to read
  // banc.user_area — the Group Heads' own table — where the Sector Head has no
  // rows, so every approval was a 403 and sixteen Group Heads sat pending with
  // nobody able to act on them.
  for (const AreaCode of [1, 9, 15]) {
    const { service, calls } = await withUserService({
      getUserScopeById: target({ Role: GROUP_HEAD, AreaCode }),
      approveRejectUser: approved,
    });

    const result = await service.approveRejectUser(sectorHead, 1784, "APPROVE");

    assert.equal(result.success, true, `area ${AreaCode}`);
    assert.deepEqual(
      calls.filter((call) => call.name.startsWith("isArea")),
      [],
      `area ${AreaCode}`,
    );
  }
});

test("a Sector Head may only approve Group Heads", async () => {
  // The role check and the scope check were adjacent and only the scope one was
  // wrong. Removing both would let a Sector Head approve a Branch Head, which
  // is the level below the one they own.
  for (const role of [BRANCH_HEAD, BRANCH_STAFF, ACCOUNT_OFFICER]) {
    const { service } = await withUserService({
      getUserScopeById: target({ Role: role }),
      approveRejectUser: approved,
    });

    const error = await captureThrown(() =>
      service.approveRejectUser(sectorHead, 1784, "APPROVE"),
    );
    assert.equal(error?.statusCode, 403, role);
  }
});

test("a role with no approval branch at all is refused", async () => {
  const { service } = await withUserService({ getUserScopeById: target() });

  const error = await captureThrown(() =>
    service.approveRejectUser({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-0001" }, 1784, "APPROVE"),
  );
  assert.equal(error?.statusCode, 403);
});
