import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, captureThrown } from "./helpers/userService.js";
import {
  approverRoles,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const pendingUser = rows({
  UserId: 619,
  UserCode: "USR-GRH-0614",
  Role: "GROUP_HEAD",
  IsActive: 0,
  TotalCount: 16,
});

const everyLookup = {
  getUsersForApproval: pendingUser,
  getBranchHeadsForApproval: pendingUser,
  getGroupHeadsForApproval: pendingUser,
  getRegionalSalesHeadsForApproval: pendingUser,
  getAreaSalesHeadsForApproval: pendingUser,
  getAccountOfficersForApproval: pendingUser,
  getTopLevelHeadsForApproval: pendingUser,
};

const routes = [
  [{ Role: BRANCH_HEAD, BranchCode: 58 }, "getUsersForApproval"],
  [{ Role: GROUP_HEAD, AreaCode: 2 }, "getBranchHeadsForApproval"],
  [{ Role: SECTOR_HEAD, UserCode: "USR-SEC-0029" }, "getGroupHeadsForApproval"],
  [{ Role: DEPARTMENT_HEAD, UserCode: "PHL-DH-0001" }, "getRegionalSalesHeadsForApproval"],
  [{ Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" }, "getAreaSalesHeadsForApproval"],
  [{ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-0005" }, "getAccountOfficersForApproval"],
  [{ Role: SUPERADMIN, UserCode: "SYS-ADM-0001" }, "getTopLevelHeadsForApproval"],
];

test("the route guard and the service agree on who may approve", () => {
  // Two lists that must match and, until now, nothing connected. A role allowed
  // through requireRole but absent from the service's table passes the guard and
  // then gets "Invalid Role" - a 403's worth of intent answered with a 400 that
  // reads like the caller's mistake.
  assert.deepEqual(
    routes.map(([user]) => user.Role).sort(),
    [...approverRoles].sort(),
  );
});

test("each approver role consults exactly its own lookup", async () => {
  // Seven near-identical branches became a lookup table, and a table is easy to
  // get subtly wrong: one wrong key routes a role to somebody else's query and
  // answers with a plausible list. Assert which lookup was asked for, not the
  // shape of what came back.
  for (const [user, expected] of routes) {
    const { service, calls } = await withUserService(everyLookup);

    await service.getUsersForApproval(user, "PENDING");

    assert.deepEqual(
      calls.map((call) => call.name).filter((name) => name.startsWith("get")),
      [expected],
      user.Role,
    );
  }
});

test("the caller's own scope reaches the lookup that needs it", async () => {
  // Three of the seven are scoped to the caller. Passing the wrong field - or
  // the right field for the wrong role - is the defect family that has produced
  // most of this codebase's bugs.
  const scoped = [
    [{ Role: BRANCH_HEAD, BranchCode: 58 }, 58],
    [{ Role: GROUP_HEAD, AreaCode: 2 }, 2],
    [{ Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-0005" }, "PHL-ASH-0005"],
    [{ Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" }, "PHL-RSH-0001"],
  ];

  for (const [user, expectedScope] of scoped) {
    const { service, calls } = await withUserService(everyLookup);

    await service.getUsersForApproval(user, "PENDING");

    const lookup = calls.find((call) => call.name.startsWith("get"));
    assert.ok(lookup.args.includes(expectedScope), `${user.Role} ${expectedScope}`);
    assert.ok(lookup.args.includes("PENDING"), user.Role);
  }
});

test("TotalCount is stripped on every path, not only the paged one", async () => {
  // Only the Branch Head's list runs through a procedure with COUNT(*) OVER()
  // today, so only that one carried the artefact. The other six become
  // procedures under DBA item 20a and will carry it too - stripping uniformly
  // now means that change cannot leak a paging column into the response.
  for (const [user] of routes) {
    const { service } = await withUserService(everyLookup);

    const list = await service.getUsersForApproval(user, "PENDING");

    for (const row of list) {
      assert.equal("TotalCount" in row, false, user.Role);
    }
    assert.equal(list[0].UserCode, "USR-GRH-0614", user.Role);
  }
});

test("a role with no approval list is refused rather than answered", async () => {
  const { service } = await withUserService(everyLookup);

  const error = await captureThrown(() =>
    service.getUsersForApproval({ Role: "BRANCH_STAFF" }, "PENDING"),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /invalid role/i);
});
