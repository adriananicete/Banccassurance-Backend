import sql from '../config/db.js'

export const validateUser = (identifier) => {
  const request = new sql.Request()
  request.input('Identifier', sql.NVarChar, identifier)
  return { request, run: () => request.execute('[banc].[usp_ValidateUser]') }
}

export const getPasswordHash = (userCode) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      SELECT PasswordHash
      FROM banc.Users
      WHERE UserCode = @UserCode
    `)
  }
}

export const updatePassword = (userCode, passwordHash) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  request.input('PasswordHash', sql.NVarChar, passwordHash)
  return { request, run: () => request.execute('[banc].[usp_upd_user_password]') }
}

export const getPhoto = (userCode) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      SELECT Photo
      FROM banc.Users
      WHERE UserCode = @UserCode
    `)
  }
}

export const updatePhoto = (userCode, photo) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  request.input('Photo', sql.NVarChar, photo)
  return {
    request,
    run: () => request.query(`
      UPDATE banc.Users
      SET Photo = @Photo
      WHERE UserCode = @UserCode
    `)
  }
}

export const getGroups = () => {
  const request = new sql.Request()
  return {
    request,
    run: () => request.query(`
      SELECT AreaCode, AreaName
      FROM banc.group_areas
      ORDER BY AreaName
    `)
  }
}

export const getBranches = (areaCode) => {
  const request = new sql.Request()

  if (areaCode) {
    request.input('AreaCode', sql.Int, areaCode)
    return {
      request,
      run: () => request.query(`
        SELECT BranchCode, BranchName, AreaCode
        FROM banc.branches
        WHERE AreaCode = @AreaCode
        ORDER BY BranchName
      `)
    }
  }

  return {
    request,
    run: () => request.query(`
      SELECT BranchCode, BranchName, AreaCode
      FROM banc.branches
      ORDER BY BranchName
    `)
  }
}

// Shared by checkEmail (checkOnly: true) and register (checkOnly: false) — same SP,
// checkOnly mode only ever sets Email/CheckOnly, matching the original checkEmail inputs exactly.
export const checkOrRegisterUser = ({
  email, checkOnly, firstName, middleName, lastName, suffix,
  birthday, mobileNumber, position, role, areaCode, branchCode, passwordHash
}) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  request.input('CheckOnly', sql.Bit, checkOnly ? 1 : 0)

  if (!checkOnly) {
    request.input('FirstName', sql.NVarChar, firstName)
    request.input('MiddleName', sql.NVarChar, middleName || null)
    request.input('LastName', sql.NVarChar, lastName)
    request.input('Suffix', sql.NVarChar, suffix || null)
    request.input('Birthday', sql.Date, birthday)
    request.input('MobileNumber', sql.NVarChar, mobileNumber)
    request.input('Position', sql.NVarChar, position)
    request.input('Role', sql.NVarChar, role)
    request.input('AreaCode', sql.NVarChar, areaCode || null)
    request.input('BranchCode', sql.Int, branchCode || null)
    request.input('PasswordHash', sql.NVarChar, passwordHash)
  }

  return { request, run: () => request.execute('banc.usp_ins_register_user') }
}

export const getUsersForApproval = (branchCode, statusFilter) => {
  const request = new sql.Request()
  request.input('BranchCode', sql.Int, branchCode)
  request.input('StatusFilter', sql.NVarChar, statusFilter)
  return { request, run: () => request.execute('banc.usp_sel_users_for_approval') }
}

export const approveRejectUser = (userId, action) => {
  const request = new sql.Request()
  request.input('UserId', sql.Int, userId)
  request.input('Action', sql.NVarChar, action)
  return { request, run: () => request.execute('banc.usp_ins_approve_reject_user') }
}
