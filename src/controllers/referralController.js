import { v4 as uuidv4 } from 'uuid'
import * as notificationService from '../services/notificationService.js'
import * as referralService from '../services/referralService.js'
import { isValidGuid } from '../utils/validators.js'
import { consentConfirmedTemplate } from '../templates/consentConfirmedTemplate.js'
import { consentInvalidTemplate } from '../templates/consentInvalidTemplate.js'

// GET REFERRER INFO BY CODE (AUTO-FILL)
export const getReferrerByCode = async (req, res) => {
  try {
    const { code } = req.params
    const data = await referralService.getReferrerByCode(code)

    res.status(200).json({
      success: true,
      data
    })

  } catch (error) {
    console.error('❌ Get Referrer Error:', error)

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Server error'
    })
  }
}
// GET ALL PLANS
export const getPlans = async (req, res) => {
  try {
    const data = await referralService.getPlans()

    res.status(200).json({
      success: true,
      data
    })

  } catch (error) {
    console.error('❌ Get Plans Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans'
    })
  }
}
// CREATE REFERRAL (INSERT VIA SP)
export const createReferral = async (req, res) => {
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
        referrerCode,
        referrerName,
        branchCode,
        branchName,
        areaCode,
        areaName,
        status,
        statusDate,
        aoName,
        aoCode
    } = req.body

    const id = await referralService.createReferral({
      firstName, lastName, middleName, suffix, birthdate, occupation, email,
      planId, referrerCode, referrerName, branchCode, branchName, areaCode,
      areaName, status, statusDate, aoName, aoCode
    })

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('❌ Insert Referral Error:', error)

    res.status(500).json({
      success: false,
      message: 'Database error'
    })
  }
}
// SEND CONSENT
export const sendConsent = async (req, res) => {
    try {
          const { email } = req.body
          const token = uuidv4()

          await referralService.sendConsent(email, token)

          res.status(200).json({
            success: true,
            message: 'Consent email sent',
            token
          })
        }
          catch (error)
            {
          console.error('❌ Send Consent Error:', error)

      res.status(500).json
            ({
              success: false,
              message: 'Failed to send consent email'
            })
            }
}
// UPDATE REFERRAL PROFILING
export const updateReferralProfiling = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    await referralService.updateReferralProfiling(id, data);

    res.status(200).json({
      success: true,
      message: 'Profiling updated successfully'
    });

  } catch (error) {
    console.error('❌ Update Profiling Error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error: ' + error.message
    });
  }
};
// CONFIRM CONSENT
export const confirmConsent = async (req, res) => {
  try {
    const { token } = req.query

    await referralService.confirmConsentRequest(token)

    res.send(consentConfirmedTemplate())

  } catch (error) {
    console.error('❌ Confirm Consent Error:', error)

    res.status(400).send(consentInvalidTemplate())
  }
}
// CHECK CONSENT STATUS
export const checkConsent = async (req, res) => {
  try {
    const { email } = req.query

    const status = await referralService.checkConsent(email)

    res.json({ status })

  } catch (error) {
    console.error('❌ Check Consent Error:', error)

    res.status(500).json({
      status: 'ERROR'
    })
  }
}
// DASHBOARD REFERRALS
export const getReferrals = async (req, res) => {
  try {
    const { user } = req.body;

    const data = await referralService.getReferralsByRole(user);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Get Referrals Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referrals' });
  }
};

// UPDATE REFERRAL STATUS FROM DASHBOARD
export const updateReferralStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ Validate that the incoming id parameter is structurally a valid 36-character GUID
    if (!id || !isValidGuid(id)) {
      console.warn(`⚠️ Blocked status update attempt due to invalid GUID format: "${id}"`);
      return res.status(400).json({
        success: false,
        message: 'Invalid referral ID format supplied.'
      });
    }

    await referralService.updateReferralStatus(id.trim(), status);

    return res.json({
      success: true,
      message: 'Status updated and staff notified successfully.'
    });

  } catch (error) {
    console.error('❌ Update Status Controller Error:', error);

    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error processing update action state.',
      error: error.message
    });
  }
};

// FETCH NOTIFICATIONS FOR LOGGED IN USER

export const getUserNotifications = async (req, res) => {
  try {
    const { userCode } = req.query;
    const result = await notificationService.getUserNotifications(userCode);
    return res.json(result);
  } catch (error) {
    console.error('❌ SQL Query Crash Details:', error);
    return res.status(500).json({
      success: false,
      message: 'Server database error fetching notifications.',
      error: error.message
    });
  }
};

// =========================================================================
// ✅ CLEAR ALL NOTIFICATIONS FOR A USER
// =========================================================================
export const clearUserNotifications = async (req, res) => {
  try {
    const { userCode } = req.body;
    const result = await notificationService.clearUserNotifications(userCode);
    return res.json(result);
  } catch (error) {
    console.error('❌ Clear notifications failed:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Server error trying to clear notifications.'
    });
  }
};

// =========================================================================
// ✅ MARK A SINGLE NOTIFICATION AS READ
// =========================================================================
export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params; // Expects Notification ID
    const result = await notificationService.markNotificationAsRead(id);
    return res.json(result);
  } catch (error) {
    console.error('❌ Mark notification read failed:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Server database update error.'
    });
  }
};

// =========================================================================
// ✅ MARK ALL NOTIFICATIONS FOR A USER AS READ
// =========================================================================
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const { userCode } = req.body;
    const result = await notificationService.markAllNotificationsAsRead(userCode);
    return res.json(result);
  } catch (error) {
    console.error('❌ Mark all notifications read failed:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Server error marking all as read.'
    });
  }
};

// GET REFERRAL BY ID
export const getReferralById = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Safe Check: Verifies if the incoming string matches a valid 36-character GUID pattern
    if (!id || !isValidGuid(id)) {
      console.warn(`⚠️ Blocked an invalid lookup attempt with ID format: "${id}"`);
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing unique identifier format'
      });
    }

    const data = await referralService.getReferralById(id.trim());

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error('❌ Get Referral By ID Error:', error);

    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch referral'
    });
  }
};


// UPLOAD IMAGE CONSENT
export const uploadConsent = async (req, res) => {
  try {
    console.log('Upload hit')

    const file = req.file
    const email = req.body.email

    if (!file) {
      return res.json({ success: false, message: 'No file uploaded' })
    }

    res.json({
      success: true,
      message: 'Uploaded successfully'
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false })
  }
}
