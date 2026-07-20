import sql from '../config/db.js'

export const getReferrerByCode = (code) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, code)
  return { request, run: () => request.execute('[banc].[usp_sel_referrer_by_code]') }
}

export const getPlans = () => {
  const request = new sql.Request()
  return { request, run: () => request.execute('[banc].[usp_sel_plans]') }
}

export const createReferral = (data) => {
  const request = new sql.Request()
  request.input('FirstName', sql.NVarChar, data.firstName)
  request.input('LastName', sql.NVarChar, data.lastName)
  request.input('MiddleName', sql.NVarChar, data.middleName)
  request.input('Suffix', sql.NVarChar, data.suffix)
  request.input('Birthdate', sql.Date, data.birthdate)
  request.input('Occupation', sql.NVarChar, data.occupation)
  request.input('Email', sql.NVarChar, data.email)
  request.input('PlanId', sql.Int, data.planId)
  request.input('ReferrerCode', sql.NVarChar, data.referrerCode)
  request.input('ReferrerName', sql.NVarChar, data.referrerName)
  request.input('BranchCode', sql.Int, parseInt(data.branchCode || 0, 10))
  request.input('AreaCode', sql.Int, parseInt(data.areaCode || 0, 10))
  request.input('BranchName', sql.NVarChar, data.branchName)
  request.input('AreaName', sql.NVarChar, data.areaName)
  request.input('Status', sql.NVarChar, data.status)
  request.input('StatusDate', sql.Date, data.statusDate)
  request.input('AOName', sql.NVarChar, data.aoName)
  request.input('AOCode', sql.NVarChar, data.aoCode)
  return { request, run: () => request.execute('[banc].[usp_ins_referrals]') }
}

export const insertConsentRequest = (email, token) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  request.input('Token', sql.NVarChar, token)
  return { request, run: () => request.execute('[banc].[usp_insert_consent_request]') }
}

export const updateProfiling = (id, fields) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  request.input('CivilStatus', sql.NVarChar, fields.civilStatus)
  request.input('Nationality', sql.NVarChar, fields.nationality)
  request.input('MobileNumber', sql.NVarChar, fields.mobileNumber)
  request.input('HomeAddress', sql.NVarChar, fields.homeAddress)
  request.input('MessengerName', sql.NVarChar, fields.messengerName)
  request.input('CompanyName', sql.NVarChar, fields.companyName)
  request.input('Position', sql.NVarChar, fields.position)
  request.input('LengthOfService', sql.NVarChar, fields.lengthOfService)
  request.input('MonthlyIncomeRange', sql.NVarChar, fields.monthlyIncomeRange)
  request.input('ExistingProducts', sql.NVarChar, fields.existingProducts)
  request.input('MonthlySavingsCapacity', sql.NVarChar, fields.monthlySavingsCapacity)
  request.input('InterestedProducts', sql.NVarChar, fields.interestedProducts)
  request.input('PreferredCommunication', sql.NVarChar, fields.preferredCommunication)
  request.input('PreferredSchedule', sql.NVarChar, fields.preferredSchedule)
  return { request, run: () => request.execute('[banc].[usp_upd_referrals_profiling]') }
}

export const confirmConsentRequest = (token) => {
  const request = new sql.Request()
  request.input('Token', sql.NVarChar, token)
  return { request, run: () => request.execute('[banc].[usp_confirm_consent_request]') }
}

export const checkConsent = (email) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  return { request, run: () => request.execute('[banc].[usp_check_consent]') }
}

// AreaCode is intentionally sql.NVarChar here (unlike createReferral's sql.Int) —
// preserved as-is, matches the pre-existing SP contract for this call.
export const getReferralsByRole = (user) => {
  const request = new sql.Request()
  request.input('Role', sql.NVarChar, user.Role)
  request.input('UserCode', sql.NVarChar, user.UserCode)
  request.input('BranchCode', sql.Int, user.BranchCode || 0)
  request.input('AreaCode', sql.NVarChar, user.AreaCode || '0')
  return { request, run: () => request.execute('[banc].[usp_sel_referrals_by_role]') }
}

export const getReferralContactInfo = (id) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  return {
    request,
    run: () => request.query(`
      SELECT [ReferrerCode], [FirstName], [LastName]
      FROM [banc].[Referrals]
      WHERE [Id] = @Id
    `)
  }
}

export const updateStatus = (id, status) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  request.input('Status', sql.NVarChar, status)
  return { request, run: () => request.execute('[banc].[usp_upd_referral_status]') }
}

export const getReferralById = (id) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  return { request, run: () => request.execute('[banc].[usp_sel_referral_by_id]') }
}


export const findActiveDuplicate = (email, tenantPrefix) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  request.input('Prefix', sql.NVarChar, tenantPrefix + '-%')
  return { request, run: () => request.query(`
      SELECT Id, ReferralNo, FirstName, LastName, MiddleName, Suffix, Email, MobileNumber, Status, StatusDate, ReferrerCode, ReferrerName, BranchCode, BranchName, AreaCode, AreaName, AOName, AOCode, CreatedAt FROM banc.Referrals
      WHERE Email = @Email AND Status NOT IN ('Closed', 'Declined')
      AND ReferrerCode LIKE @Prefix
    `)}
}