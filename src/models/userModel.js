import sql from "../config/db.js";

import * as auditModel from "./auditModel.js";
import { asInt, asText } from "../utils/sqlValue.js";
import { branchListPageSize } from "../utils/constant.js";

export const validateUser = (identifier) => {
  const request = new sql.Request();
  request.input("Identifier", sql.NVarChar, identifier);
  return { request, run: () => request.execute("[banc].[usp_ValidateUser]") };
};

export const getPasswordHash = (userCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT PasswordHash
      FROM banc.Users
      WHERE UserCode = @UserCode
    `),
  };
};

export const updatePassword = (userCode, passwordHash) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("PasswordHash", sql.NVarChar, passwordHash);
  return {
    request,
    run: () => request.execute("[banc].[usp_upd_user_password]"),
  };
};

export const getPhoto = (userCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT Photo
      FROM banc.Users
      WHERE UserCode = @UserCode
    `),
  };
};

export const updatePhoto = (userCode, photo) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("Photo", sql.NVarChar, photo);
  return {
    request,
    run: () =>
      request.query(`
      UPDATE banc.Users
      SET Photo = @Photo
      WHERE UserCode = @UserCode
    `),
  };
};

export const getGroups = () => {
  const request = new sql.Request();
  return {
    request,
    run: () =>
      request.query(`
      SELECT GroupCode, GroupName
      FROM banc.group_areas
      ORDER BY GroupName
    `),
  };
};

export const getBranches = (groupCode, search, options = {}) => {
  const request = new sql.Request();
  const area = asInt(groupCode);
  const page = asInt(options.PageNumber);
  const size = asInt(options.PageSize);

  request.input("GroupCode", sql.Int, Number.isFinite(area) ? area : null);
  request.input("Search", sql.NVarChar, asText(search));
  request.input("PageNumber", sql.Int, Number.isFinite(page) ? page : 1);
  request.input("PageSize", sql.Int, Number.isFinite(size) ? size : branchListPageSize);

  return {
    request,
    run: () => request.execute("banc.usp_sel_branches"),
  };
};

export const checkOrRegisterUser = ({
  email,
  checkOnly,
  firstName,
  middleName,
  lastName,
  suffix,
  birthday,
  mobileNumber,
  position,
  role,
  groupCode,
  branchCode,
  passwordHash,
  employeeNo,
}) => {
  const request = new sql.Request();
  request.input("Email", sql.NVarChar, email);
  request.input("CheckOnly", sql.Bit, checkOnly ? 1 : 0);

  if (!checkOnly) {
    request.input("FirstName", sql.NVarChar, firstName);
    request.input("MiddleName", sql.NVarChar, middleName || null);
    request.input("LastName", sql.NVarChar, lastName);
    request.input("Suffix", sql.NVarChar, suffix || null);
    request.input("Birthday", sql.Date, birthday);
    request.input("MobileNumber", sql.NVarChar, mobileNumber);
    request.input("Position", sql.NVarChar, position);
    request.input("Role", sql.NVarChar, role);
    request.input("GroupCode", sql.NVarChar, asText(groupCode));
    request.input("BranchCode", sql.Int, asInt(branchCode));
    request.input("PasswordHash", sql.NVarChar, passwordHash);
    request.input("EmployeeNo", sql.NVarChar, employeeNo || null);
  }

  return { request, run: () => request.execute("banc.usp_ins_register_user") };
};

export const getUsersForApproval = (user, options = {}) => {
  const request = new sql.Request();
  request.input("CallerRole", sql.NVarChar, asText(user.Role));
  request.input("CallerUserCode", sql.NVarChar, asText(user.UserCode));
  request.input("BranchCode", sql.Int, asInt(user.BranchCode));
  request.input("GroupCode", sql.Int, asInt(user.GroupCode));
  request.input("StatusFilter", sql.NVarChar, asText(options.StatusFilter) ?? "ALL");
  request.input("Search", sql.NVarChar, asText(options.Search));
  request.input("PageNumber", sql.Int, asInt(options.PageNumber) ?? 1);
  request.input("PageSize", sql.Int, asInt(options.PageSize) ?? 20);
  return {
    request,
    run: () => request.execute("banc.usp_sel_users_for_approval"),
  };
};

export const approveRejectUser = (userId, action) => {
  const request = new sql.Request();
  request.input("UserId", sql.Int, userId);
  request.input("Action", sql.NVarChar, action);
  return {
    request,
    run: () => request.execute("banc.usp_ins_approve_reject_user"),
  };
};

export const getUserScopeById = (userId) => {
  const request = new sql.Request();
  request.input("UserId", sql.Int, userId);
  return {
    request,
    run: () =>
      request.query(
        `SELECT UserId, UserCode, IsActive, Role, BranchCode, GroupCode FROM banc.Users WHERE UserId = @UserId`,
      ),
  };
};

