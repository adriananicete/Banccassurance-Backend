import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import {
  exportColumns,
  writeReferralWorkbook,
} from "../src/services/reportService.js";
import { asManilaWallTime } from "../src/utils/reportPeriod.js";
import reportRoutes from "../src/routes/reportRoutes.js";

const collect = async (rows) => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));

  await writeReferralWorkbook(rows, stream);

  return Buffer.concat(chunks);
};

const reopen = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet("Referrals");
};

const referral = (overrides) => ({
  ReferralNo: "REF-20260901-DE1406",
  FirstName: "Rosalinda",
  LastName: "Bacani",
  Email: "rosalinda@example.com",
  BranchCode: 3,
  BranchName: "Pasig Capitol",
  GroupCode: 1,
  GroupName: "CENTRAL NCR",
  AOCode: "PHL-AO-00001",
  AOName: "Mega Man",
  ReferrerCode: "USR-STF-00001",
  ReferrerName: "Maricel Bautista Aquino",
  Relationship: "REFERRED_BY_ME",
  Status: "Referred",
  StatusDate: new Date("2026-09-01T00:00:00.000Z"),
  ConsentStatus: "CONFIRMED",
  ConsentConfirmedAt: new Date("2026-08-31T23:50:48.000Z"),
  CreatedAt: new Date("2026-08-31T23:52:55.000Z"),
  ...overrides,
});

test("the workbook is a real xlsx that reopens", async () => {
  // Streaming writers fail by producing a truncated archive rather than by
  // throwing. Reading it back is the only assertion that catches that.
  const sheet = await reopen(await collect([referral()]));

  assert.ok(sheet, "no Referrals worksheet");
  assert.equal(sheet.rowCount, 2);
});

test("the header row names every column the export procedure selects", async () => {
  const sheet = await reopen(await collect([]));

  assert.deepEqual(
    sheet.getRow(1).values.slice(1),
    exportColumns.map((c) => c.header),
  );
});

test("Relationship survives to the file", async () => {
  // DBA item A8 added it and nothing has ever read it -- the export had no
  // caller until now. It is what tells an Account Officer which referrals they
  // made from the ones assigned to them, the split §10 requires.
  const sheet = await reopen(await collect([referral()]));
  const column = exportColumns.findIndex((c) => c.key === "Relationship") + 1;

  assert.equal(sheet.getRow(2).getCell(column).value, "REFERRED_BY_ME");
});

test("timestamps read as Manila wall time, not UTC", async () => {
  // The period is Manila days, so the cells have to agree with it. A referral
  // created 07:52 on 1 September Manila stores as 2026-08-31T23:52Z; printing
  // the instant would date it 31 August in a September report and read as an
  // off-by-one to whoever opened the file.
  const sheet = await reopen(await collect([referral()]));
  const column = exportColumns.findIndex((c) => c.key === "CreatedAt") + 1;
  const cell = sheet.getRow(2).getCell(column).value;

  assert.equal(cell.toISOString(), "2026-09-01T07:52:55.000Z");
});

test("a null timestamp stays null rather than becoming an epoch date", async () => {
  // ConsentConfirmedAt is null on a referral consented by upload. Shifting null
  // by eight hours would render 1 January 1970 in the cell.
  const sheet = await reopen(
    await collect([referral({ ConsentConfirmedAt: null })]),
  );
  const column = exportColumns.findIndex((c) => c.key === "ConsentConfirmedAt") + 1;

  assert.equal(sheet.getRow(2).getCell(column).value, null);
});

test("an Account Officer's own referral keeps its empty branch", async () => {
  // BranchCode is NULL on every AO-created referral. The file must show the gap
  // rather than a zero, because a zero reads as a branch code.
  const sheet = await reopen(
    await collect([referral({ BranchCode: null, BranchName: null })]),
  );
  const column = exportColumns.findIndex((c) => c.key === "BranchCode") + 1;

  assert.equal(sheet.getRow(2).getCell(column).value, null);
});

test("an empty period still produces a file with headers", async () => {
  // A report of nothing is a legitimate answer and must not be a broken
  // download.
  const sheet = await reopen(await collect([]));

  assert.equal(sheet.rowCount, 1);
});

test("asManilaWallTime leaves non-dates alone", async () => {
  for (const value of [null, undefined, "", "CONFIRMED", 0])
    assert.equal(asManilaWallTime(value), value);
});

test("the export route carries requireAuth and no requireRole", async () => {
  const layer = reportRoutes.stack.find((l) => l.route?.path === "/export");

  assert.ok(layer, "GET /reports/export is not mounted");
  assert.equal(layer.route.stack.length, 2);
});
