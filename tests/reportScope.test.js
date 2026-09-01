import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const REPORT_MODEL = "../../src/models/reportModel.js";
const REPORT_SERVICE = "../../src/services/reportService.js";

const HEAD = {
  UserCode: "USR-BRH-00001",
  Role: "BRANCH_HEAD",
  BranchCode: 3,
  GroupCode: 1,
};

const valuesOf = (inputs, name) =>
  inputs.filter((i) => i.name === name).map((i) => i.value);

const period = { DateFrom: new Date("2026-08-31T16:00:00Z"), DateTo: new Date("2026-09-30T16:00:00Z") };

// One capture per test, and both model functions driven inside it.
//
// captureSql re-imports the module under test, but the config/db.js that module
// imports resolves to the copy the FIRST capture mocked -- so a second capture
// in the same file records into the first one's arrays. Calling captureSql per
// assertion silently reads an empty array. CONTEXT.md carries the limit.
const drive = async (calls) => {
  const { model, queries, inputs } = await captureSql(REPORT_MODEL);
  for (const [fn, user, options] of calls) await model[fn](user, options).run();
  restoreSqlCapture();

  return { queries, inputs };
};

test("both procedures are executed, never built as text", async () => {
  const { queries } = await drive([
    ["getReferralCounts", HEAD, { GroupBy: "AREA", ...period }],
    ["getReferralsForExport", HEAD, period],
  ]);

  assert.deepEqual(queries, [
    "EXEC [banc].[usp_rpt_referral_counts_by_role]",
    "EXEC [banc].[usp_exp_referrals_by_role]",
  ]);
});

test("both bind the same four scope parameters, and they come from the session", async () => {
  // The security assertion of this branch. Role and UserCode decide which
  // referrals the procedure's own WHERE admits, so if either could arrive from
  // the query string a Branch Staff could read as a Sector Head.
  //
  // Asserting the pair rather than one value is what shows the summary and the
  // export scope identically -- a report that scopes differently from the list
  // is the drift class behind DBA items 5, 27b and 33.
  // The options object carries hostile values for all four. It stands in for a
  // query string that reached the model -- if any of them wins, the caller can
  // choose their own scope.
  const hostile = {
    Role: "SECTOR_HEAD",
    UserCode: "USR-SEC-00001",
    BranchCode: 99,
    GroupCode: 99,
    role: "SECTOR_HEAD",
    userCode: "USR-SEC-00001",
    branchCode: 99,
    groupCode: 99,
  };

  const { inputs } = await drive([
    ["getReferralCounts", HEAD, { GroupBy: "AREA", ...period, ...hostile }],
    ["getReferralsForExport", HEAD, { ...period, ...hostile }],
  ]);

  assert.deepEqual(valuesOf(inputs, "Role"), ["BRANCH_HEAD", "BRANCH_HEAD"]);
  assert.deepEqual(valuesOf(inputs, "UserCode"), ["USR-BRH-00001", "USR-BRH-00001"]);
  assert.deepEqual(valuesOf(inputs, "BranchCode"), [3, 3]);
  assert.deepEqual(valuesOf(inputs, "GroupCode"), [1, 1]);
});

test("the service never forwards a caller-supplied scope to the model", async () => {
  // The other half, one layer up. The model is only safe because the service
  // hands it req.user; this asserts the service does not copy the query string
  // into the options object on the way.
  const { service, calls } = await withReportService();

  await service.getSummary(
    { groupBy: "AREA", role: "SECTOR_HEAD", userCode: "USR-SEC-00001", branchCode: "99", groupCode: "99" },
    HEAD,
  );

  const [user, options] = calls.find((c) => c.name === "getReferralCounts").args;

  assert.equal(user, HEAD, "the session object itself must be what reaches the model");
  for (const key of ["Role", "UserCode", "BranchCode", "GroupCode", "role", "userCode"])
    assert.equal(options[key], undefined, key);
});

test("a missing scope column binds 0 rather than NULL", async () => {
  // An Account Officer has no BranchCode. The procedure compares
  // r.BranchCode = @BranchCode and NULL equals nothing -- but nor does 0, and 0
  // is what the referral list has always sent. Keeping the two the same is the
  // point.
  const ao = { UserCode: "PHL-AO-00001", Role: "ACCOUNT_OFFICER", BranchCode: null, GroupCode: 1 };
  const { inputs } = await drive([["getReferralCounts", ao, { GroupBy: "AO", ...period }]]);

  assert.deepEqual(valuesOf(inputs, "BranchCode"), [0]);
});

