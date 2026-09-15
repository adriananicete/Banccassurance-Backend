import * as referralModel from "../models/referralModel.js";
import { sendConsentEmail } from "./emailService.js";
import { getTenant } from "../utils/tenant.js";
import * as userModel from "../models/userModel.js";
import { throwHttpError } from "../utils/error.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  referralCreatorRoles,
  SECTOR_HEAD,
  statusTransitions,
  SUPERSEDED,
  validConsentStatus,
  validStatus,
} from "../utils/constant.js";
import { safeNotify } from "./notificationService.js";
import { isValidEmail, isValidGuid } from "../utils/validators.js";

const formatArray = (arr) => {
  const parsed = typeof arr === "string" ? JSON.parse(arr) : arr;
  return Array.isArray(parsed) ? parsed.join(", ") : parsed;
};

export const getReferrerByCode = async (user) => {
  if (user.Role === ACCOUNT_OFFICER) {
    const aoResult = await referralModel.getAOAttribution(user.UserCode).run();

    if (aoResult.recordset.length === 0) {
      throwHttpError(400, "Your account has no assigned branches");
    }

    const ao = aoResult.recordset[0];

    return {
      ReferrerCode: user.UserCode,
      ReferrerName: ao.ReferrerName,
      AOCode: user.UserCode,
      AOName: ao.ReferrerName,
      BranchCode: null,
      BranchName: null,
      GroupCode: ao.GroupCode,
      GroupName: ao.GroupName,
    };
  }

  const result = await referralModel.getReferrerAttribution(user.UserCode).run();

  if (result.recordset.length === 0) {
    throwHttpError(404, "Referrer not found");
  }

  const referrer = result.recordset[0];

  return referrer;
};

export const getPlans = async () => {
  const result = await referralModel.getPlans().run();
  return result.recordset;
};

