import * as referralModel from '../models/referralModel.js'
import * as notificationModel from '../models/notificationModel.js'
import { sendConsentEmail } from './emailService.js'

const formatArray = (arr) => {
  const parsed = typeof arr === 'string' ? JSON.parse(arr) : arr
  return Array.isArray(parsed) ? parsed.join(', ') : parsed
}

export const getReferrerByCode = async (code) => {
  const result = await referralModel.getReferrerByCode(code).run()

  if (result.recordset.length === 0) {
    const err = new Error('Referrer not found')
    err.statusCode = 404
    throw err
  }

  return result.recordset[0]
}

export const getPlans = async () => {
  const result = await referralModel.getPlans().run()
  return result.recordset
}

export const createReferral = async (data) => {
  const result = await referralModel.createReferral(data).run()
  return result.recordset[0].Id
}

export const sendConsent = async (email, token) => {
  await referralModel.insertConsentRequest(email, token).run()
  await sendConsentEmail(email, token)
}

export const updateReferralProfiling = async (id, data) => {
  await referralModel.updateProfiling(id, {
    civilStatus: data.civilStatus,
    nationality: data.nationality,
    mobileNumber: data.mobileNumber,
    homeAddress: data.homeAddress,
    messengerName: data.messengerName,
    companyName: data.companyName,
    position: data.position,
    lengthOfService: data.lengthOfService,
    monthlyIncomeRange: data.monthlyIncomeRange,
    existingProducts: formatArray(data.existingProducts),
    monthlySavingsCapacity: data.monthlySavingsCapacity,
    interestedProducts: formatArray(data.interestedProducts),
    preferredCommunication: formatArray(data.preferredCommunication),
    preferredSchedule: data.preferredSchedule
  }).run()
}

export const confirmConsentRequest = async (token) => {
  await referralModel.confirmConsentRequest(token).run()
}

export const checkConsent = async (email) => {
  const result = await referralModel.checkConsent(email).run()
  return result.recordset.length > 0 ? result.recordset[0].Status : 'PENDING'
}

export const getReferralsByRole = async (user) => {
  const result = await referralModel.getReferralsByRole(user).run()
  return result.recordset
}

export const updateReferralStatus = async (id, status) => {
  const refCheck = await referralModel.getReferralContactInfo(id).run()

  if (refCheck.recordset.length === 0) {
    const err = new Error('Referral tracking record not found.')
    err.statusCode = 404
    throw err
  }

  const referral = refCheck.recordset[0]

  await referralModel.updateStatus(id, status).run()

  const alertMsg = `Your referral for ${referral.FirstName} ${referral.LastName} has been updated to "${status}".`
  await notificationModel.insert(referral.ReferrerCode, alertMsg).run()
}

export const getReferralById = async (id) => {
  const result = await referralModel.getReferralById(id).run()

  if (!result.recordset || result.recordset.length === 0) {
    const err = new Error('Referral not found')
    err.statusCode = 404
    throw err
  }

  return result.recordset[0]
}
