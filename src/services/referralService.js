import * as referralModel from "../models/referralModel.js";
import * as notificationModel from "../models/notificationModel.js";
import { sendConsentEmail } from "./emailService.js";
import { getTenant } from "../utils/tenant.js";
import * as userModel from "../models/userModel.js";
import { throwHttpError } from "../utils/error.js";
import { validStatus } from "../utils/constant.js";

const formatArray = (arr) => {
  const parsed = typeof arr === "string" ? JSON.parse(arr) : arr;
  return Array.isArray(parsed) ? parsed.join(", ") : parsed;
};

export const getReferrerByCode = async (code) => {
  const result = await referralModel.getReferrerByCode(code).run();

  if (result.recordset.length === 0) {
    throwHttpError(404, "Referrer not found")
  }

  const referrer = result.recordset[0];

  // Diagnostic logging to help trace missing BranchName issues
  console.log('referralService.getReferrerByCode - incoming code:', code);
  console.log('referralService.getReferrerByCode - initial referrer record:', JSON.stringify(referrer));

  const branchName = referrer?.BranchName;
  const branchCode = referrer?.BranchCode;
  const hasMissingBranchName = !branchName || ["N/A", "NA", "NULL", "null"].includes(String(branchName).trim());

  if (hasMissingBranchName && branchCode) {
    console.log('referralService.getReferrerByCode - BranchName missing; looking up by BranchCode:', branchCode);
    const branchResult = await userModel.getBranchNameByCode(branchCode).run();
    console.log('referralService.getReferrerByCode - branch lookup recordset:', JSON.stringify(branchResult.recordset));
    const matchedBranch = branchResult.recordset?.[0];

    if (matchedBranch?.BranchName) {
      referrer.BranchName = matchedBranch.BranchName;
      console.log('referralService.getReferrerByCode - resolved BranchName:', matchedBranch.BranchName);
    }
  }

  console.log('referralService.getReferrerByCode - final referrer object returned:', JSON.stringify(referrer));
  return referrer;
};

export const getPlans = async () => {
  const result = await referralModel.getPlans().run();
  return result.recordset;
};

export const createReferral = async (data, user) => {

  const userAttribution = await referralModel.getReferrerAttribution(user.UserCode).run();
  if(userAttribution.recordset.length === 0) throwHttpError(400, 'Your account is not assigned to a branch. Please contact your administrator.');

  const authAttribution = userAttribution.recordset[0]

  const tenantPrefix = getTenant(user.UserCode);

  const findDuplicateExistingReferral = await referralModel
    .findActiveDuplicate(data.email, tenantPrefix)
    .run();

  if (findDuplicateExistingReferral.recordset.length > 0) {
    throwHttpError(409, "An active referral already exists for this client", findDuplicateExistingReferral.recordset[0]);
  }

  const referralData = {
    ...data,
    referrerCode: authAttribution.ReferrerCode,
    referrerName: authAttribution.ReferrerName,
    branchCode: authAttribution.BranchCode,
    branchName: authAttribution.BranchName,
    areaCode: authAttribution.AreaCode,
    areaName: authAttribution.AreaName,
    aoCode: authAttribution.AOCode,
    aoName: authAttribution.AOName,
  }

  const result = await referralModel.createReferral(referralData).run();

  if (user.Role === "BRANCH_STAFF") {
    const branchHeads = await userModel
      .getBranchHeadByBranch(authAttribution.BranchCode)
      .run();

    if (branchHeads.recordset.length > 0) {
      try {
        const message = `New referral submitted: ${data.firstName} ${data.lastName} by ${authAttribution.ReferrerName}`;
        for (let branchHead of branchHeads.recordset) {
          await notificationModel.insert(branchHead.UserCode, message).run();
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (authAttribution.AOCode) {
    try {
      const accountOfficer = await userModel.getAccountOfficerByCode(authAttribution.AOCode).run();
      if (accountOfficer.recordset.length > 0) {
        const aoMessage = `New referral assigned to you: ${data.firstName} ${data.lastName}, referred by ${authAttribution.ReferrerName}.`;
        for (const officer of accountOfficer.recordset) {
          await notificationModel.insert(officer.UserCode, aoMessage).run();
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  return result.recordset[0];
};

export const sendConsent = async (email, token) => {
  await referralModel.insertConsentRequest(email, token).run();
  await sendConsentEmail(email, token);
};

export const updateReferralProfiling = async (id, data) => {
  await referralModel
    .updateProfiling(id, {
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
      preferredSchedule: data.preferredSchedule,
    })
    .run();
};

export const confirmConsentRequest = async (token) => {
  await referralModel.confirmConsentRequest(token).run();
};

export const checkConsent = async (email) => {
  const result = await referralModel.checkConsent(email).run();
  return result.recordset.length > 0 ? result.recordset[0].Status : "PENDING";
};

export const getReferralsByRole = async (user) => {
  const result = await referralModel.getReferralsByRole(user).run();
  return result.recordset.map(({ ConsentToken, ...rest }) => rest);
};

export const updateReferralStatus = async (id, status) => {

  if(!validStatus.includes(status)) throwHttpError(400, 'Invalid status value')
  const refCheck = await referralModel.getReferralContactInfo(id).run();

  if (refCheck.recordset.length === 0) {
    throwHttpError(404, "Referral tracking record not found.");
  }

  const referral = refCheck.recordset[0];

  await referralModel.updateStatus(id, status).run();

  const alertMsg = `Your referral for ${referral.FirstName} ${referral.LastName} has been updated to "${status}".`;
  await notificationModel.insert(referral.ReferrerCode, alertMsg).run();

  try {
    const branchHeads = await userModel.getBranchHeadByBranch(referral.BranchCode).run();
    if (branchHeads.recordset.length > 0) {
      const branchHeadMsg = `Referral for ${referral.FirstName} ${referral.LastName} has been updated to "${status}".`;
      for (const branchHead of branchHeads.recordset) {
        if (branchHead.UserCode === referral.ReferrerCode) continue;
        await notificationModel.insert(branchHead.UserCode, branchHeadMsg).run();
      }
    }
  } catch (error) {
    console.error(error);
  }
};

export const getReferralById = async (id) => {
  const result = await referralModel.getReferralById(id).run();

  if (!result.recordset || result.recordset.length === 0) {
    throwHttpError(404, "Referral not found");
  }

  const { ConsentToken, ...rest } = result.recordset[0];
  return rest
};

export const uploadConsent = async (email, filePath) => {
  const result = await referralModel.uploadConsentFile(email, filePath).run();

  if(result.rowsAffected[0] === 0) {
    throwHttpError(404, 'No pending consent request found for this email')
  }

  return {
    success: true,
    message: 'Consent file uploaded successfully'
  };
}
