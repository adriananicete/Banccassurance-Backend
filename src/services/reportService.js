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
import { resolvePeriod, asManilaWallTime } from "../utils/reportPeriod.js";

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
