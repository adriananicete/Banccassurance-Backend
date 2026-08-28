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

const oneProcedure = { getUsersForApproval: pendingUser };

const paging = { StatusFilter: "PENDING", PageNumber: 1, PageSize: 20 };

const callers = [
  { Role: BRANCH_HEAD, UserCode: "USR-BRH-0300", BranchCode: 255 },
  { Role: GROUP_HEAD, UserCode: "USR-GRH-0031", GroupCode: 2 },
  { Role: SECTOR_HEAD, UserCode: "USR-SEC-0029" },
  { Role: DEPARTMENT_HEAD, UserCode: "PHL-DH-0001" },
  { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-0001" },
  { Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-0005" },
  { Role: SUPERADMIN, UserCode: "SYS-ADM-0001" },
];

test("the route guard and the service agree on who may approve", () => {
  // Seven model functions became one procedure, so the service can no longer
  // route by a table whose keys were the second copy of this list. It now reads
  // approverRoles directly - the same array requireRole is given - and this
  // asserts the fixtures below still cover all of it.
  assert.deepEqual(
    callers.map((caller) => caller.Role).sort(),
    [...approverRoles].sort(),
  );
});

test("every approver role reaches the one procedure", async () => {
  for (const caller of callers) {
    const { service, calls } = await withUserService(oneProcedure);

    await service.getUsersForApproval(caller, paging);

    assert.deepEqual(
      calls.map((call) => call.name).filter((name) => name.startsWith("get")),
      ["getUsersForApproval"],
      caller.Role,
    );
  }
});

test("the caller reaches the procedure whole, not one field at a time", async () => {
  // The old table pulled one scope field per role and passed it alone, so the
  // wrong field for a role was a silent plausible list. The procedure now picks
  // the branch itself from @CallerRole, which means the caller must arrive
  // intact - dropping BranchCode for a Branch Head is what an empty list looks
  // like now.
  for (const caller of callers) {
    const { service, calls } = await withUserService(oneProcedure);

    await service.getUsersForApproval(caller, paging);

    const [passedUser, passedOptions] = calls.find((call) =>
      call.name === "getUsersForApproval",
    ).args;

    assert.equal(passedUser.Role, caller.Role, caller.Role);
    assert.equal(passedUser.UserCode, caller.UserCode, caller.Role);
    assert.equal(passedUser.BranchCode, caller.BranchCode, caller.Role);
    assert.equal(passedUser.GroupCode, caller.GroupCode, caller.Role);
    assert.equal(passedOptions.StatusFilter, "PENDING", caller.Role);
  }
});

test("TotalCount is stripped and the count survives in pagination", async () => {
  // COUNT(*) OVER() rides on every row. It is the total for the whole set, so
  // it has to be read before the strip and reported beside the rows rather than
  // on them - a page of 20 must not report a total of 20.
  for (const caller of callers) {
    const { service } = await withUserService(oneProcedure);

    const result = await service.getUsersForApproval(caller, paging);

    for (const row of result.data) {
      assert.equal("TotalCount" in row, false, caller.Role);
    }
    assert.equal(result.data[0].UserCode, "USR-GRH-0614", caller.Role);
    assert.equal(result.pagination.totalCount, 16, caller.Role);
    assert.equal(result.pagination.totalPages, 1, caller.Role);
  }
});

test("an empty page reports no total rather than throwing", async () => {
  // TotalCount rides on the rows, so a page past the end carries no count at
  // all. The referral and notification lists behave the same way; what matters
  // is that it reads 0 instead of dereferencing undefined.
  const { service } = await withUserService({ getUsersForApproval: rows() });

  const result = await service.getUsersForApproval(callers[0], {
    ...paging,
    PageNumber: 999,
  });

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
});

test("a role with no approval list is refused rather than answered", async () => {
  const { service } = await withUserService(oneProcedure);

  const error = await captureThrown(() =>
    service.getUsersForApproval({ Role: "BRANCH_STAFF" }, paging),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /invalid role/i);
});

test("a non-approver never reaches the procedure at all", async () => {
  // The guard has to run before the call, not after. A refused role that still
  // issued the query would hand the procedure a @CallerRole matching none of
  // its seven blocks - an empty list, which reads as "nobody is pending".
  const { service, calls } = await withUserService(oneProcedure);

  await captureThrown(() =>
    service.getUsersForApproval({ Role: "ACCOUNT_OFFICER" }, paging),
  );

  assert.equal(calls.filter((call) => call.name === "getUsersForApproval").length, 0);
});
