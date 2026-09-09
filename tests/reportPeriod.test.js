import test from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod, periodLabel } from "../src/utils/reportPeriod.js";
import { captureThrown } from "./helpers/userService.js";

// Referrals.CreatedAt is UTC and the users are in Manila, UTC+8 with no daylight
// saving. A report period is a run of Manila days, so every boundary here is a
// Manila midnight expressed as the UTC instant it actually is.

const iso = (d) => d.toISOString();

// 2026-09-15 12:00 Manila, mid-September, so "this month" is unambiguous.
const midSeptember = new Date("2026-09-15T04:00:00.000Z");

test("thisMonth runs from Manila midnight to Manila midnight", async () => {
  // The assertion the whole file exists for. Manila 2026-09-01 00:00 is
  // 2026-08-31 16:00 UTC -- the previous calendar day in UTC terms.
  const period = resolvePeriod({}, midSeptember);

  assert.equal(iso(period.from), "2026-08-31T16:00:00.000Z");
  assert.equal(iso(period.toExclusive), "2026-09-30T16:00:00.000Z");
});

test("a referral made at 07:30 on the first falls inside that month", async () => {
  // This is the defect A31 is about, stated as a case. 07:30 Manila on 1
  // September stores as 2026-08-31T23:30Z. A period starting at UTC midnight on
  // the 1st would miss it and file it in August; starting at Manila midnight
  // catches it.
  const period = resolvePeriod({}, midSeptember);
  const referral = new Date("2026-08-31T23:30:00.000Z");

  assert.ok(referral >= period.from, "the first eight hours of the month were lost");
  assert.ok(referral < period.toExclusive);
});

test("the last instant of the month is inside and the next is not", async () => {
  const period = resolvePeriod({}, midSeptember);

  assert.ok(new Date("2026-09-30T15:59:59.999Z") < period.toExclusive);
  assert.ok(new Date("2026-09-30T16:00:00.000Z") >= period.toExclusive);
});

test("the presets count the current month as one of the N", async () => {
  // 3months is this month and the two before it, not the three completed months
  // before this one. thisMonth is the same rule with N = 1, which is why they
  // share an implementation.
  const three = resolvePeriod({ preset: "3months" }, midSeptember);
  const six = resolvePeriod({ preset: "6months" }, midSeptember);

  assert.equal(iso(three.from), "2026-06-30T16:00:00.000Z");
  assert.equal(iso(six.from), "2026-03-31T16:00:00.000Z");

  for (const period of [three, six])
    assert.equal(iso(period.toExclusive), "2026-09-30T16:00:00.000Z");
});

test("thisYear starts on 1 January, not twelve months ago", async () => {
  // This replaced `annual` on 2026-09-09, and the difference is the whole point.
  // `annual` counted back twelve months like the other presets, so in September
  // it ran from the previous October -- which is not what anybody means when
  // they ask what this year's referrals are. A rolling twelve months is what
  // `custom` is for.
  const year = resolvePeriod({ preset: "thisYear" }, midSeptember);

  assert.equal(iso(year.from), "2025-12-31T16:00:00.000Z");
  assert.equal(iso(year.toExclusive), "2026-09-30T16:00:00.000Z");
});

test("thisYear in January is one month long, not empty and not a year", async () => {
  // The edge that would be got wrong: on 3 January the year so far is January,
  // and the period has to be a real range rather than a zero-width one.
  const january = new Date("2026-01-03T04:00:00.000Z");
  const year = resolvePeriod({ preset: "thisYear" }, january);

  assert.equal(iso(year.from), "2025-12-31T16:00:00.000Z");
  assert.equal(iso(year.toExclusive), "2026-01-31T16:00:00.000Z");
  assert.ok(year.from < year.toExclusive);
});

test("annual is gone and is refused by name", async () => {
  // A stale caller must be told, not quietly given a different period. The
  // message lists what is allowed.
  const error = await captureThrown(() => resolvePeriod({ preset: "annual" }));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /thisYear/);
});

test("a preset spanning a year boundary rolls the year", async () => {
  const january = new Date("2026-01-15T04:00:00.000Z");
  const period = resolvePeriod({ preset: "3months" }, january);

  assert.equal(iso(period.from), "2025-10-31T16:00:00.000Z");
});

test("a custom range treats dateTo as a whole Manila day", async () => {
  // The client sends the last day it wants included; the exclusive bound is the
  // midnight after it. Sending the exclusive bound instead is the off-by-one
  // this shape avoids.
  const period = resolvePeriod({
    preset: "custom",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
  });

  assert.equal(iso(period.from), "2026-08-31T16:00:00.000Z");
  assert.equal(iso(period.toExclusive), "2026-09-30T16:00:00.000Z");
});

test("a single-day custom range is a real range, not empty", async () => {
  const period = resolvePeriod({
    preset: "custom",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-01",
  });

  assert.equal(period.toExclusive - period.from, 24 * 60 * 60 * 1000);
});

test("custom needs both dates", async () => {
  for (const query of [
    { preset: "custom" },
    { preset: "custom", dateFrom: "2026-09-01" },
    { preset: "custom", dateTo: "2026-09-30" },
  ]) {
    const error = await captureThrown(() => resolvePeriod(query));
    assert.equal(error?.statusCode, 400, JSON.stringify(query));
  }
});

test("a malformed or impossible date is a 400, not a silent Invalid Date", async () => {
  // new Date("2026-02-31") does not throw -- it rolls into March. A period that
  // rolls is worse than one that refuses, because the report still renders.
  for (const bad of ["2026-9-1", "01/09/2026", "yesterday", "2026-02-31", ""]) {
    const error = await captureThrown(() =>
      resolvePeriod({ preset: "custom", dateFrom: bad, dateTo: "2026-09-30" }),
    );
    assert.equal(error?.statusCode, 400, bad);
  }
});

test("a reversed custom range is refused", async () => {
  const error = await captureThrown(() =>
    resolvePeriod({ preset: "custom", dateFrom: "2026-09-30", dateTo: "2026-09-01" }),
  );

  assert.equal(error?.statusCode, 400);
});

test("an unknown preset is refused and the message lists the real ones", async () => {
  const error = await captureThrown(() => resolvePeriod({ preset: "lastQuarter" }));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /thisMonth/);
});

test("the filename label reads as Manila days, not UTC ones", async () => {
  // The label is what the client sees on the downloaded file. Reading the
  // exclusive bound directly would name 30 September as 1 October.
  const period = resolvePeriod({}, midSeptember);

  assert.equal(periodLabel(period), "2026-09-01-to-2026-09-30");
});
