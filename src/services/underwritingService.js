import underwritingModel from "../models/underwritingModel.js";
import { underwritingTransitions } from "../utils/constant.js";
import * as referralModel from "../models/referralModel.js";
import * as notificationModel from "../models/notificationModel.js";
import { throwHttpError } from "../utils/error.js";

const getClosedPendingReferrals = async (filters) => {
  const result = await underwritingModel
    .getClosedPendingReferrals(filters)
    .run();

  return result.recordset;
};

const updateUnderwritingStatus = async (id, status) => {
  const referral = await referralModel.getReferralContactInfo(id).run();
  if (referral.recordset.length === 0) throwHttpError(404, "Not Found");

  const ref = referral.recordset[0];

  const allowed = underwritingTransitions[ref.Status];
  if (!allowed || !allowed.includes(status)) throwHttpError(400, "Invalid Status");

  await referralModel.updateStatus(id, status).run();
  
  const message = `Your referral for ${ref.FirstName} ${ref.LastName} has been ${status}.`;

  if (ref.ReferrerCode !== ref.AOCode) {
    await notificationModel.insert(ref.ReferrerCode, message).run();
    await notificationModel.insert(ref.AOCode, message).run();
  } else {
    await notificationModel.insert(ref.ReferrerCode, message).run();
  }
};

export default {
  getClosedPendingReferrals,
  updateUnderwritingStatus,
};
