import sql from "../config/db.js";
import { asInt } from "../utils/sqlValue.js";

const getUnderwritingReferrals = (filters = {}) => {
  let whereClause = [];

  const request = new sql.Request();

  const areaCode = asInt(filters.areaCode);

  if (Number.isFinite(areaCode)) {
      request.input("GroupCode", sql.Int, areaCode);
      whereClause.push("AND GroupCode = @GroupCode");
    }

    if (filters.aoCode) {
      request.input("AOCode", sql.NVarChar, filters.aoCode);
      whereClause.push("AND AOCode = @AOCode");
    } 

    return {
    request, run: () => request.query(`
        SELECT Id, ReferralNo, FirstName, LastName, Email,
       Status, StatusDate, ReferrerCode, ReferrerName,
       BranchCode, BranchName, GroupCode, GroupName,
       AOCode, AOName, CreatedAt
FROM banc.Referrals
WHERE Status IN ('Presented', 'Closed Pending', 'Postponed') ${whereClause.join(' ')}
ORDER BY StatusDate ASC
        `)
  }
};

export default {
  getUnderwritingReferrals,
};