test("the dates are bound as Date objects and never null", async () => {
  // usp_rpt_referral_counts_by_role answers THROW 50002 on a null date, which
  // reaches the caller as a 500.
  const { inputs } = await drive([
    ["getReferralCounts", HEAD, { GroupBy: "AREA", ...period }],
    ["getReferralsForExport", HEAD, period],
  ]);

  for (const name of ["DateFrom", "DateTo"]) {
    const bound = valuesOf(inputs, name);
    assert.equal(bound.length, 2, name);
    assert.ok(bound.every((v) => v instanceof Date), name);
  }
});

test("a junk parent code reads as absent rather than reaching sql.Int", async () => {
  // asInt answers null for junk. NaN is not null, and sql.Int refuses it before
  // the query is sent -- that is exactly how ?groupCode=abc became a 500 on
  // /lookups/branches, an endpoint anyone could reach.
  const junk = ["abc", "", "NaN", "1; DROP TABLE banc.Referrals"];

  const { inputs } = await drive(
    junk.map((value) => [
      "getReferralCounts",
      HEAD,
      { GroupBy: "AREA", ParentGroupCode: value, ParentRegionCode: value, ...period },
    ]),
  );

  assert.deepEqual(valuesOf(inputs, "ParentGroupCode"), junk.map(() => null));
  assert.deepEqual(valuesOf(inputs, "ParentRegionCode"), junk.map(() => null));
});

test("a real parent code arrives as a number, not the query string's text", async () => {
  const { inputs } = await drive([
    ["getReferralCounts", HEAD, { GroupBy: "BRANCH", ParentGroupCode: "1", ...period }],
  ]);

  assert.deepEqual(valuesOf(inputs, "ParentGroupCode"), [1]);
});

test("ParentClusterCode is bound and is always null", async () => {
  // The procedure declares it and we never use it -- the cluster is not a level
  // in the drill-down. Binding it null says so; leaving it unbound would let a
  // future caller pass one without anyone deciding to.
  const { inputs } = await drive([["getReferralCounts", HEAD, { GroupBy: "AREA", ...period }]]);

  assert.deepEqual(valuesOf(inputs, "ParentClusterCode"), [null]);
});

const withReportService = () =>
  withStubbedModules(
    { [REPORT_MODEL]: { getReferralCounts: rows(), getReferralsForExport: rows() } },
    REPORT_SERVICE,
  );

test("groupBy is whitelisted before SQL, and CLUSTER is not on it", async () => {
  // CLUSTER is the one that matters. usp_rpt_referral_counts_by_role accepts it
  // -- DBA A7 landed one day before BusinessLogic.md dropped the level, and it
  // was left in place deliberately. We must not offer it: a cluster has no
  // head, three groups hold exactly one and one holds none.
  const { service, calls } = await withReportService();

  for (const groupBy of ["CLUSTER", "cluster", "", "USER", "1; DROP"]) {
    const error = await captureThrown(() => service.getSummary({ groupBy }, HEAD));

    assert.equal(error?.statusCode, 400, groupBy);
  }

  assert.equal(calls.length, 0, "a refused groupBy still reached the model");
});

test("the four real levels are accepted, in any case", async () => {
  const { service } = await withReportService();

  for (const groupBy of ["REGION", "AREA", "branch", "ao"]) {
    const result = await service.getSummary({ groupBy }, HEAD);

    assert.equal(result.groupBy, groupBy.toUpperCase());
  }
});

test("the service passes the resolved period, not the raw query", async () => {
  // The client sends a preset or two day strings; the model must receive
  // instants. Passing the strings through would put the Manila offset back
  // where it started.
  const { service, calls } = await withReportService();

  await service.getSummary(
    { groupBy: "AREA", preset: "custom", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
    HEAD,
  );

  const sent = calls.find((c) => c.name === "getReferralCounts").args[1];

  assert.equal(sent.DateFrom.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(sent.DateTo.toISOString(), "2026-09-30T16:00:00.000Z");
});

test("the export refuses a status outside the eight", async () => {
  const { service, calls } = await withReportService();

  const error = await captureThrown(() =>
    service.getExportRows({ status: "Closed" }, HEAD),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("verified maps to a bit, and anything else is no filter", async () => {
  const { service, calls } = await withReportService();

  await service.getExportRows({ verified: "verified" }, HEAD);
  await service.getExportRows({ verified: "not-verified" }, HEAD);
  await service.getExportRows({ verified: "maybe" }, HEAD);

  const sent = calls.filter((c) => c.name === "getReferralsForExport").map((c) => c.args[1].Verified);

  assert.deepEqual(sent, [1, 0, null]);
});
