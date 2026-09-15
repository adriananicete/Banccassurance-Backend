import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const USER_MODEL = "../../src/models/userModel.js";

const DH = { UserCode: "PHL-DH-00001", Role: DEPARTMENT_HEAD };
const SH = { UserCode: "USR-SEC-00001", Role: SECTOR_HEAD };
const RSH = { UserCode: "PHL-RSH-00001", Role: REGIONAL_SALES_HEAD };
const ASH = { UserCode: "PHL-ASH-00001", Role: AREA_SALES_HEAD };
const ADMIN = { UserCode: "SYS-ADM-0001", Role: SUPERADMIN };

const headRow = (overrides) => ({
  UserId: 40,
  UserCode: "PHL-RSH-00001",
  FullName: "Juan Cruz",
  Photo: "avatar-40.jpg",
  IsActive: 1,
  GroupCode: 1,
  GroupName: "NORTH NCR",
  RegionCode: 1,
  RegionName: "NCR",
  ...overrides,
});

const noGroup = { GroupCode: null, GroupName: null, RegionCode: null, RegionName: null };

test("a Regional Sales Head holding a region is one row, not one per group", async () => {
  // The query joins through the junction, so a head with three groups comes
  // back as three rows. The screen wants one label per head.
  const { service } = await withUserService({
    listRegionalSalesHeads: rows(
      headRow(),
      headRow({ GroupCode: 2, GroupName: "CENTRAL NCR" }),
      headRow({ GroupCode: 3, GroupName: "SOUTH NCR" }),
    ),
  });

  const result = await service.listUsersByRole(DH,REGIONAL_SALES_HEAD);

  assert.equal(result.role, REGIONAL_SALES_HEAD);
  assert.deepEqual(result.data, [
    {
      userId: 40,
      userCode: "PHL-RSH-00001",
      fullName: "Juan Cruz",
      photo: "avatar-40.jpg",
      approved: true,
      scope: { regionCode: 1, regionName: "NCR" },
    },
  ]);
});

test("a Regional Sales Head holding nothing has a null scope, not an empty region", async () => {
  // This is the case the dashboard exists to show honestly. An object with null
  // codes would read as "holds a region whose name is missing".
  const { service } = await withUserService({
    listRegionalSalesHeads: rows(headRow({ UserId: 41, UserCode: "PHL-RSH-00002", Photo: null, ...noGroup })),
  });

  const [head] = (await service.listUsersByRole(DH,REGIONAL_SALES_HEAD)).data;

  assert.equal(head.scope, null);
  assert.equal(head.photo, null);
});

test("groups straddling two regions name no region rather than guessing one", async () => {
  // Same rule as GET /:userId/region. Unreachable through the PUT, but older
  // rows can hold it.
  const { service } = await withUserService({
    listRegionalSalesHeads: rows(headRow(), headRow({ GroupCode: 4, RegionCode: 2, RegionName: "Luzon" })),
  });

  const [head] = (await service.listUsersByRole(DH,REGIONAL_SALES_HEAD)).data;

  assert.deepEqual(head.scope, { regionCode: null, regionName: null });
});

test("an Area Sales Head's scope is every group they hold, and empty when none", async () => {
  const { service } = await withUserService({
    listAreaSalesHeads: rows(
      headRow({ UserId: 50, UserCode: "PHL-ASH-00001", GroupCode: 7, GroupName: "BICOL", RegionCode: 2, RegionName: "Luzon" }),
      headRow({ UserId: 50, UserCode: "PHL-ASH-00001", GroupCode: 8, GroupName: "CENTRAL LUZON", RegionCode: 2, RegionName: "Luzon" }),
      headRow({ UserId: 51, UserCode: "PHL-ASH-00002", ...noGroup }),
    ),
  });

  const result = await service.listUsersByRole(DH,AREA_SALES_HEAD);

  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data[0].scope, [
    { groupCode: 7, groupName: "BICOL", regionCode: 2, regionName: "Luzon" },
    { groupCode: 8, groupName: "CENTRAL LUZON", regionCode: 2, regionName: "Luzon" },
  ]);
  assert.deepEqual(result.data[1].scope, []);
});

