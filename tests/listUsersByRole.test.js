import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, captureThrown } from "./helpers/userService.js";
import {
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
  for (const role of [undefined, "", "ACCOUNT_OFFICER", "DEPARTMENT_HEAD", "SUPERADMIN"]) {
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

  for (const name of ["listRegionalSalesHeads", "listAreaSalesHeads", "listGroupHeads", "listBranchHeads"]) {
    const { model, queries } = await captureSql(USER_MODEL);
    await model[name]().run();

    assert.match(queries[0], /IsActive >= 0/, name);
    assert.match(queries[0], /u\.Photo/, name);
    assert.match(queries[0], /LEFT JOIN/, name);
  }
});

test("GET / is a static path, for the two tenant heads and the superadmin", async () => {
  const source = await readFile(new URL("../src/routes/userRoutes.js", import.meta.url), "utf8");

  const route = source.match(/router\.get\('\/',[^\n]*/);
  assert.ok(route);
  assert.match(route[0], /requireRole\(DEPARTMENT_HEAD, SECTOR_HEAD, SUPERADMIN\)/);
  assert.match(route[0], /listUsersByRole/);
  assert.ok(source.indexOf(route[0]) < source.indexOf("'/:userId"));
});
