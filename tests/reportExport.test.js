import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import {
  exportColumns,
  writeReferralWorkbook,
  buildSubtitle,
  TITLE_ROWS,
} from "../src/services/reportService.js";
import { asManilaWallTime } from "../src/utils/reportPeriod.js";
import reportRoutes from "../src/routes/reportRoutes.js";

// The sheet opens with a title block, so the header is not row 1 and the first
// referral is not row 2. Everything below counts from these rather than from
// literals -- the block gained a row once already.
const HEADER = TITLE_ROWS + 1;
const DATA = HEADER + 1;

const META = {
  role: "BRANCH_STAFF",
  generatedAt: new Date("2026-09-09T02:57:00.000Z"),
  period: {
    from: new Date("2026-08-31T16:00:00.000Z"),
    toExclusive: new Date("2026-09-30T16:00:00.000Z"),
  },
};

const collect = async (rows, meta = META) => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));

  await writeReferralWorkbook(rows, stream, meta);

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
  assert.equal(sheet.rowCount, DATA);
});

test("the header row names every column the export procedure selects", async () => {
  const sheet = await reopen(await collect([]));

  assert.deepEqual(
    sheet.getRow(HEADER).values.slice(1),
    exportColumns.map((c) => c.header),
  );
});

test("Relationship survives to the file", async () => {
  // DBA item A8 added it and nothing has ever read it -- the export had no
  // caller until now. It is what tells an Account Officer which referrals they
  // made from the ones assigned to them, the split §10 requires.
  const sheet = await reopen(await collect([referral()]));
  const column = exportColumns.findIndex((c) => c.key === "Relationship") + 1;

  assert.equal(sheet.getRow(DATA).getCell(column).value, "REFERRED_BY_ME");
});

test("timestamps read as Manila wall time, not UTC", async () => {
  // The period is Manila days, so the cells have to agree with it. A referral
  // created 07:52 on 1 September Manila stores as 2026-08-31T23:52Z; printing
  // the instant would date it 31 August in a September report and read as an
  // off-by-one to whoever opened the file.
  const sheet = await reopen(await collect([referral()]));
  const column = exportColumns.findIndex((c) => c.key === "CreatedAt") + 1;
  const cell = sheet.getRow(DATA).getCell(column).value;

  assert.equal(cell.toISOString(), "2026-09-01T07:52:55.000Z");
});

test("the header row is bold", async () => {
  // Not decoration. WorkbookWriter defaults useStyles to false and silently
  // writes no styles at all -- the header had been set bold since the export
  // shipped and never was. Nothing failed, because nothing looked. This is the
  // cheapest assertion that the style pipeline is switched on.
  //
  // Read off a cell rather than the row: styling moved to per-cell when the
  // header gained a fill, and row.font goes undefined without anything failing.
  const sheet = await reopen(await collect([referral()]));

  assert.equal(sheet.getRow(HEADER).getCell(1).font?.bold, true);
});

test("the header is filled and its text is legible against the fill", async () => {
  // A dark fill with the default black font is unreadable, and it renders that
  // way only when somebody opens the file.
  const sheet = await reopen(await collect([referral()]));
  const cell = sheet.getRow(HEADER).getCell(1);

  assert.equal(cell.fill?.fgColor?.argb, "FF1F3864");
  assert.equal(cell.font?.color?.argb, "FFFFFFFF");
});

test("the header row is frozen and filterable", async () => {
  // Both are why the file is usable at all past thirty rows. In a streaming
  // writer the freeze has to be passed at addWorksheet -- setting sheet.views
  // afterwards is accepted and silently does nothing.
  const sheet = await reopen(await collect([referral()]));

  assert.equal(sheet.views?.[0]?.state, "frozen");
  assert.equal(sheet.views?.[0]?.ySplit, HEADER, "the title block must freeze with the header");
  assert.ok(sheet.autoFilter, "no autofilter on the header row");
});

test("data rows are banded, and the banding starts below the header", async () => {
  // The first data row is unfilled and the second is filled. Getting this
  // backwards puts a band directly under the header, which reads as a second
  // header row.
  //
  // An unbanded cell reads back as { pattern: 'none' } rather than undefined --
  // exceljs normalises it on load, so asserting on the pattern is what holds.
  const sheet = await reopen(await collect([referral(), referral(), referral()]));
  const fillOf = (row) => sheet.getRow(row).getCell(1).fill;

  assert.notEqual(fillOf(DATA)?.pattern, "solid");
  assert.equal(fillOf(DATA + 1)?.fgColor?.argb, "FFF2F5FA");
  assert.notEqual(fillOf(DATA + 2)?.pattern, "solid");
});