test("a pending head is listed and says so", async () => {
  const { service } = await withUserService({
    listAreaSalesHeads: rows(headRow({ UserCode: "PHL-ASH-00003", IsActive: 0, ...noGroup })),
  });

  const [head] = (await service.listUsersByRole(DH,AREA_SALES_HEAD)).data;

  assert.equal(head.approved, false);
});

test("the role is read case-insensitively and anything else is a 400 before any query", async () => {
  const { service, calls } = await withUserService({
    listRegionalSalesHeads: rows(),
    listAreaSalesHeads: rows(),
  });

  const lower = await service.listUsersByRole(DH," regional_sales_head ");
  assert.equal(lower.role, REGIONAL_SALES_HEAD);

  calls.length = 0;
  for (const role of [undefined, "", "BRANCH_STAFF", "DEPARTMENT_HEAD", "SUPERADMIN"]) {
    const error = await captureThrown(() => service.listUsersByRole(DH,role));
    assert.equal(error?.statusCode, 400, String(role));
  }
  assert.equal(calls.length, 0);
});

test("a Group Head's scope is the one group on their row, with its region", async () => {
  const { service } = await withUserService({
    listGroupHeads: rows(
      headRow({ UserId: 13, UserCode: "USR-GRH-00001", GroupName: "CENTRAL NCR" }),
      headRow({ UserId: 30, UserCode: "USR-GRH-00002", ...noGroup }),
    ),
  });

  const result = await service.listUsersByRole(SH, "group_head");

  assert.equal(result.role, GROUP_HEAD);
  assert.deepEqual(result.data[0].scope, {
    groupCode: 1, groupName: "CENTRAL NCR", regionCode: 1, regionName: "NCR",
  });
  assert.equal(result.data[1].scope, null);
});

test("a Branch Head's scope is the one branch, with the group and region above it", async () => {
  const { service } = await withUserService({
    listBranchHeads: rows(
      headRow({ UserId: 14, UserCode: "USR-BRH-00001", BranchCode: 3, BranchName: "Pasig Capitol", GroupName: "CENTRAL NCR" }),
      headRow({ UserId: 31, UserCode: "USR-BRH-00003", BranchCode: null, BranchName: null, ...noGroup }),
    ),
  });

  const result = await service.listUsersByRole(SH, BRANCH_HEAD);

  assert.deepEqual(result.data[0].scope, {
    branchCode: 3, branchName: "Pasig Capitol", groupCode: 1, groupName: "CENTRAL NCR", regionCode: 1, regionName: "NCR",
  });
  assert.equal(result.data[1].scope, null);
});

test("each head lists only its own tenant's heads, and the superadmin lists all four", async () => {
  // A Department Head has no business with Landbank's directory, nor a Sector
  // Head with PhilLife's. Refused before the query, so nothing is read.
  const model = {
    listRegionalSalesHeads: rows(),
    listAreaSalesHeads: rows(),
    listGroupHeads: rows(),
    listBranchHeads: rows(),
  };
  const { service, calls } = await withUserService(model);

  for (const [caller, role] of [[DH, GROUP_HEAD], [DH, BRANCH_HEAD], [SH, REGIONAL_SALES_HEAD], [SH, AREA_SALES_HEAD]]) {
    const error = await captureThrown(() => service.listUsersByRole(caller, role));
    assert.equal(error?.statusCode, 403, `${caller.Role} -> ${role}`);
  }
  assert.equal(calls.length, 0);

  for (const role of [REGIONAL_SALES_HEAD, AREA_SALES_HEAD, GROUP_HEAD, BRANCH_HEAD]) {
    const result = await service.listUsersByRole(ADMIN, role);
    assert.equal(result.role, role);
  }
});

