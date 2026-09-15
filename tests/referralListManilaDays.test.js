import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, restoreStubs } from "./helpers/stubModel.js";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { manilaDayBounds } from "../src/utils/reportPeriod.js";

const REFERRAL_SERVICE = "../../src/services/referralService.js";
const REFERRAL_CONTROLLER = "../../src/controllers/referralController.js";
const REFERRAL_MODEL = "../../src/models/referralModel.js";

// A38. usp_sel_referrals_by_role_1 takes DATETIME2 with an exclusive upper
// bound, the same as the export. The list used to send the days as they came
// in, which the procedure now reads as UTC midnight, exclusive -- so a one-day
// range answered nothing and every range lost its last day.

const listWith = async (query) => {
  const { service: controller, calls } = await withStubbedModules(
    {
      [REFERRAL_SERVICE]: {
        getReferralsByRole: async () => ({ data: [], pagination: {} }),
      },
    },
    REFERRAL_CONTROLLER,
  );

  let thrown = null;
  await controller.getReferrals(
    { query, user: { Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-00001" } },
    { json: () => {} },
    (error) => {
      thrown = error;
    },
  );
  restoreStubs();

  assert.equal(thrown, null);
  return calls.find((call) => call.name === "getReferralsByRole").args[1];
};

test("a date range is a run of Manila days, the last one included", async () => {
  const options = await listWith({ dateFrom: "2026-09-01", dateTo: "2026-09-30" });

  assert.equal(options.DateFrom.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(options.DateTo.toISOString(), "2026-09-30T16:00:00.000Z");
});

test("a one-day range is that whole Manila day, not empty", async () => {
  // The Postman case that caught it: 2026-09-14 to 2026-09-14 answered one
  // referral before A38 and none after.
  const options = await listWith({ dateFrom: "2026-09-14", dateTo: "2026-09-14" });

  assert.equal(options.DateFrom.toISOString(), "2026-09-13T16:00:00.000Z");
  assert.equal(options.DateTo.toISOString(), "2026-09-14T16:00:00.000Z");
});

test("the list's bounds are exactly the export's for the same days", async () => {
  // The Reports page's Preview and its Excel file must hold the same referrals.
  const { resolvePeriod } = await import("../src/utils/reportPeriod.js");
  const exported = resolvePeriod({ preset: "custom", dateFrom: "2026-07-01", dateTo: "2026-09-15" });
  const options = await listWith({ dateFrom: "2026-07-01", dateTo: "2026-09-15" });

  assert.equal(options.DateFrom.getTime(), exported.from.getTime());
  assert.equal(options.DateTo.getTime(), exported.toExclusive.getTime());
});

test("either bound may be given alone, and a missing or malformed one is no filter", async () => {
  // The list has always ignored a date it cannot read rather than refusing the
  // request; that stays. What changed is that only YYYY-MM-DD is read.
  const onlyFrom = await listWith({ dateFrom: "2026-09-01" });
  assert.equal(onlyFrom.DateFrom.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(onlyFrom.DateTo, null);

  const onlyTo = await listWith({ dateTo: "2026-09-30" });
  assert.equal(onlyTo.DateFrom, null);
  assert.equal(onlyTo.DateTo.toISOString(), "2026-09-30T16:00:00.000Z");

  for (const bad of ["2026-9-1", "yesterday", "2026-02-31", "", undefined]) {
    const options = await listWith({ dateFrom: bad, dateTo: bad });
    assert.equal(options.DateFrom, null, String(bad));
    assert.equal(options.DateTo, null, String(bad));
  }
});

test("manilaDayBounds rolls a month and a year end", () => {
  assert.equal(manilaDayBounds(null, "2026-09-30").toExclusive.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(manilaDayBounds(null, "2026-12-31").toExclusive.toISOString(), "2026-12-31T16:00:00.000Z");
  assert.equal(manilaDayBounds("2027-01-01", null).from.toISOString(), "2026-12-31T16:00:00.000Z");
});

test("the model sends the bounds as instants, not as dates", async (t) => {
  // sql.Date would truncate 2026-08-31T16:00Z back to 2026-08-31 and put the
  // eight hours straight back.
  t.after(restoreSqlCapture);
  const source = (await import("node:fs")).readFileSync(
    new URL("../src/models/referralModel.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /request\.input\('DateFrom', sql\.DateTime2, options\.DateFrom\)/);
  assert.match(source, /request\.input\('DateTo', sql\.DateTime2, options\.DateTo\)/);
  assert.doesNotMatch(source, /'Date(From|To)', sql\.Date,/);

  const from = new Date("2026-08-31T16:00:00.000Z");
  const { model, inputs } = await captureSql(REFERRAL_MODEL);
  await model
    .getReferralsByRole({ Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-00001" }, { DateFrom: from, DateTo: null })
    .run();

  assert.equal(inputs.find((input) => input.name === "DateFrom").value, from);
});
