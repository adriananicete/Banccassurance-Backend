import { v4 as uuidv4 } from "uuid";
import * as referralService from "../services/referralService.js";
import { isValidGuid } from "../utils/validators.js";
import { consentConfirmedTemplate } from "../templates/consentConfirmedTemplate.js";
import { consentInvalidTemplate } from "../templates/consentInvalidTemplate.js";

// GET REFERRER INFO BY CODE (AUTO-FILL)
export const getReferrerByCode = async (req, res, next) => {
  try {
    
    const data = await referralService.getReferrerByCode(req.user.UserCode);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlans = async (req, res, next) => {
  try {
    const data = await referralService.getPlans();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const createReferral = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      middleName,
      suffix,
      birthdate,
      occupation,
      email,
      planId,
    } = req.body;

    const referral = await referralService.createReferral({
      firstName,
      lastName,
      middleName,
      suffix,
      birthdate,
      occupation,
      email,
      planId,
    }, req.user);

    res.status(201).json({
      success: true,
      data: {
        id: referral.Id,
        referralNo: referral.ReferralNo,
      },
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        existing: error.data,
      });
    }
    next(error);
  }
};


export const sendConsent = async (req, res, next) => {
  try {
    const { email } = req.body;
    const token = uuidv4();

    await referralService.sendConsent(email, token);

    res.status(200).json({
      success: true,
      message: "Consent email sent",
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const updateReferralProfiling = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!id || !isValidGuid(id)) {
      console.warn(`Warning: Blocked profiling update attempt due to invalid GUID format: "${id}"`)
      return res.status(400).json({
        success: false,
        message: `Invalid referral ID format supplied.`,
      });
    }

    await referralService.updateReferralProfiling(id, data);

    res.status(200).json({
      success: true,
      message: "Profiling updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const confirmConsent = async (req, res) => {
  try {
    const { token } = req.query;

    await referralService.confirmConsentRequest(token);

    res.send(consentConfirmedTemplate());
  } catch (error) {
    console.error("❌ Confirm Consent Error:", error);

    res.status(400).send(consentInvalidTemplate());
  }
};

export const checkConsent = async (req, res, next) => {
  try {
    const { email } = req.query;

    const status = await referralService.checkConsent(email);

    res.json({ status });
  } catch (error) {
    next(error);
  }
};

export const getReferrals = async (req, res, next) => {
  try {
    const data = await referralService.getReferralsByRole(req.user);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};


export const updateReferralStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ Validate that the incoming id parameter is structurally a valid 36-character GUID
    if (!id || !isValidGuid(id)) {
      console.warn(
        `⚠️ Blocked status update attempt due to invalid GUID format: "${id}"`,
      );
      return res.status(400).json({
        success: false,
        message: "Invalid referral ID format supplied.",
      });
    }

    await referralService.updateReferralStatus(id.trim(), status);

    return res.json({
      success: true,
      message: "Status updated and staff notified successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const getReferralById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ✅ Safe Check: Verifies if the incoming string matches a valid 36-character GUID pattern
    if (!id || !isValidGuid(id)) {
      console.warn(
        `⚠️ Blocked an invalid lookup attempt with ID format: "${id}"`,
      );
      return res.status(400).json({
        success: false,
        message: "Invalid or missing unique identifier format",
      });
    }

    const data = await referralService.getReferralById(id.trim());

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// UPLOAD IMAGE CONSENT
export const uploadConsent = async (req, res, next) => {
  try {

    const { email } = req.body;
    const file = req.file;

    if(!email) return res.status(400).json({
      success: false,
      message: 'Email is required'
    })

    if (!file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const filePath = file.filename

    const result = await referralService.uploadConsent(email, filePath)

    return res.json(result);
  } catch (error) {
    next(error);
  }
};
