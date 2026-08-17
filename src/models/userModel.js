import sql from "../config/db.js";

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
      SELECT AreaCode, AreaName
      FROM banc.group_areas
      ORDER BY AreaName
    `),
  };
};

export const getBranches = (areaCode) => {
  const request = new sql.Request();

  if (areaCode) {
    request.input("AreaCode", sql.Int, areaCode);
    return {
      request,
      run: () =>
        request.query(`
        SELECT BranchCode, BranchName, AreaCode
        FROM banc.branches
        WHERE AreaCode = @AreaCode
        ORDER BY BranchName
      `),
    };
  }

  return {
    request,
    run: () =>
      request.query(`
      SELECT BranchCode, BranchName, AreaCode
      FROM banc.branches
      ORDER BY BranchName
    `),
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
  areaCode,
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
    request.input("AreaCode", sql.NVarChar, areaCode || null);
    request.input("BranchCode", sql.Int, branchCode || null);
    request.input("PasswordHash", sql.NVarChar, passwordHash);
    request.input("EmployeeNo", sql.NVarChar, employeeNo || null);
  }

  return { request, run: () => request.execute("banc.usp_ins_register_user") };
};

export const getUsersForApproval = (branchCode, statusFilter) => {
  const request = new sql.Request();
  request.input("BranchCode", sql.Int, branchCode);
  request.input("StatusFilter", sql.NVarChar, statusFilter);
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
        `SELECT UserId, UserCode, IsActive, Role, BranchCode, AreaCode FROM banc.Users WHERE UserId = @UserId`,
      ),
  };
};

export const getBranchHeadsForApproval = (areaCode, status) => {
  const request = new sql.Request();
  request.input("AreaCode", sql.NVarChar, areaCode);
  request.input("StatusFilter", sql.NVarChar, status);
  return {
    request,
    run: () =>
      request.query(
        `SELECT
    UserId,
    UserCode,
    FirstName,
    LastName,
    Email,
    MobileNumber,
    Position,
    Role,
    IsActive,
    CreatedAt,
    CASE
        WHEN IsActive = 1  THEN 'APPROVED'
        WHEN IsActive = -1 THEN 'REJECTED'
        ELSE 'PENDING'
    END AS Status
FROM banc.Users
WHERE AreaCode = @AreaCode
  AND Role = 'BRANCH_HEAD'
  AND (
        @StatusFilter = 'ALL'
     OR (@StatusFilter = 'PENDING'  AND IsActive = 0)
     OR (@StatusFilter = 'APPROVED' AND IsActive = 1)
     OR (@StatusFilter = 'REJECTED' AND IsActive = -1)
  )
ORDER BY CreatedAt DESC;`,
      ),
  };
};

export const getGroupHeadsForApproval = (userId, status) => {
  const request = new sql.Request();
  request.input("UserId", sql.Int, userId);
  request.input("StatusFilter", sql.NVarChar, status);
  return {
    request,
    run: () =>
      request.query(`
      SELECT
    UserId,
    UserCode,
    FirstName,
    LastName,
    Email,
    MobileNumber,
    Position,
    Role,
    IsActive,
    CreatedAt,
    CASE
        WHEN IsActive = 1  THEN 'APPROVED'
        WHEN IsActive = -1 THEN 'REJECTED'
        ELSE 'PENDING'
    END AS Status
FROM banc.Users
  WHERE Role = 'GROUP_HEAD'
  AND AreaCode IN (
  SELECT CAST(AreaCode AS NVARCHAR) FROM banc.user_area WHERE UserId = @UserId
)
  AND (
        @StatusFilter = 'ALL' 
     OR (@StatusFilter = 'PENDING'  AND IsActive = 0)
     OR (@StatusFilter = 'APPROVED' AND IsActive = 1)
     OR (@StatusFilter = 'REJECTED' AND IsActive = -1)
  )
ORDER BY CreatedAt DESC;
      `),
  };
};

export const isAreaInSectorScope = (sectorHeadUserId, areaCode) => {
  const request = new sql.Request();
  request.input("UserId", sql.Int, sectorHeadUserId);
  request.input("AreaCode", sql.Int, Number(areaCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT 1 AS InScope
FROM banc.user_area
WHERE UserId = @UserId AND AreaCode = @AreaCode
      `),
  };
};

export const isAreaInRegionalScope = (userCode, areaCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, userCode);
  request.input("AreaCode", sql.Int, Number(areaCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT 1 AS InScope
FROM banc.regional_sales_head_areas
WHERE UserCode = @UserCode AND AreaCode = @AreaCode
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
  request.input("BranchCode", sql.Int, branchCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'BRANCH_HEAD' AND BranchCode = @BranchCode AND IsActive = 1
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

export const getGroupHeadByArea = (areaCode) => {
  const request = new sql.Request();
  request.input("AreaCode", sql.NVarChar, areaCode);
  return {
    request,
    run: () =>
      request.query(`
      SELECT UserCode FROM banc.Users WHERE Role = 'GROUP_HEAD' AND AreaCode = @AreaCode AND IsActive = 1
      `),
  };
};

export const getSectorHeadByArea = (areaCode) => {
  const request = new sql.Request();
  request.input("AreaCode", sql.Int, Number(areaCode));
  return {
    request,
    run: () =>
      request.query(`
      SELECT u.UserCode 
FROM banc.Users u
INNER JOIN banc.user_area ua ON u.UserId = ua.UserId
WHERE u.Role = 'SECTOR_HEAD' 
  AND ua.AreaCode = @AreaCode 
  AND u.IsActive = 1
      `),
  };
};