export const getSuperadmins = () => {
  const request = new sql.Request();
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode
      FROM banc.Users
      WHERE Role = 'SUPERADMIN' AND IsActive = 1
      ORDER BY UserCode
    `),
  };
};

export const findUserIdByCode = (userCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserId FROM banc.Users WHERE UserCode = @UserCode
    `),
  };
};

export const isAreaInRegionalScope = (userCode, groupCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("GroupCode", sql.Int, Number(groupCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT 1 AS InScope
FROM banc.regional_sales_head_areas
WHERE UserCode = @UserCode AND GroupCode = @GroupCode
      `),
  };
};

export const countUsersByRole = (role) => {
  const request = new sql.Request();
  request.input("Role", sql.NVarChar, asText(role));
  return {
    request,
    run: () =>
      request.query(`
      SELECT COUNT(*) AS Total
      FROM banc.Users
      WHERE Role = @Role AND IsActive >= 0
      `),
  };
};

export const checkEmployeeNoExists = (employeeNo) => {
  const request = new sql.Request();
  request.input("EmployeeNo", sql.NVarChar, employeeNo);
  return {
    request,
    run: () =>
      request.query(`
      SELECT EmployeeNo FROM banc.Users WHERE EmployeeNo = @EmployeeNo
      `),
  };
};

export const getBranchHeadByBranch = (branchCode) => {
  const request = new sql.Request();
  request.input("BranchCode", sql.Int, asInt(branchCode));
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'BRANCH_HEAD' AND BranchCode = @BranchCode AND IsActive = 1
      `),
  };
};

export const assignAreaSalesHeadArea = (userCode, groupCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("GroupCode", sql.Int, Number(groupCode));
  return {
    request,
    run: () =>
      request.query(`
      INSERT INTO banc.area_sales_head_areas (UserCode, GroupCode)
VALUES (@UserCode, @GroupCode)
      `),
  };
};

export const getAreaSalesHeadByArea = (groupCode) => {
  const request = new sql.Request();
  request.input("GroupCode", sql.Int, Number(groupCode));
  return {
    request,
    run: () =>
      request.query(`
       SELECT u.UserCode 
FROM banc.Users u
INNER JOIN banc.area_sales_head_areas a ON u.UserCode = a.UserCode
WHERE u.Role = 'AREA_SALES_HEAD'
  AND a.GroupCode = @GroupCode
  AND u.IsActive = 1
      `),
  };
};

export const getRegionalSalesHeadByArea = (groupCode) => {
  const request = new sql.Request();
  request.input("GroupCode", sql.Int, Number(groupCode));
  return {
    request,
    run: () =>
      request.query(`
      SELECT u.UserCode 
FROM banc.Users u
INNER JOIN banc.regional_sales_head_areas r ON u.UserCode = r.UserCode
WHERE u.Role = 'REGIONAL_SALES_HEAD'
  AND r.GroupCode = @GroupCode
  AND u.IsActive = 1
      `),
  };
};

export const getDepartmentHead = () => {
  const request = new sql.Request();
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'DEPARTMENT_HEAD' AND IsActive = 1
      `),
  };
};

export const getAccountOfficerByCode = (aoCode) => {
  const request = new sql.Request();
  request.input("AOCode", sql.NVarChar, aoCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'ACCOUNT_OFFICER' AND UserCode = @AOCode AND IsActive = 1
      `),
  };
};

export const getGroupHeadByArea = (groupCode) => {
  const request = new sql.Request();
  request.input("GroupCode", sql.Int, asInt(groupCode));
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'GROUP_HEAD' AND GroupCode = @GroupCode AND IsActive = 1
      `),
  };
};

export const getSectorHead = () => {
  const request = new sql.Request();
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'SECTOR_HEAD' AND IsActive = 1
      `),
  };
};

