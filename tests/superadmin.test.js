import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown, target } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  landBankRoles,
  philLifeRoles,
  referralCreatorRoles,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const ADMIN = { UserCode: "SYS-ADM-0001", UserId: 9001, Role: SUPERADMIN };

const approved = (overrides) => target({ IsActive: 1, ...overrides });
const pending = (overrides) => target({ IsActive: 0, ...overrides });

const actionOk = rows({
  Success: 1,
  Message: "User approved successfully.",
  FirstName: "Top",
  Email: "top@example.com",
  UserCode: "USR-SEC-0001",
});

test("SUPERADMIN cannot self-register and cannot create a referral", async () => {
  // Both fall out of existing lists rather than needing a guard, which is
  // exactly why they are worth pinning -- a later reader "completing" either
  // list grants self-registration to the top role.
  assert.equal(landBankRoles.includes(SUPERADMIN), false);
  assert.equal(philLifeRoles.includes(SUPERADMIN), false);
  assert.equal(referralCreatorRoles.includes(SUPERADMIN), false);
});

test("register refuses SUPERADMIN before it looks anything up", async () => {
  const { service, calls } = await withUserService({});

  const error = await captureThrown(() =>
    service.register({ role: SUPERADMIN, firstName: "IT", lastName: "Admin" }),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /invalid role/i);
  assert.equal(calls.length, 0, "nothing should be queried for a refused role");
});

test("approving is limited to the two roles nobody else can approve", async () => {
  for (const role of [SECTOR_HEAD, DEPARTMENT_HEAD]) {
    const { service } = await withUserService({
      getUserScopeById: pending({ Role: role, UserCode: "USR-SEC-0001" }),
      approveRejectUser: actionOk,
    });

    const result = await service.approveRejectUser(ADMIN, 1784, "APPROVE");
    assert.equal(result.success, true, role);
  }
});

test("approving any other role is refused, and the message says who should", async () => {
  for (const role of [ACCOUNT_OFFICER, AREA_SALES_HEAD, REGIONAL_SALES_HEAD, BRANCH_STAFF]) {
    const { service, calls } = await withUserService({
      getUserScopeById: pending({ Role: role }),
      approveRejectUser: actionOk,
    });

    const error = await captureThrown(() =>
      service.approveRejectUser(ADMIN, 1784, "APPROVE"),
    );

    assert.equal(error?.statusCode, 403, role);
    assert.match(error.message, /Sector Heads and Department Heads/i, role);
    assert.equal(
      calls.some((c) => c.name === "approveRejectUser"),
      false,
      `${role} must not be written`,
    );
  }
});

test("rejecting reaches any role, which is how deactivation works", async () => {
  // The asymmetry this branch exists for: APPROVE narrows to two roles, REJECT
  // does not narrow at all. Every other role in this function runs one guard for
  // both actions, so flattening these two back together is an easy mistake.
  for (const role of [ACCOUNT_OFFICER, AREA_SALES_HEAD, BRANCH_STAFF, SECTOR_HEAD]) {
    const { service } = await withUserService({
      getUserScopeById: pending({ Role: role }),
      approveRejectUser: actionOk,
    });

    const result = await service.approveRejectUser(ADMIN, 1784, "REJECT");
    assert.equal(result.success, true, role);
  }
});

test("a superadmin cannot deactivate itself", async () => {
  const { service, calls } = await withUserService({
    getUserScopeById: pending({ Role: SUPERADMIN, UserCode: ADMIN.UserCode }),
    approveRejectUser: actionOk,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(ADMIN, 9001, "REJECT"),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /your own account/i);
  assert.equal(calls.some((c) => c.name === "approveRejectUser"), false);
});

test("the audit actor is the superadmin, never the target", async () => {
  // Getting this backwards produces a log that reads plausibly and is useless.
  const recorded = [];
  const { service } = await withUserService(
    {
      getUserScopeById: pending({ Role: SECTOR_HEAD, UserCode: "USR-SEC-0001" }),
      approveRejectUser: actionOk,
    },
    { audit: { record: async (entry) => recorded.push(entry) } },
  );

  await service.approveRejectUser(ADMIN, 1784, "APPROVE");

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].actorUserCode, ADMIN.UserCode);
  assert.equal(recorded[0].entityId, "USR-SEC-0001");
  assert.equal(recorded[0].action, "USER_APPROVED");
});

test("the approval list returns both top roles across both tenants", async () => {
  // The superadmin has no branch, no area and no tenant, so its block in
  // usp_sel_users_for_approval filters on role alone. The caller still has to
  // arrive whole: SYS- is not a tenant getTenant accepts, and a scope field
  // invented for this role is how it would start behaving like a PhilLife user.
  const { service, calls } = await withUserService({
    getUsersForApproval: rows(
      { UserCode: "USR-SEC-0002", Role: SECTOR_HEAD, Status: "PENDING" },
      { UserCode: "PHL-DH-0002", Role: DEPARTMENT_HEAD, Status: "PENDING" },
    ),
  });

  const result = await service.getUsersForApproval(ADMIN, {
    StatusFilter: "PENDING",
    PageNumber: 1,
    PageSize: 20,
  });

  const [passedUser, passedOptions] = calls.find(
    (c) => c.name === "getUsersForApproval",
  ).args;

  assert.equal(passedUser.Role, SUPERADMIN);
  assert.equal(passedUser.UserCode, ADMIN.UserCode);
  assert.equal(passedOptions.StatusFilter, "PENDING");
  assert.deepEqual(result.data.map((r) => r.Role), [SECTOR_HEAD, DEPARTMENT_HEAD]);
});