export const createReferral = async (data, user) => {
  if (!referralCreatorRoles.includes(user.Role))
    throwHttpError(
      403,
      "Your role cannot create referrals. Only Branch Staff, Branch Heads, and Account Officers can.",
    );

  const consent = await checkConsent(data.email)
  if(!validConsentStatus.includes(consent)) throwHttpError(403, 'Client consent is required before this referral can be submitted. Ask the client to confirm the consent email, or upload a signed consent form.')
  if (user.Role === BRANCH_STAFF || user.Role === BRANCH_HEAD) {
    const userAttribution = await referralModel
      .getReferrerAttribution(user.UserCode)
      .run();
    if (userAttribution.recordset.length === 0)
      throwHttpError(
        400,
        "Your account is not assigned to a branch. Please contact your administrator.",
      );

    const authAttribution = userAttribution.recordset[0];

    if (authAttribution.AOCode === null)
      throwHttpError(
        400,
        "Your account has no assigned Account Officer. Please contact your administrator.",
      );

    const tenantPrefix = getTenant(user.UserCode);

    const findDuplicateExistingReferral = await referralModel
      .findActiveDuplicate(data.email, tenantPrefix, data.planId)
      .run();

    if (findDuplicateExistingReferral.recordset.length > 0) {
      throwHttpError(
        409,
        "An active referral already exists for this client",
        findDuplicateExistingReferral.recordset[0],
      );
    }

    const referralData = {
      ...data,
      referrerCode: authAttribution.ReferrerCode,
      referrerName: authAttribution.ReferrerName,
      branchCode: authAttribution.BranchCode,
      branchName: authAttribution.BranchName,
      groupCode: authAttribution.GroupCode,
      groupName: authAttribution.GroupName,
      aoCode: authAttribution.AOCode,
      aoName: authAttribution.AOName,
    };

    const result = await referralModel.createReferral(referralData).run();

    if (user.Role === "BRANCH_STAFF") {
      try {
        const branchHeads = await userModel
        .getBranchHeadByBranch(authAttribution.BranchCode)
        .run();

      if (branchHeads.recordset.length > 0) {
        const message = `New referral submitted: ${data.firstName} ${data.lastName} by ${authAttribution.ReferrerName}`;
          for (let branchHead of branchHeads.recordset) {
            await safeNotify(branchHead.UserCode, message)
          }
      }
      } catch (error) {
        console.error(error)
      }
    }

    if (authAttribution.AOCode) {
      try {
        const accountOfficer = await userModel
          .getAccountOfficerByCode(authAttribution.AOCode)
          .run();
        if (accountOfficer.recordset.length > 0) {
          const aoMessage = `New referral assigned to you: ${data.firstName} ${data.lastName}, referred by ${authAttribution.ReferrerName}.`;
          for (const officer of accountOfficer.recordset) {
            await safeNotify(officer.UserCode, aoMessage)
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    return result.recordset[0];
  } else if (user.Role === ACCOUNT_OFFICER) {
    const aoAttribution = await referralModel
      .getAOAttribution(user.UserCode)
      .run();

    if (aoAttribution.recordset.length === 0)
      throwHttpError(400, "Your account has no assigned branches");

    const aoData = aoAttribution.recordset[0];
    const tenantPrefix = getTenant(user.UserCode);

    const findDuplicateExistingReferral = await referralModel
      .findActiveDuplicate(data.email, tenantPrefix, data.planId)
      .run();
    if (findDuplicateExistingReferral.recordset.length > 0)
      throwHttpError(
        409,
        "An active referral already exists for this client",
        findDuplicateExistingReferral.recordset[0],
      );

    const referralData = {
      ...data,
      referrerCode: user.UserCode,
      referrerName: aoData.ReferrerName,
      aoCode: user.UserCode,
      aoName: aoData.ReferrerName,
      branchCode: null,
      branchName: null,
      groupCode: aoData.GroupCode,
      groupName: aoData.GroupName,
    };

    const result = await referralModel.createReferral(referralData).run();

    try {
      const areaSalesHeads = await userModel
        .getAreaSalesHeadByArea(aoData.GroupCode)
        .run();

      if (areaSalesHeads.recordset.length > 0) {
        const message = `New referral assigned to you: ${data.firstName} ${data.lastName}, referred by ${aoData.ReferrerName}.`;
        for (const areaSalesHead of areaSalesHeads.recordset) {
          await safeNotify(areaSalesHead.UserCode, message)
        }
      }
    } catch (error) {
      console.error(error);
    }

    return result.recordset[0];
  } else {
    throwHttpError(500, "No referral path is defined for this role.");
  }
};

const resolveConsentIdentity = async (user) => {
  const referrerName = user?.FullName ?? null;

  if (user?.BranchCode == null) return { referrerName, branchName: null };

  const branch = await userModel.getBranchScope(user.BranchCode).run();

  return { referrerName, branchName: branch.recordset[0]?.BranchName ?? null };
};

export const sendConsent = async (email, token, name, fullName, user) => {
  if(!email || !isValidEmail(email)) throwHttpError(400, 'Invalid Email')

  const existing = await checkConsent(email);

  if (validConsentStatus.includes(existing))
    throwHttpError(
      409,
      `This client has already given consent. Create the referral instead — sending another request would cancel the consent you already have.`,
    );

  const { referrerName, branchName } = await resolveConsentIdentity(user);

  await referralModel.insertConsentRequest(email, token).run();
  await sendConsentEmail(email, token, name, branchName, referrerName, fullName);
};

export const updateReferralProfiling = async (id, data, user) => {
  const found = await referralModel.getReferralContactInfo(id).run();

  if (found.recordset.length === 0) throwHttpError(404, "Not Found");

  const referral = found.recordset[0];
  const holder =
    user.Role === ACCOUNT_OFFICER ? referral.AOCode : referral.ReferrerCode;

  if (holder !== user.UserCode) throwHttpError(403, "Forbidden");

  await referralModel
    .updateProfiling(id, {
      civilStatus: data.civilStatus,
      nationality: data.nationality,
      mobileNumber: data.mobileNumber,
      homeAddress: data.homeAddress,
      messengerName: data.messengerName,
      companyName: data.companyName,
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

export const validateConsentToken = async (token) => {
  if(!token || !isValidGuid(token)) throwHttpError(404, 'Invalid consent token')

  const consentToken = await referralModel.getConsentRequestByToken(token).run();
  if(consentToken.recordset.length === 0) throwHttpError(404, 'Token not found');

  return consentToken.recordset[0];
}

export const confirmConsentRequest = async (token) => {
  if(!token || !isValidGuid(token)) throwHttpError(404, 'Invalid consent token')

  const confirmConsent = await referralModel.confirmConsentRequest(token).run();
  if(confirmConsent.rowsAffected[0] > 0) return;

  const existing = await validateConsentToken(token);

  if(existing.Status === SUPERSEDED)
    throwHttpError(410, 'This consent request was replaced by a newer one.')

  if(!validConsentStatus.includes(existing.Status))
    throwHttpError(404, `This consent request is ${existing.Status} and cannot be confirmed.`)
};

export const checkConsent = async (email) => {
  if (!email || !isValidEmail(email)) throwHttpError(400, 'Invalid Email')

  const result = await referralModel.checkConsent(email).run();
  if (result.recordset.length === 0) return "PENDING";

  const status = result.recordset[0].Status;
  return status === SUPERSEDED ? "PENDING" : status;
};

export const getReferralsByRole = async (user, pagination) => {
  const result = await referralModel.getReferralsByRole(user, pagination).run();

  const totalCount = result.recordset[0]?.TotalCount ?? 0;
  const rows = result.recordset.map(({ ConsentToken, TotalCount, ...rest }) => rest);

  return {
    data: rows,
    pagination: {
      page: pagination.PageNumber,
      pageSize: pagination.PageSize,
      totalCount: totalCount,
      totalPages: Math.ceil(totalCount / pagination.PageSize)
    }
  }
};

export const getReferralCounts = async (user) => {
  const result = await referralModel.getReferralCountsByRole(user).run();
  const counts = result.recordset;
  const total = counts.reduce((acc, cur) => acc + cur.Total, 0);

  return {
    data: counts,
    total: total
  }
};

export const updateReferralStatus = async (id, status, user) => {
  if (!validStatus.includes(status))
    throwHttpError(400, "Invalid status value");
  const refCheck = await referralModel.getReferralContactInfo(id).run();

  if (refCheck.recordset.length === 0) {
    throwHttpError(404, "Referral tracking record not found.");
  }

  const referral = refCheck.recordset[0];
  if (referral.AOCode !== user.UserCode) throwHttpError(403, "Forbidden");

  const allowedStatus = statusTransitions[referral.Status];
  if (!allowedStatus)
    throwHttpError(
      400,
      `This referral has an unrecognized status (${referral.Status}) and cannot be updated. Please contact support.`,
    );

  if (allowedStatus.length === 0)
    throwHttpError(400, `Status cannot be changed from ${referral.Status}`);
  if (!allowedStatus.includes(status))
    throwHttpError(
      400,
      `Cannot transition from ${referral.Status} to ${status}`,
    );

  await referralModel.updateStatus(id, status).run();

  const alertMsg = `Your referral for ${referral.FirstName} ${referral.LastName} has been updated to "${status}".`;
  await safeNotify(referral.ReferrerCode, alertMsg)

  try {
    const branchHeads = await userModel
      .getBranchHeadByBranch(referral.BranchCode)
      .run();
    if (branchHeads.recordset.length > 0) {
      const branchHeadMsg = `Referral for ${referral.FirstName} ${referral.LastName} has been updated to "${status}".`;
      for (const branchHead of branchHeads.recordset) {
        if (branchHead.UserCode === referral.ReferrerCode) continue;
          await safeNotify(branchHead.UserCode, branchHeadMsg)
      }
    }
  } catch (error) {
    console.error(error);
  }
};

export const getReferralById = async (id, user) => {
  const result = await referralModel.getReferralById(id).run();

  if (!result.recordset || result.recordset.length === 0) {
    throwHttpError(404, "Referral not found");
  }

  const { ConsentToken, ...rest } = result.recordset[0];

  const isAllowed = await canAccessReferral(rest, user);
  if (!isAllowed) throwHttpError(403, "Forbidden");
  return rest;
};

export const deleteReferral = async (id, user) => {
  if (process.env.NODE_ENV === "production")
    throwHttpError(
      403,
      "Referrals cannot be deleted in production. A referral is a client record.",
    );

  const found = await referralModel.getReferralForDeletion(id).run();

  if (!found.recordset || found.recordset.length === 0)
    throwHttpError(404, "Referral not found");

  const referral = found.recordset[0];

  if (referral.ReferrerCode !== user.UserCode)
    throwHttpError(403, "You can only delete a referral you created.");

  await referralModel
    .deleteReferral(id, {
      actorUserCode: user.UserCode,
      action: "REFERRAL_DELETED",
      entityType: "REFERRAL",
      entityId: referral.ReferralNo,
      detail: referral.Status,
    })
    .run();

  return {
    success: true,
    message: "Referral deleted.",
    referralNo: referral.ReferralNo,
  };
};

export const uploadConsent = async (email, filePath) => {
  const result = await referralModel.uploadConsentFile(email, filePath).run();

  if (result.rowsAffected[0] === 0) {
    throwHttpError(404, "No pending consent request found for this email");
  }

  return {
    success: true,
    message: "Consent file uploaded successfully",
  };
};

export const canAccessReferral = async (referral, user) => {
  if (user.Role === BRANCH_STAFF) {
    if (referral.ReferrerCode === user.UserCode) return true;
  } else if (user.Role === BRANCH_HEAD) {
    if (referral.BranchCode === user.BranchCode) return true;
  } else if (user.Role === ACCOUNT_OFFICER) {
    if (referral.AOCode === user.UserCode) return true;
  } else if (user.Role === GROUP_HEAD) {
    if (String(referral.GroupCode) === String(user.GroupCode)) return true;
  } else if (user.Role === AREA_SALES_HEAD) {
    const areaSalesHead = await userModel
      .isAreaInAreaSalesHeadScope(user.UserCode, referral.GroupCode)
      .run();

    return areaSalesHead.recordset.length > 0;
  } else if (user.Role === SECTOR_HEAD) {
    const referralTenant =
      referral.ReferrerCode?.toUpperCase().split("-")[0] ?? null;
    return referralTenant !== null && referralTenant === getTenant(user.UserCode);
  } else if (user.Role === DEPARTMENT_HEAD) {
    const referralTenant =
      referral.AOCode?.toUpperCase().split("-")[0] ?? null;
    return referralTenant !== null && referralTenant === getTenant(user.UserCode);
  } else if (user.Role === REGIONAL_SALES_HEAD) {
    const regionalSalesHead = await userModel
      .isAreaInRegionalScope(user.UserCode, referral.GroupCode)
      .run();

    return regionalSalesHead.recordset.length > 0;
  } else {
    return false;
  }
};
