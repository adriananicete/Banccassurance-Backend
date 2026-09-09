import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import reportRoutes from "../src/routes/reportRoutes.js";

// The dashboard is the landing view: one call, a fixed shape, no navigation.
// The drill-down is GET /reports/summary and is unchanged -- BusinessLogic.md
// section 10 chose one call per expansion deliberately, so putting the tree in
// one response would contradict a recorded decision rather than extend it.
//
// It takes no period and is all-time on purpose. usp_sel_referral_counts_by_role
// has no date parameters at all, so a dated dashboard would print a total
// covering everything beside a breakdown covering a month.

const REPORT_MODEL = "../../src/models/reportModel.js";
const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REPORT_SERVICE = "../../src/services/reportService.js";

const as = (Role, overrides = {}) => ({
  UserCode: "USR-XXX-00001",
  Role,
  BranchCode: 3,
  GroupCode: 1,
  ...overrides,
});

const STATUSES = [
  { Status: "Referred", Total: 12 },
  { Status: "Presented", Total: 5 },
  { Status: "Approved", Total: 3 },
];

const withDashboard = (breakdown = rows({ GroupCode: 1, GroupName: "CENTRAL NCR" })) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: { getReferralCountsByRole: rows(...STATUSES) },
      [REPORT_MODEL]: { getReferralCounts: breakdown },
    },
    REPORT_SERVICE,
  );

test("the total is the sum of the status counts", async () => {
  // Summing these is safe in a way summing the breakdown would not be: the
  // status rows partition the caller's referrals exactly once each, while a
  // branch breakdown drops every AO-created referral.
  const { service } = await withDashboard();

  const data = await service.getDashboard(as("GROUP_HEAD"));

  assert.equal(data.total, 20);
  assert.deepEqual(data.byStatus, STATUSES);
});

test("each role gets the level below it in its own tree", async () => {
  for (const [role, level] of [
    ["SECTOR_HEAD", "AREA"],
    ["GROUP_HEAD", "BRANCH"],
    ["DEPARTMENT_HEAD", "REGION"],
    ["REGIONAL_SALES_HEAD", "AREA"],
    ["AREA_SALES_HEAD", "AO"],
  ]) {
    const { service, calls } = await withDashboard();

    const data = await service.getDashboard(as(role));

    assert.equal(data.level, level, role);
    assert.equal(
      calls.find((c) => c.name === "getReferralCounts").args[1].GroupBy,
      level,
      role,
    );
  }
});

test("a role at the bottom of its tree gets no breakdown and no second query", async () => {
  // Branch Head and Branch Staff have nothing under them on the Landbank side.
  // The Account Officer is the one worth stating: their own referrals carry
  // BranchCode NULL, so a branch breakdown would drop exactly the rows they
  // care about most -- and Adrian asked specifically that an AO's own work be
  // included. byStatus counts it; a branch split would not.
  for (const role of ["BRANCH_HEAD", "BRANCH_STAFF", "ACCOUNT_OFFICER"]) {
    const { service, calls } = await withDashboard();

    const data = await service.getDashboard(as(role));

    assert.equal(data.level, null, role);
    assert.deepEqual(data.breakdown, [], role);
    assert.equal(
      calls.some((c) => c.name === "getReferralCounts"),
      false,
      `${role} must not query the summary procedure`,
    );
    assert.equal(data.total, 20, `${role} still gets a total`);
  }
});

test("the breakdown rows are passed through untouched", async () => {
  // We do not know the summary procedure's column list -- it has never been
  // read -- and this is why that does not block the dashboard. Nothing here
  // sums, renames or strips a breakdown row.
  const { service } = await withDashboard(
    rows(
      { GroupCode: 3, GroupName: "Pasig Capitol", Referred: 2, Approved: 1 },
      { GroupCode: 4, GroupName: "Cubao", Referred: 5 },
    ),
  );

  const data = await service.getDashboard(as("GROUP_HEAD"));

  assert.deepEqual(data.breakdown, [
    { GroupCode: 3, GroupName: "Pasig Capitol", Referred: 2, Approved: 1 },
    { GroupCode: 4, GroupName: "Cubao", Referred: 5 },
  ]);
});

test("the breakdown asks for everything, with no parent filter", async () => {
  // A dashboard is the caller's whole scope. A parent filter would narrow it to
  // one branch of their own tree, which is the drill-down's job.
  const { service, calls } = await withDashboard();

  await service.getDashboard(as("REGIONAL_SALES_HEAD"));

  const sent = calls.find((c) => c.name === "getReferralCounts").args[1];

  assert.equal(sent.ParentGroupCode, null);
  assert.equal(sent.ParentRegionCode, null);
  assert.equal(sent.DateFrom.getUTCFullYear(), 1999, "the dashboard was given a period");
});

test("the caller's scope reaches both queries unchanged", async () => {
  // The assertion that matters. Two reads is two chances to widen what somebody
  // can see, and the second one is new.
  const user = as("AREA_SALES_HEAD", { UserCode: "PHL-ASH-00001", GroupCode: 5 });
  const { service, calls } = await withDashboard();

  await service.getDashboard(user);

  for (const call of calls) assert.equal(call.args[0], user, call.name);
});

test("an empty scope is a zero, not a broken dashboard", async () => {
  const { service } = await withStubbedModules(
    {
      [REFERRAL_MODEL]: { getReferralCountsByRole: rows() },
      [REPORT_MODEL]: { getReferralCounts: rows() },
    },
    REPORT_SERVICE,
  );

  const data = await service.getDashboard(as("GROUP_HEAD"));

  assert.equal(data.total, 0);
  assert.deepEqual(data.byStatus, []);
  assert.deepEqual(data.breakdown, []);
});

test("the dashboard route carries requireAuth and no requireRole", async () => {
  // Every role gets totals by status -- BusinessLogic.md section 10, superseding
  // "Branch Staff get no report". The same rule the summary and export follow.
  const layer = reportRoutes.stack.find((l) => l.route?.path === "/dashboard");

  assert.ok(layer, "GET /reports/dashboard is not mounted");
  assert.equal(layer.route.stack.length, 2);
});