test("assigning branches skips the caller's scope checks but not the one-AO rule", async () => {
  // "Ignoring the caller's own scope" is the point of the role. The 409 is not a
  // scope rule -- a branch belongs to one Account Officer whoever is assigning.
  const { service, calls } = await withUserService({
    getUserScopeById: approved({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-1170" }),
    isAreaInAreaSalesHeadScope: noRows,
    getBranchesOutsideAreaSalesHeadScope: rows({ BranchCode: 999 }),
    getBranchesAssignedToOtherAO: noRows,
    replaceAccountOfficerBranches: () => ({ run: async () => ({ recordset: [] }) }),
  });

  const result = await service.replaceAccountOfficerBranches(ADMIN, 1784, [58, 59]);

  assert.equal(result.success, true);
  const names = calls.map((c) => c.name);
  assert.equal(names.includes("isAreaInAreaSalesHeadScope"), false, "caller scope skipped");
  assert.equal(names.includes("getBranchesOutsideAreaSalesHeadScope"), false, "area check skipped");
  assert.equal(names.includes("getBranchesAssignedToOtherAO"), true, "ownership still enforced");
});

test("a branch held by another Account Officer is still a 409 for a superadmin", async () => {
  const { service } = await withUserService({
    getUserScopeById: approved({ Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-1170" }),
    getBranchesAssignedToOtherAO: rows({ BranchCode: 58 }),
  });

  const error = await captureThrown(() =>
    service.replaceAccountOfficerBranches(ADMIN, 1784, [58]),
  );

  assert.equal(error?.statusCode, 409);
});

test("a superadmin may empty an Area Sales Head's groups; a Regional Sales Head may not", async () => {
  // The guard exists because an RSH's reach comes from a shared area, so
  // emptying the set revokes its own ability to undo. A superadmin's reach does
  // not, and it is the only role that can recover an account already stranded.
  const admin = await withUserService({
    getUserScopeById: approved({ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1165" }),
    replaceAreaSalesHeadAreas: () => ({ run: async () => ({ recordset: [] }) }),
  });

  const cleared = await admin.service.replaceAreaSalesHeadAreas(ADMIN, 1784, []);
  assert.equal(cleared.success, true);

  const rsh = await withUserService({
    getUserScopeById: approved({ Role: AREA_SALES_HEAD }),
  });

  const error = await captureThrown(() =>
    rsh.service.replaceAreaSalesHeadAreas(
      { UserCode: "PHL-RSH-0003", Role: REGIONAL_SALES_HEAD },
      1784,
      [],
    ),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /at least one group/i);
});

test("a superadmin assigning areas skips the region check but not the existence check", async () => {
  const { service, calls } = await withUserService({
    getUserScopeById: approved({ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-1165" }),
    isAshInRegionalScope: noRows,
    getAreasOutsideRegionalSalesHeadScope: rows({ GroupCode:5 }),
    // One Area Sales Head per group binds the superadmin too. The region check
    // is the caller's own scope and is theirs to skip; this one is a rule about
    // the data and nobody is above it.
    getGroupsAssignedToOtherASH: noRows,
    getUnknownAreas: rows({ GroupCode:99 }),
  });

  const error = await captureThrown(() =>
    service.replaceAreaSalesHeadAreas(ADMIN, 1784, [99]),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /do not exist/i);

  const names = calls.map((c) => c.name);
  assert.equal(names.includes("isAshInRegionalScope"), false);
  assert.equal(names.includes("getAreasOutsideRegionalSalesHeadScope"), false);
  // But the one-head-per-group rule still runs.
  assert.equal(names.includes("getGroupsAssignedToOtherASH"), true);
});

test("the target must still exist and still be approved", async () => {
  // Bypassing the caller's scope does not bypass the target's own state.
  const missing = await withUserService({ getUserScopeById: noRows });
  const gone = await captureThrown(() =>
    missing.service.replaceAccountOfficerBranches(ADMIN, 1784, [58]),
  );
  assert.equal(gone?.statusCode, 404);

  const unapproved = await withUserService({
    getUserScopeById: pending({ Role: ACCOUNT_OFFICER }),
  });
  const tooEarly = await captureThrown(() =>
    unapproved.service.replaceAccountOfficerBranches(ADMIN, 1784, [58]),
  );
  assert.equal(tooEarly?.statusCode, 400);
  assert.match(tooEarly.message, /not been approved/i);
});

test("an already-approved user is still refused, superadmin or not", async () => {
  const { service } = await withUserService({
    getUserScopeById: approved({ Role: SECTOR_HEAD }),
    approveRejectUser: actionOk,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(ADMIN, 1784, "APPROVE"),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /already been approved or rejected/i);
});