export const isAreaInAreaSalesHeadScope = (userCode, groupCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("GroupCode", sql.Int, Number(groupCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT 1 AS InScope
FROM banc.area_sales_head_areas
WHERE UserCode = @UserCode AND GroupCode = @GroupCode
      `),
  };
};

export const isAshInRegionalScope = (rshUserCode, ashUserCode) => {
  const request = new sql.Request();
  request.input("RshUserCode", sql.NVarChar, rshUserCode);
  request.input("AshUserCode", sql.NVarChar, ashUserCode);

  return {
    request,
    run: () =>
      request.query(`SELECT 1 AS InScope
FROM banc.area_sales_head_areas a
INNER JOIN banc.regional_sales_head_areas r ON a.GroupCode = r.GroupCode
WHERE a.UserCode = @AshUserCode AND r.UserCode = @RshUserCode`),
  };
};


export const replaceAccountOfficerBranches = (userCode, branchCodes, audit) => {
  return {
    run: async () => {
      const transaction = new sql.Transaction()
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        request.input('UserCode', sql.NVarChar, userCode)
        request.input('BranchCodes', sql.NVarChar, branchCodes)

        await request.query(`DELETE FROM banc.account_officer_branches WHERE UserCode = @UserCode`)
        await request.query(`INSERT INTO banc.account_officer_branches (UserCode, BranchCode)
SELECT @UserCode, CAST(value AS INT)
FROM STRING_SPLIT(@BranchCodes, ',')
WHERE LTRIM(RTRIM(value)) <> ''`)

        await auditModel.insert(audit, transaction).run()

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    }
  }
}

export const replaceAreaSalesHeadAreas = (userCode, groupCodes, audit) => {
  return {
    run: async () => {
      const transaction = new sql.Transaction()
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        request.input('UserCode', sql.NVarChar, userCode)
        request.input('GroupCodes', sql.NVarChar, groupCodes)

        await request.query(`DELETE FROM banc.area_sales_head_areas WHERE UserCode = @UserCode`)
        await request.query(`INSERT INTO banc.area_sales_head_areas (UserCode, GroupCode)
SELECT @UserCode, CAST(value AS INT)
FROM STRING_SPLIT(@GroupCodes, ',')
WHERE LTRIM(RTRIM(value)) <> ''`)

        await auditModel.insert(audit, transaction).run()

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    }
  }
}

export const replaceRegionalSalesHeadAreas = (userCode, groupCodes, audit) => {
  return {
    run: async () => {
      const transaction = new sql.Transaction()
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        request.input('UserCode', sql.NVarChar, userCode)
        request.input('GroupCodes', sql.NVarChar, groupCodes)

        await request.query(`DELETE FROM banc.regional_sales_head_areas WHERE UserCode = @UserCode`)
        await request.query(`INSERT INTO banc.regional_sales_head_areas (UserCode, GroupCode, RegionCode)
SELECT @UserCode, g.GroupCode, g.RegionCode
FROM STRING_SPLIT(@GroupCodes, ',') s
INNER JOIN banc.group_areas g ON g.GroupCode = CAST(s.value AS INT)
WHERE LTRIM(RTRIM(s.value)) <> ''`)

        await auditModel.insert(audit, transaction).run()

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    }
  }
}

export const getBranchesOutsideAreaSalesHeadScope = (ashUserCode, branchCodes) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, ashUserCode);
  request.input("BranchCodes", sql.NVarChar, branchCodes);
  return {
    request,
    run: () =>
      request.query(`
      SELECT DISTINCT CAST(s.value AS INT) AS BranchCode
FROM STRING_SPLIT(@BranchCodes, ',') s
WHERE LTRIM(RTRIM(s.value)) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM banc.branches b
      INNER JOIN banc.area_sales_head_areas a ON a.GroupCode = b.GroupCode
      WHERE b.BranchCode = CAST(s.value AS INT)
        AND a.UserCode = @UserCode
  )
      `),
  };
};

export const getBranchesAssignedToOtherAO = (userCode, branchCodes) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("BranchCodes", sql.NVarChar, branchCodes);
  return {
    request,
    run: () =>
      request.query(`
      SELECT DISTINCT aob.BranchCode
FROM banc.account_officer_branches aob
INNER JOIN STRING_SPLIT(@BranchCodes, ',') s
        ON aob.BranchCode = CAST(s.value AS INT)
WHERE aob.UserCode <> @UserCode
      `),
  };
};

export const getAreasOutsideRegionalSalesHeadScope = (rshUserCode, groupCodes) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, rshUserCode);
  request.input("GroupCodes", sql.NVarChar, groupCodes);
  return {
    request,
    run: () =>
      request.query(`
      SELECT DISTINCT CAST(s.value AS INT) AS GroupCode
FROM STRING_SPLIT(@GroupCodes, ',') s
WHERE LTRIM(RTRIM(s.value)) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM banc.regional_sales_head_areas r
      WHERE r.UserCode = @UserCode
        AND r.GroupCode = CAST(s.value AS INT)
  )
      `),
  };
};

export const getUnknownAreas = (groupCodes) => {
  const request = new sql.Request();
  request.input("GroupCodes", sql.NVarChar, groupCodes);
  return {
    request,
    run: () =>
      request.query(`
      SELECT DISTINCT CAST(s.value AS INT) AS GroupCode
FROM STRING_SPLIT(@GroupCodes, ',') s
WHERE LTRIM(RTRIM(s.value)) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM banc.group_areas g
      WHERE g.GroupCode = CAST(s.value AS INT)
  )
      `),
  };
};