test("every list query leaves out deactivated and rejected accounts", async (t) => {
  // IsActive -1 is both. Neither should label a place.
  t.after(restoreSqlCapture);

  for (const name of ["listRegionalSalesHeads", "listAreaSalesHeads", "listAccountOfficers", "listGroupHeads", "listBranchHeads"]) {
    const { model, queries } = await captureSql(USER_MODEL);
    await model[name]().run();

    assert.match(queries[0], /IsActive >= 0/, name);
    assert.match(queries[0], /u\.Photo/, name);
    assert.match(queries[0], /LEFT JOIN/, name);
  }
});

const officerRow = (overrides) => ({
  UserId: 60,
  UserCode: "PHL-AO-00001",
  FullName: "Mega Man",
  Photo: null,
  IsActive: 1,
  GroupCode: 1,
  GroupName: "CENTRAL NCR",
  RegionCode: 1,
  RegionName: "NCR",
  BranchCode: 3,
  BranchName: "Pasig Capitol",
  ClusterCode: 2,
  ClusterName: "Cluster B",
  ...overrides,
});

const noBranch = { BranchCode: null, BranchName: null, ClusterCode: null, ClusterName: null };

test("an Account Officer is one row with their group and every branch they hold", async () => {
  // R10. The query joins through account_officer_branches, so an officer with
  // two branches comes back as two rows. The group is their own, from
  // registration, so it is there even when they hold no branch at all.
  const { service } = await withUserService({
    listAccountOfficers: rows(
      officerRow(),
      officerRow({ BranchCode: 5, BranchName: "U.N. AVENUE", ClusterCode: null, ClusterName: null }),
      officerRow({ UserId: 61, UserCode: "PHL-AO-00002", IsActive: 0, ...noBranch }),
    ),
  });

  const result = await service.listUsersByRole(ASH, "account_officer");

  assert.equal(result.role, ACCOUNT_OFFICER);
  assert.deepEqual(result.data[0].scope, {
    groupCode: 1, groupName: "CENTRAL NCR", regionCode: 1, regionName: "NCR",
    branches: [
      { branchCode: 3, branchName: "Pasig Capitol", clusterCode: 2, clusterName: "Cluster B" },
      { branchCode: 5, branchName: "U.N. AVENUE", clusterCode: null, clusterName: null },
    ],
  });
  assert.equal(result.data[1].approved, false);
  assert.deepEqual(result.data[1].scope, {
    groupCode: 1, groupName: "CENTRAL NCR", regionCode: 1, regionName: "NCR", branches: [],
  });
});

test("the two sales heads list only their own people, and the tenant-wide callers list everyone", async () => {
  // An Area Sales Head's officers and a Regional Sales Head's area heads are
  // narrowed in the query by the caller's own code. The Department Head and
  // the superadmin pass null, which the query reads as the whole tenant.
  const model = { listAccountOfficers: rows(), listAreaSalesHeads: rows() };

  for (const [caller, role, query, expected] of [
    [ASH, ACCOUNT_OFFICER, "listAccountOfficers", "PHL-ASH-00001"],
    [ADMIN, ACCOUNT_OFFICER, "listAccountOfficers", null],
    [RSH, AREA_SALES_HEAD, "listAreaSalesHeads", "PHL-RSH-00001"],
    [DH, AREA_SALES_HEAD, "listAreaSalesHeads", null],
    [ADMIN, AREA_SALES_HEAD, "listAreaSalesHeads", null],
  ]) {
    const { service, calls } = await withUserService(model);

    await service.listUsersByRole(caller, role);

    const call = calls.find((entry) => entry.name === query);
    assert.ok(call, `${caller.Role} -> ${role}`);
    assert.equal(call.args[0], expected, `${caller.Role} -> ${role}`);
  }
});

