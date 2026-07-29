import sql from "../config/db.js";

const getClosedPendingReferrals = (filters = {}) => {
  let whereClause = [];

  const request = new sql.Request();

  if (filters.areaCode) {
      request.input("AreaCode", sql.NVarChar, filters.areaCode);
      whereClause.push("AND AreaCode = @AreaCode");
    }

    if (filters.aoCode) {
      request.input("AOCode", sql.NVarChar, filters.aoCode);
      whereClause.push("AND AOCode = @AOCode");
    } 

    return {
    request, run: () => request.query(`
        SELECT Id, ReferralNo, FirstName, LastName, Email,
       Status, StatusDate, ReferrerCode, ReferrerName,
       BranchCode, BranchName, AreaCode, AreaName,
       AOCode, AOName, CreatedAt
FROM banc.Referrals
WHERE Status IN ('Closed Pending', 'Postponed') ${whereClause.join(' ')}
ORDER BY StatusDate ASC
        `)
  }
};

export default {
  getClosedPendingReferrals,
};
