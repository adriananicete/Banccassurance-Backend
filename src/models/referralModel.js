import sql from '../config/db.js'
import * as auditModel from './auditModel.js'
import { asInt } from '../utils/sqlValue.js'

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
  request.input('BranchCode', sql.Int, data.branchCode != null ? parseInt(data.branchCode, 10) : null)
  request.input('GroupCode', sql.Int, data.groupCode != null ? parseInt(data.groupCode, 10) : null)
  request.input('BranchName', sql.NVarChar, data.branchName)
  request.input('GroupName', sql.NVarChar, data.groupName)
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

export const getConsentRequestByToken = (token) => {
  const request = new sql.Request()
  request.input('Token', sql.NVarChar, token)
  return {
    request, run: () => request.query(`SELECT Status, ConsumedAt
      FROM [banc].[consent_request]
      WHERE Token = @Token`)
  }
}

export const checkConsent = (email) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  return { request, run: () => request.execute('[banc].[usp_check_consent]') }
}

export const getReferralsByRole = (user,options) => {
  const request = new sql.Request()
  request.input('Role', sql.NVarChar, user.Role)
  request.input('UserCode', sql.NVarChar, user.UserCode)
  request.input('BranchCode', sql.Int, asInt(user.BranchCode) ?? 0)
  request.input('GroupCode', sql.Int, asInt(user.GroupCode) ?? 0)
  request.input('PageNumber', sql.Int, options.PageNumber)
  request.input('PageSize', sql.Int, options?.PageSize)
  request.input('Search', sql.NVarChar, options.Search)
  request.input('Status', sql.NVarChar, options.Status)
  request.input('Verified', sql.Bit, options.Verified)
  request.input('DateFrom', sql.DateTime2, options.DateFrom)
  request.input('DateTo', sql.DateTime2, options.DateTo)
  request.input('SortBy', sql.NVarChar, options.SortBy)
  request.input('SortDir', sql.NVarChar, options.SortDir)
  return { request, run: () => request.execute('[banc].[usp_sel_referrals_by_role_1]') }
}

export const getReferralContactInfo = (id) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  return {
    request,
    run: () => request.query(`
      SELECT [ReferrerCode], [FirstName], [LastName], [BranchCode], [AOCode], [Status]
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

export const getReferralForDeletion = (id) => {
  const request = new sql.Request()
  request.input('Id', sql.UniqueIdentifier, id)
  return {
    request,
    run: () => request.query(`
      SELECT [Id], [ReferralNo], [ReferrerCode], [Status]
      FROM [banc].[Referrals]
      WHERE [Id] = @Id
    `)
  }
}

export const deleteReferral = (id, audit) => {
  return {
    run: async () => {
      const transaction = new sql.Transaction()
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        request.input('Id', sql.UniqueIdentifier, id)

        await request.query(`
          UPDATE [banc].[consent_request]
          SET [ConsumedAt] = NULL, [ConsumedByReferralId] = NULL
          WHERE [ConsumedByReferralId] = @Id
        `)

        await auditModel.insert(audit, transaction).run()

        await request.query(`DELETE FROM [banc].[Referrals] WHERE [Id] = @Id`)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    }
  }
}


export const findActiveDuplicate = (email, tenantPrefix, planId) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  request.input('Prefix', sql.NVarChar, tenantPrefix + '-%')
  request.input('PlanId', sql.Int, planId)
  return { request, run: () => request.query(`
      SELECT ReferralNo, Status, StatusDate, ReferrerName, BranchName, GroupName, AOName
      FROM banc.Referrals
      WHERE Email = @Email AND PlanId = @PlanId AND Status NOT IN ('Approved', 'Declined')
      AND ReferrerCode LIKE @Prefix
    `)}
}

export const uploadConsentFile = (email, filePath) => {
  const request = new sql.Request()
  request.input('Email', sql.NVarChar, email)
  request.input('FilePath', sql.NVarChar, filePath)
  return {
    request, run: () => request.execute('banc.usp_upload_consent_file')
  }
}

export const getReferrerAttribution = (userCode) => {
 const request = new sql.Request()
 request.input('UserCode', sql.NVarChar, userCode)
 return {
  request, run: () => request.query(`
    SELECT
    u.UserCode    AS ReferrerCode,
    COALESCE(u.FullName, u.FirstName + ' ' + u.LastName) AS ReferrerName,
    live.UserCode AS AOCode,
    ao.FullName   AS AOName,
    b.BranchCode,
    b.BranchName,
    b.GroupCode,
    a.GroupName
FROM banc.Users u
INNER JOIN banc.branches b
    ON u.BranchCode = b.BranchCode
INNER JOIN banc.group_areas a
    ON b.GroupCode = a.GroupCode
OUTER APPLY (
    SELECT TOP 1 aob.UserCode
    FROM banc.account_officer_branches aob
    WHERE aob.BranchCode = u.BranchCode
    ORDER BY aob.Id DESC
) live
LEFT JOIN banc.Users ao
    ON ao.UserCode = live.UserCode
WHERE u.UserCode = @UserCode
    `)
 } 
}

export const getAOAttribution = (userCode) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  return {
    request, run: () => request.query(`
      SELECT TOP (1)
          COALESCE(u.FullName, u.FirstName + ' ' + u.LastName) AS ReferrerName,
          b.GroupCode,
          a.GroupName
      FROM banc.Users u
      INNER JOIN banc.account_officer_branches aob
          ON u.UserCode = aob.UserCode
      INNER JOIN banc.branches b
          ON aob.BranchCode = b.BranchCode
      INNER JOIN banc.group_areas a
          ON b.GroupCode = a.GroupCode
      WHERE u.UserCode = @UserCode
      ORDER BY b.GroupCode, aob.BranchCode
      `)
  }
}

export const getReferralCountsByRole = (user) => {
  const request = new sql.Request()
  request.input('Role', sql.NVarChar, user.Role)
  request.input('UserCode', sql.NVarChar, user.UserCode)
  request.input('BranchCode', sql.Int, asInt(user.BranchCode) ?? 0)
  request.input('GroupCode', sql.Int, asInt(user.GroupCode) ?? 0)
  return {
    request, run: () => request.execute('[banc].[usp_sel_referral_counts_by_role]')
  }
}