test("a sales head asking for anyone but the level below them is refused before any query", async () => {
  const model = {
    listRegionalSalesHeads: rows(),
    listAreaSalesHeads: rows(),
    listAccountOfficers: rows(),
    listGroupHeads: rows(),
    listBranchHeads: rows(),
  };
  const { service, calls } = await withUserService(model);

  for (const [caller, role] of [
    [ASH, AREA_SALES_HEAD],
    [ASH, REGIONAL_SALES_HEAD],
    [RSH, ACCOUNT_OFFICER],
    [RSH, REGIONAL_SALES_HEAD],
    [DH, ACCOUNT_OFFICER],
    [SH, ACCOUNT_OFFICER],
    [ASH, GROUP_HEAD],
    [RSH, BRANCH_HEAD],
  ]) {
    const error = await captureThrown(() => service.listUsersByRole(caller, role));
    assert.equal(error?.statusCode, 403, `${caller.Role} -> ${role}`);
  }
  assert.equal(calls.length, 0);
});

test("a scoped caller with no UserCode is refused rather than read as the whole tenant", async () => {
  // null is what the query reads as "no narrowing". A session missing its code
  // must not become that.
  const { service, calls } = await withUserService({ listAccountOfficers: rows(), listAreaSalesHeads: rows() });

  for (const [caller, role] of [
    [{ Role: AREA_SALES_HEAD }, ACCOUNT_OFFICER],
    [{ Role: REGIONAL_SALES_HEAD, UserCode: "  " }, AREA_SALES_HEAD],
  ]) {
    const error = await captureThrown(() => service.listUsersByRole(caller, role));
    assert.equal(error?.statusCode, 403, caller.Role);
  }
  assert.equal(calls.length, 0);
});

test("the officers are narrowed by their registration group, not by the branches they hold", async (t) => {
  // F11. An approved officer with no branches yet is exactly who an Area Sales
  // Head opens the page to find. Scoping through account_officer_branches would
  // hide them. Same rule as isAreaInAreaSalesHeadScope on /:userId/branches.
  t.after(restoreSqlCapture);

  const { model, queries, inputs } = await captureSql(USER_MODEL);
  await model.listAccountOfficers("PHL-ASH-00001").run();

  assert.match(queries[0], /area_sales_head_areas a\s+WHERE a\.UserCode = @UserCode AND a\.GroupCode = u\.GroupCode/);
  assert.match(queries[0], /LEFT JOIN \(banc\.account_officer_branches/);
  assert.match(queries[0], /@UserCode IS NULL OR EXISTS/);
  assert.deepEqual(inputs.find((input) => input.name === "UserCode"), { name: "UserCode", value: "PHL-ASH-00001" });
});

test("the area heads are narrowed by their registration region, not by the groups they hold", async (t) => {
  // An Area Sales Head registers with a region and no group. Scoping through
  // area_sales_head_areas would hide the ones still waiting for groups. Same
  // rule as isAshInRegionalScope on /:userId/groups.
  t.after(restoreSqlCapture);

  const { model, queries, inputs } = await captureSql(USER_MODEL);
  await model.listAreaSalesHeads("PHL-RSH-00001").run();

  assert.match(queries[0], /regional_sales_head_areas rsa\s+WHERE rsa\.UserCode = @UserCode AND rsa\.RegionCode = u\.RegionCode/);
  assert.match(queries[0], /@UserCode IS NULL OR EXISTS/);
  assert.deepEqual(inputs.find((input) => input.name === "UserCode"), { name: "UserCode", value: "PHL-RSH-00001" });

  const unscoped = await captureSql(USER_MODEL);
  await unscoped.model.listAreaSalesHeads().run();
  assert.equal(unscoped.inputs.find((input) => input.name === "UserCode").value, null);
});

test("GET / is a static path, for the tenant heads, the two sales heads and the superadmin", async () => {
  const source = await readFile(new URL("../src/routes/userRoutes.js", import.meta.url), "utf8");

  const route = source.match(/router\.get\('\/',[^\n]*/);
  assert.ok(route);
  assert.match(route[0], /requireRole\(DEPARTMENT_HEAD, SECTOR_HEAD, REGIONAL_SALES_HEAD, AREA_SALES_HEAD, SUPERADMIN\)/);
  assert.match(route[0], /listUsersByRole/);
  assert.ok(source.indexOf(route[0]) < source.indexOf("'/:userId"));
});
