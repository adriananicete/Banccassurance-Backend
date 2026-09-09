import ExcelJS from "exceljs";
import * as reportModel from "../models/reportModel.js";
import { throwHttpError } from "../utils/error.js";
import { reportGroupBy, validStatus, verifiedMap } from "../utils/constant.js";
import { resolvePeriod, asManilaWallTime } from "../utils/reportPeriod.js";

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

const styleBody = (row, banded) => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = gridBorder;

    if (banded)
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
  });
};

export const writeReferralWorkbook = async (rows, stream) => {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });

  const sheet = workbook.addWorksheet("Referrals", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = exportColumns;

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: exportColumns.length },
  };

  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();

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
