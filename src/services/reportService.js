import ExcelJS from "exceljs";
import * as reportModel from "../models/reportModel.js";
import * as referralModel from "../models/referralModel.js";
import { throwHttpError } from "../utils/error.js";
import {
  AREA_SALES_HEAD,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  reportGroupBy,
  SECTOR_HEAD,
  validStatus,
  verifiedMap,
} from "../utils/constant.js";
import { resolvePeriod, asManilaWallTime, periodLabel } from "../utils/reportPeriod.js";

// The dashboard takes no period and is deliberately all-time.
// usp_sel_referral_counts_by_role has no date parameters at all, so a dated
// dashboard would show a total covering everything beside a breakdown covering
// a month, and the two would not agree on screen. A dated question is what the
// drill-down is for.
const ALL_TIME = resolvePeriod({ preset: "allTime" });

export const getSummary = async (query, user) => {
  const groupBy = String(query.groupBy ?? "").trim().toUpperCase();

  if (!reportGroupBy.includes(groupBy))
    throwHttpError(
      400,
      `Invalid groupBy. Allowed values: ${reportGroupBy.join(", ")}`,
    );

  const period = resolvePeriod(query);

  const result = await reportModel
    .getReferralCounts(user, {
      GroupBy: groupBy,
      ParentGroupCode: query.parentGroupCode,
      ParentRegionCode: query.parentRegionCode,
      DateFrom: period.from,
      DateTo: period.toExclusive,
    })
    .run();

  return {
    groupBy,
    period: {
      preset: period.preset,
      from: period.from.toISOString(),
      toExclusive: period.toExclusive.toISOString(),
    },
    rows: result.recordset,
  };
};

// The level a role sees underneath itself, from the two trees in
// BusinessLogic.md section 10:
//
//   Landbank    Tenant -> Group -> Branch
//   PhilLife    Tenant -> Region -> Group -> Account Officer
//
// A role at the bottom of its tree has nothing below it and gets no breakdown.
// That is Branch Head and Branch Staff on the Landbank side, and the Account
// Officer on the PhilLife side -- an AO's own referrals carry BranchCode NULL,
// so a branch breakdown would drop exactly the rows they care about most.
// Every role still gets the by-status split, which always sums to the total.
const dashboardLevel = {
  [SECTOR_HEAD]: "AREA",
  [GROUP_HEAD]: "BRANCH",
  [DEPARTMENT_HEAD]: "REGION",
  [REGIONAL_SALES_HEAD]: "AREA",
  [AREA_SALES_HEAD]: "AO",
};

export const getDashboard = async (user) => {
  const level = dashboardLevel[user.Role] ?? null;

  const counts = await referralModel.getReferralCountsByRole(user).run();
  const byStatus = counts.recordset;

  const breakdown = level
    ? (
        await reportModel
          .getReferralCounts(user, {
            GroupBy: level,
            ParentGroupCode: null,
            ParentRegionCode: null,
            DateFrom: ALL_TIME.from,
            DateTo: ALL_TIME.toExclusive,
          })
          .run()
      ).recordset
    : [];

  return {
    total: byStatus.reduce((sum, row) => sum + row.Total, 0),
    byStatus,
    level,
    breakdown,
  };
};

export const getExportRows = async (query, user) => {
  const status = query.status ?? null;

  if (status !== null && !validStatus.includes(status))
    throwHttpError(400, "Invalid status value");

  const period = resolvePeriod(query);

  const result = await reportModel
    .getReferralsForExport(user, {
      Search: query.search || null,
      Status: status,
      Verified: verifiedMap[query.verified] ?? null,
      DateFrom: period.from,
      DateTo: period.toExclusive,
    })
    .run();

  return { period, rows: result.recordset };
};

const DAY = "yyyy-mm-dd";
const MINUTE = "yyyy-mm-dd hh:mm";

const CENTRE = { horizontal: "center", vertical: "middle" };
const LEFT = { horizontal: "left", vertical: "middle" };