test("neither code column survives", async () => {
  // Removed 2026-09-09 on request. BranchName and GroupName carry the meaning;
  // the codes were internal keys sitting in a file a person reads.
  const sheet = await reopen(await collect([referral()]));
  const headers = sheet.getRow(HEADER).values.slice(1);

  assert.equal(headers.includes("Branch Code"), false);
  assert.equal(headers.includes("Group Code"), false);
  assert.equal(headers.includes("Branch"), true);
  assert.equal(headers.includes("Group"), true);
});

test("Created carries the time and Status Date does not", async () => {
  // Excel's default format for a date cell drops the time, which hid the whole
  // point of the Manila shift: 9/1/2026 alone cannot be told from 9/1/2026, and
  // the difference between 07:52 and 15:52 is what the shift exists to get
  // right. StatusDate is a date in the schema and stays one.
  const sheet = await reopen(await collect([referral()]));
  const cell = (key) =>
    sheet.getRow(DATA).getCell(exportColumns.findIndex((c) => c.key === key) + 1);

  assert.match(cell("CreatedAt").numFmt, /hh:mm/);
  assert.match(cell("ConsentConfirmedAt").numFmt, /hh:mm/);
  assert.doesNotMatch(cell("StatusDate").numFmt, /hh:mm/);
});

test("a null timestamp stays null rather than becoming an epoch date", async () => {
  // ConsentConfirmedAt is null on a referral consented by upload. Shifting null
  // by eight hours would render 1 January 1970 in the cell.
  const sheet = await reopen(
    await collect([referral({ ConsentConfirmedAt: null })]),
  );
  const column = exportColumns.findIndex((c) => c.key === "ConsentConfirmedAt") + 1;

  assert.equal(sheet.getRow(DATA).getCell(column).value, null);
});

test("an Account Officer's own referral keeps its empty branch", async () => {
  // BranchCode is NULL on every AO-created referral, and BranchName with it.
  // The file must show the gap rather than filling it -- an AO's referral has
  // no branch, and anything written there would be invented.
  const sheet = await reopen(
    await collect([referral({ BranchCode: null, BranchName: null })]),
  );
  const column = exportColumns.findIndex((c) => c.key === "BranchName") + 1;

  assert.equal(sheet.getRow(DATA).getCell(column).value, null);
});

test("an empty period still produces a file with headers", async () => {
  // A report of nothing is a legitimate answer and must not be a broken
  // download.
  const sheet = await reopen(await collect([]));

  assert.equal(sheet.rowCount, HEADER);
});

// ------------------------------------------------------------ title block

test("the sheet opens with the report title", async () => {
  const sheet = await reopen(await collect([referral()]));

  assert.equal(sheet.getRow(1).getCell(1).value, "Bancassurance Referral Reports");
  assert.equal(sheet.getRow(1).getCell(1).font?.bold, true);
});

test("the subtitle names the period, the role and the Manila timestamp", async () => {
  const sheet = await reopen(await collect([referral()]));
  const subtitle = sheet.getRow(2).getCell(1).value;

  assert.match(subtitle, /2026-09-01 to 2026-09-30/);
  assert.match(subtitle, /Generated by Branch Staff/);
  assert.match(subtitle, /2026-09-09 10:57 Manila/);
});

test("the role is printed readably rather than as its constant", async () => {
  // BRANCH_STAFF on a page a person reads is a leak of an internal identifier.
  for (const [role, label] of [
    ["BRANCH_STAFF", "Branch Staff"],
    ["ACCOUNT_OFFICER", "Account Officer"],
    ["REGIONAL_SALES_HEAD", "Regional Sales Head"],
    ["SUPERADMIN", "Superadmin"],
  ]) {
    assert.match(buildSubtitle({ ...META, role }), new RegExp(`Generated by ${label}`), role);
  }
});

test("the timestamp is Manila, not UTC", async () => {
  // Everything else in the file is Manila wall time. A UTC stamp in the header
  // would sit eight hours behind the rows underneath it and read as an error.
  const subtitle = buildSubtitle({
    ...META,
    generatedAt: new Date("2026-09-09T16:30:00.000Z"),
  });

  assert.match(subtitle, /2026-09-10 00:30 Manila/);
});

test("a missing role does not print undefined on the report", async () => {
  assert.match(buildSubtitle({ ...META, role: undefined }), /Generated by Unknown role/);
  assert.doesNotMatch(buildSubtitle({ ...META, role: undefined }), /undefined/);
});

test("the title block spans the table rather than sitting in one cell", async () => {
  // Unmerged, the title is a lone value in A1 that Excel clips as soon as B1 is
  // filled -- and B1 is filled, because the header row is under it.
  const sheet = await reopen(await collect([referral()]));

  assert.ok(sheet.getCell("A1").isMerged, "the title row is not merged");
  assert.ok(sheet.getCell("A2").isMerged, "the subtitle row is not merged");
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
