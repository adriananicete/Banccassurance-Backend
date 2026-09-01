import * as reportModel from "../models/reportModel.js";
import { throwHttpError } from "../utils/error.js";
import { reportGroupBy, validStatus, verifiedMap } from "../utils/constant.js";
import { resolvePeriod } from "../utils/reportPeriod.js";

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
