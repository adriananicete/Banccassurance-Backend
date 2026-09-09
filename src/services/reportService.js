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

  // The export defaults to everything in the caller's scope. The five presets
  // are there to narrow it, so a bare download should not silently be one month.
  // getSummary keeps thisMonth -- it feeds a screen that opens on load.
  const period = resolvePeriod(query, new Date(), "allTime");

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

export const exportColumns = [
  { header: "Referral No", key: "ReferralNo", width: 20 },
  { header: "First Name", key: "FirstName", width: 18 },
  { header: "Last Name", key: "LastName", width: 18 },
  { header: "Email", key: "Email", width: 28 },
  { header: "Branch Code", key: "BranchCode", width: 12 },
  { header: "Branch", key: "BranchName", width: 28 },
  { header: "Group Code", key: "GroupCode", width: 12 },
  { header: "Group", key: "GroupName", width: 20 },
  { header: "AO Code", key: "AOCode", width: 16 },
  { header: "Account Officer", key: "AOName", width: 24 },
  { header: "Referrer Code", key: "ReferrerCode", width: 16 },
  { header: "Referrer", key: "ReferrerName", width: 24 },
  { header: "Relationship", key: "Relationship", width: 18 },
  { header: "Status", key: "Status", width: 16 },
  { header: "Status Date", key: "StatusDate", width: 14, style: { numFmt: DAY } },
  { header: "Consent", key: "ConsentStatus", width: 14 },
  { header: "Consent Confirmed", key: "ConsentConfirmedAt", width: 22, style: { numFmt: MINUTE } },
  { header: "Created", key: "CreatedAt", width: 22, style: { numFmt: MINUTE } },
];

const dateColumns = ["StatusDate", "ConsentConfirmedAt", "CreatedAt"];


export const writeReferralWorkbook = async (rows, stream) => {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet("Referrals");

  sheet.columns = exportColumns;
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const shifted = { ...row };
    for (const column of dateColumns) shifted[column] = asManilaWallTime(row[column]);

    sheet.addRow(shifted).commit();
  }

  sheet.commit();
  await workbook.commit();
};
