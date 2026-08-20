import * as referralService from "../services/referralService.js";
import { isValidGuid } from "../utils/validators.js";
import { sortDirections, sortWhitelist } from "../utils/constant.js";

// GET REFERRER INFO BY CODE (AUTO-FILL)
export const getReferrerByCode = async (req, res, next) => {
  try {
    
    const data = await referralService.getReferrerByCode(req.user);

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

    await referralService.updateReferralProfiling(id, data, req.user);

    res.status(200).json({
      success: true,
      message: "Profiling updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getReferrals = async (req, res, next) => {
  try {
    let { page, pageSize, search, status, verified, dateFrom, dateTo, sortBy, sortDir } = req.query;

    page = parseInt(page, 10);
    if(isNaN(page) || page < 1) page = 1;

    pageSize = parseInt(pageSize, 10)
    if(isNaN(pageSize) || pageSize < 1) pageSize = 20;

    if(pageSize > 100) pageSize = 100

    if(verified === 'verified') {
      verified = 1;
    } else if(verified === 'not-verified') {
      verified = 0;
    } else {
      verified = null;
    };

    sortDir = sortDir?.toUpperCase();

    const options = {
      PageNumber: page,
      PageSize: pageSize,
      Search: search || null,
      Status: status || null,
      Verified: verified,
      DateFrom: !isNaN(Date.parse(dateFrom)) ? dateFrom : null,
      DateTo: !isNaN(Date.parse(dateTo)) ? dateTo : null,
      SortBy: sortWhitelist.includes(sortBy) ? sortBy : null,
      SortDir: sortDirections.includes(sortDir) ? sortDir : "DESC"
    }
    
    const data = await referralService.getReferralsByRole(req.user, options);

    res.json({
      success: true,
      ...data,
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

    await referralService.updateReferralStatus(id.trim(), status, req.user);

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

    const data = await referralService.getReferralById(id.trim(), req.user);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getReferralCounts = async (req, res, next) => {
  try {
    const result = await referralService.getReferralCounts(req.user);

    res.json({
      success: true, ...result
    })
  } catch (error) {
    next(error);
  }
}