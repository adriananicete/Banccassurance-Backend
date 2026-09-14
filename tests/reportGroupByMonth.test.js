import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";
import { splitIntoMonths, manilaMonthStart } from "../src/utils/reportPeriod.js";

const REPORT_MODEL = "../../src/models/reportModel.js";
const REPORT_SERVICE = "../../src/services/reportService.js";

const HEAD = { UserCode: "PHL-DH-00001", Role: "DEPARTMENT_HEAD", BranchCode: null, GroupCode: null };

const counts = (overrides) => ({
  GroupCode: 1,
  GroupName: "CENTRAL NCR",
  Referred: 0,
  Presented: 0,
  ClosedPending: 0,
  Approved: 0,
  Declined: 0,
  Deferred: 0,
  Lost: 0,
  Postponed: 0,
  ...overrides,
});

const iso = (d) => d.toISOString();

// 2026-09-14 12:00 Manila.
const midSeptember = new Date("2026-09-14T04:00:00.000Z");

const withMonthly = (model) =>
  withStubbedModules(
    {
      [REPORT_MODEL]: {
        getReferralCounts: rows(),
        getReferralsForExport: rows(),
        getFirstReferralDate: rows({ FirstCreatedAt: new Date("2026-07-10T02:00:00.000Z") }),
        ...model,
      },
    },
    REPORT_SERVICE,
  );

test("a period splits into Manila months, and the slices meet with no gap", () => {
  // Manila 1 July 00:00 is 30 June 16:00 UTC. Each slice's end is the next one's
  // start, so a referral on a boundary lands in exactly one month.
  const months = splitIntoMonths({
    from: new Date("2026-06-30T16:00:00.000Z"),
    toExclusive: new Date("2026-09-30T16:00:00.000Z"),
  });

  assert.deepEqual(months.map((m) => m.month), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(iso(months[1].from), "2026-07-31T16:00:00.000Z");
  for (let i = 1; i < months.length; i += 1)
    assert.equal(iso(months[i].from), iso(months[i - 1].toExclusive));
});

test("a custom range that starts and ends mid-month keeps its own edges", () => {
  const months = splitIntoMonths({
    from: new Date("2026-08-14T16:00:00.000Z"),
    toExclusive: new Date("2026-09-10T16:00:00.000Z"),
  });

  assert.deepEqual(months.map((m) => m.month), ["2026-08", "2026-09"]);
  assert.equal(iso(months[0].from), "2026-08-14T16:00:00.000Z");
  assert.equal(iso(months[1].toExclusive), "2026-09-10T16:00:00.000Z");
});

test("the year rolls over", () => {
  const months = splitIntoMonths({
    from: new Date("2025-11-30T16:00:00.000Z"),
    toExclusive: new Date("2026-01-31T16:00:00.000Z"),
  });

  assert.deepEqual(months.map((m) => m.month), ["2025-12", "2026-01"]);
});

test("a referral at 07:30 Manila on the first starts that month, not the one before", () => {
  // 2026-09-01 07:30 Manila is 2026-08-31 23:30 UTC.
  assert.equal(iso(manilaMonthStart(new Date("2026-08-31T23:30:00.000Z"))), "2026-08-31T16:00:00.000Z");
});

test("each month is one call, summed across every row the procedure returns", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: midSeptember });

  const { service, calls } = await withMonthly({
    getReferralCounts: () => ({
      run: async () => ({
        recordset: [
          counts({ Referred: 2, Approved: 1 }),
          counts({ GroupCode: 2, Referred: 3, Approved: 2 }),
          counts({ GroupCode: null, GroupName: null, Referred: 1 }),
        ],
      }),
    }),
  });

  const result = await service.getSummary({ groupBy: "month", preset: "3months" }, HEAD);

  assert.equal(result.groupBy, "MONTH");
  assert.deepEqual(result.rows.map((r) => r.GroupCode), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(result.rows[0].Referred, 6);
  assert.equal(result.rows[0].Approved, 3);
  assert.equal(result.rows[0].Lost, 0);

  const countCalls = calls.filter((c) => c.name === "getReferralCounts");
  assert.equal(countCalls.length, 3);
  assert.equal(countCalls.every((c) => c.args[0] === HEAD), true);
  assert.equal(countCalls.every((c) => c.args[1].GroupBy === "AREA"), true);
  assert.equal(calls.some((c) => c.name === "getFirstReferralDate"), false);
});

test("a region narrows through AREA and a group through AO", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: midSeptember });

  const { service, calls } = await withMonthly();

  await service.getSummary({ groupBy: "MONTH", preset: "thisMonth", parentRegionCode: "2" }, HEAD);
  await service.getSummary({ groupBy: "MONTH", preset: "thisMonth", parentGroupCode: "7" }, HEAD);

  const [byRegion, byGroup] = calls.filter((c) => c.name === "getReferralCounts").map((c) => c.args[1]);
  assert.equal(byRegion.GroupBy, "AREA");
  assert.equal(byRegion.ParentRegionCode, 2);
  assert.equal(byGroup.GroupBy, "AO");
  assert.equal(byGroup.ParentGroupCode, 7);
});

test("both parents at once is a 400 before any query", async () => {
  const { service, calls } = await withMonthly();

  const error = await captureThrown(() =>
    service.getSummary({ groupBy: "MONTH", parentRegionCode: 1, parentGroupCode: 1 }, HEAD),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("allTime starts at the first referral's month, not at the 2000 floor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: midSeptember });

  const { service, calls } = await withMonthly();

  const result = await service.getSummary({ groupBy: "MONTH" }, HEAD);

  assert.deepEqual(result.rows.map((r) => r.GroupCode), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(result.period.preset, "allTime");
  assert.equal(result.period.from, "2026-06-30T16:00:00.000Z");
  assert.equal(calls.filter((c) => c.name === "getReferralCounts").length, 3);
});

test("allTime with no referrals at all is empty rather than 36 zero months", async () => {
  const { service, calls } = await withMonthly({ getFirstReferralDate: rows({ FirstCreatedAt: null }) });

  const result = await service.getSummary({ groupBy: "MONTH" }, HEAD);

  assert.deepEqual(result.rows, []);
  assert.equal(calls.some((c) => c.name === "getReferralCounts"), false);
});

test("more than 36 months is a 400 before any count is run", async () => {
  const { service, calls } = await withMonthly();

  const error = await captureThrown(() =>
    service.getSummary({ groupBy: "MONTH", preset: "custom", dateFrom: "2020-01-01", dateTo: "2026-09-14" }, HEAD),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.some((c) => c.name === "getReferralCounts"), false);
});

test("exactly 36 months is allowed", async () => {
  const { service } = await withMonthly();

  const result = await service.getSummary(
    { groupBy: "MONTH", preset: "custom", dateFrom: "2023-10-01", dateTo: "2026-09-30" },
    HEAD,
  );

  assert.equal(result.rows.length, 36);
});
