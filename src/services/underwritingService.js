import underwritingModel from "../models/underwritingModel.js";
import { underwritingTransitions } from "../utils/constant.js";
import * as referralModel from "../models/referralModel.js";
import { throwHttpError } from "../utils/error.js";
import { safeNotify } from "./notificationService.js";

const getUnderwritingReferrals = async (filters) => {
  const result = await underwritingModel
    .getUnderwritingReferrals(filters)
    .run();

  return result.recordset;
};

const updateUnderwritingStatus = async (id, status) => {
  const referral = await referralModel.getReferralContactInfo(id).run();
  if (referral.recordset.length === 0) throwHttpError(404, "Not Found");

  const ref = referral.recordset[0];

  const allowed = underwritingTransitions[ref.Status];

  if (!allowed)
    throwHttpError(
      400,
      `This referral is "${ref.Status}", which underwriting cannot act on. Retrying will not help.`,
    );

  if (!allowed.includes(status))
    throwHttpError(
      400,
      `"${ref.Status}" cannot move to "${status}". Allowed from here: ${allowed.join(", ") || "none"}.`,
    );

  await referralModel.updateStatus(id, status).run();
  
  const message = `Your referral for ${ref.FirstName} ${ref.LastName} has been ${status}.`;

  if (ref.ReferrerCode !== ref.AOCode) {
    await safeNotify(ref.ReferrerCode, message);
    await safeNotify(ref.AOCode, message)
  } else {
    await safeNotify(ref.ReferrerCode, message)
  }
};

export default {
  getUnderwritingReferrals,
  updateUnderwritingStatus,
};
