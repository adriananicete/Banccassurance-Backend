import sql from "../config/db.js";
import { asInt } from "../utils/sqlValue.js";

const bindScope = (request, user) => {
  request.input("Role", sql.NVarChar, user.Role);
  request.input("UserCode", sql.NVarChar, user.UserCode);
  request.input("BranchCode", sql.Int, asInt(user.BranchCode) ?? 0);
  request.input("GroupCode", sql.Int, asInt(user.GroupCode) ?? 0);
};

export const getReferralCounts = (user, options) => {
  const request = new sql.Request();
  bindScope(request, user);
  request.input("ParentGroupCode", sql.Int, asInt(options.ParentGroupCode));
  request.input("ParentClusterCode", sql.Int, null);
  request.input("ParentRegionCode", sql.Int, asInt(options.ParentRegionCode));
  request.input("GroupBy", sql.NVarChar, options.GroupBy);
  request.input("DateFrom", sql.DateTime2, options.DateFrom);
  request.input("DateTo", sql.DateTime2, options.DateTo);

  return {
    request,
    run: () => request.execute("[banc].[usp_rpt_referral_counts_by_role]"),
  };
};

export const getFirstReferralDate = () => {
  const request = new sql.Request();

  return {
    request,
    run: () => request.query("SELECT MIN(CreatedAt) AS FirstCreatedAt FROM banc.Referrals"),
  };
};

export const getReferralsForExport = (user, options) => {
  const request = new sql.Request();
  bindScope(request, user);
  request.input("Search", sql.NVarChar, options.Search);
  request.input("Status", sql.NVarChar, options.Status);
  request.input("Verified", sql.Bit, options.Verified);
  request.input("DateFrom", sql.DateTime2, options.DateFrom);
  request.input("DateTo", sql.DateTime2, options.DateTo);

  return {
    request,
    run: () => request.execute("[banc].[usp_exp_referrals_by_role]"),
  };
};