export const exportColumns = [
  { header: "Referral No", key: "ReferralNo", width: 22, style: { alignment: LEFT } },
  { header: "First Name", key: "FirstName", width: 18, style: { alignment: LEFT } },
  { header: "Last Name", key: "LastName", width: 18, style: { alignment: LEFT } },
  { header: "Email", key: "Email", width: 30, style: { alignment: LEFT } },
  { header: "Branch", key: "BranchName", width: 28, style: { alignment: LEFT } },
  { header: "Group", key: "GroupName", width: 20, style: { alignment: LEFT } },
  { header: "AO Code", key: "AOCode", width: 16, style: { alignment: LEFT } },
  { header: "Account Officer", key: "AOName", width: 26, style: { alignment: LEFT } },
  { header: "Referrer Code", key: "ReferrerCode", width: 16, style: { alignment: LEFT } },
  { header: "Referrer", key: "ReferrerName", width: 26, style: { alignment: LEFT } },
  { header: "Relationship", key: "Relationship", width: 20, style: { alignment: CENTRE } },
  { header: "Status", key: "Status", width: 16, style: { alignment: CENTRE } },
  { header: "Status Date", key: "StatusDate", width: 14, style: { numFmt: DAY, alignment: CENTRE } },
  { header: "Consent", key: "ConsentStatus", width: 14, style: { alignment: CENTRE } },
  { header: "Consent Confirmed", key: "ConsentConfirmedAt", width: 20, style: { numFmt: MINUTE, alignment: CENTRE } },
  { header: "Created", key: "CreatedAt", width: 20, style: { numFmt: MINUTE, alignment: CENTRE } },
];

const dateColumns = ["StatusDate", "ConsentConfirmedAt", "CreatedAt"];

const HEADER_FILL = "FF1F3864";
const BAND_FILL = "FFF2F5FA";
const GRID = "FFD6DCE5";

const thin = { style: "thin", color: { argb: GRID } };
const gridBorder = { top: thin, left: thin, bottom: thin, right: thin };

const styleHeader = (row) => {
  row.height = 24;

  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = CENTRE;
    cell.border = gridBorder;
  });
};

const TITLE = "Bancassurance Referral Reports";

const roleLabel = (role) =>
  String(role ?? "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ") || "Unknown role";

const manilaStamp = (date) => {
  const shifted = asManilaWallTime(date);
  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
};

export const buildSubtitle = ({ role, period, generatedAt }) =>
  [
    period ? `Period ${periodLabel(period).replace("-to-", " to ")}` : null,
    `Generated by ${roleLabel(role)}`,
    `${manilaStamp(generatedAt)} Manila`,
  ]
    .filter(Boolean)
    .join("   ·   ");

const styleBody = (row, banded) => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = gridBorder;

    if (banded)
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
  });
};

export const TITLE_ROWS = 3;
const HEADER_ROW = TITLE_ROWS + 1;

const writeTitleBlock = (sheet, meta) => {
  const banner = (rowNumber, value, font, height) => {
    const row = sheet.getRow(rowNumber);

    row.getCell(1).value = value;
    row.getCell(1).font = font;
    row.getCell(1).alignment = LEFT;
    row.height = height;

    sheet.mergeCells(rowNumber, 1, rowNumber, exportColumns.length);
    row.commit();
  };

  banner(1, TITLE, { bold: true, size: 16, color: { argb: HEADER_FILL } }, 26);
  banner(2, buildSubtitle(meta), { size: 10, color: { argb: "FF5A6472" } }, 18);

  sheet.getRow(3).height = 6;
  sheet.getRow(3).commit();
};

export const writeReferralWorkbook = async (rows, stream, meta = {}) => {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });

  const sheet = workbook.addWorksheet("Referrals", {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });

  // Without stripping `header`, assigning columns writes the header into row 1,
  // which is where the title goes. The header row is written by hand below.
  sheet.columns = exportColumns.map(({ header, ...rest }) => rest);

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: exportColumns.length },
  };

  writeTitleBlock(sheet, { generatedAt: new Date(), ...meta });

  const header = sheet.getRow(HEADER_ROW);
  header.values = exportColumns.map((column) => column.header);
  styleHeader(header);
  header.commit();

  let written = 0;

  for (const row of rows) {
    const shifted = { ...row };
    for (const column of dateColumns) shifted[column] = asManilaWallTime(row[column]);

    const added = sheet.addRow(shifted);
    styleBody(added, written % 2 === 1);
    added.commit();

    written += 1;
  }

  sheet.commit();
  await workbook.commit();
};
