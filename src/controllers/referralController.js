import sql from '../config/db.js'
import { sendConsentEmail } from '../services/emailService.js'
import { v4 as uuidv4 } from 'uuid'


// GET REFERRER INFO BY CODE (AUTO-FILL)
export const getReferrerByCode = async (req, res) => {
  try {
    const { code } = req.params

    const request = new sql.Request()
    request.input('UserCode', sql.NVarChar, code)

    const result = await request.execute('[banc].[usp_sel_referrer_by_code]')

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Referrer not found'
      })
    }

    res.status(200).json({
      success: true,
      data: result.recordset[0]
    })

  } catch (error) {
    console.error('❌ Get Referrer Error:', error)

    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
}
//GET ALL PLANS
export const getPlans = async (req, res) => {
  try {
    const result = await new sql.Request().execute('[banc].[usp_sel_plans]')

    res.status(200).json({
      success: true,
      data: result.recordset
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

    const request = new sql.Request()

    request.input('FirstName', sql.NVarChar, firstName)
    request.input('LastName', sql.NVarChar, lastName)
    request.input('MiddleName', sql.NVarChar, middleName)
    request.input('Suffix', sql.NVarChar, suffix)
    request.input('Birthdate', sql.Date, birthdate)
    request.input('Occupation', sql.NVarChar, occupation)
    request.input('Email', sql.NVarChar, email)
    request.input('PlanId', sql.Int, planId)
    request.input('ReferrerCode', sql.NVarChar, referrerCode)
    request.input('ReferrerName', sql.NVarChar, referrerName)
    request.input('BranchCode', sql.NVarChar, branchCode)
    request.input('BranchName', sql.NVarChar, branchName)
    request.input('AreaCode', sql.NVarChar, areaCode)
    request.input('AreaName', sql.NVarChar, areaName)
    request.input('Status', sql.NVarChar, status)
    request.input('StatusDate', sql.Date, statusDate)
    request.input('AOName', sql.NVarChar, aoName)
    request.input('AOCode', sql.NVarChar, aoCode)


    const result = await request.execute('[banc].[usp_ins_referrals]')

    res.status(201).json({
      success: true,
      id: result.recordset[0].Id
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

          const request = new sql.Request()
          request.input('Email', sql.NVarChar, email)
          request.input('Token', sql.NVarChar, token)

          await request.execute('[banc].[usp_insert_consent_request]')
          await sendConsentEmail(email, token)

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
    const request = new sql.Request();

    request.input('Id', sql.UniqueIdentifier, id);

    const formatArray = (arr) => {
      const parsed = typeof arr === 'string' ? JSON.parse(arr) : arr;
      return Array.isArray(parsed) ? parsed.join(', ') : parsed;
    };

    request.input('CivilStatus', sql.NVarChar, data.civilStatus);
    request.input('Nationality', sql.NVarChar, data.nationality);
    request.input('MobileNumber', sql.NVarChar, data.mobileNumber);
    request.input('HomeAddress', sql.NVarChar, data.homeAddress);
    request.input('MessengerName', sql.NVarChar, data.messengerName);
    request.input('CompanyName', sql.NVarChar, data.companyName);
    request.input('Position', sql.NVarChar, data.position);
    request.input('LengthOfService', sql.NVarChar, data.lengthOfService);
    request.input('MonthlyIncomeRange', sql.NVarChar, data.monthlyIncomeRange);
    request.input('ExistingProducts', sql.NVarChar, formatArray(data.existingProducts));
    request.input('MonthlySavingsCapacity', sql.NVarChar, data.monthlySavingsCapacity);
    request.input('InterestedProducts', sql.NVarChar, formatArray(data.interestedProducts));
    request.input('PreferredCommunication', sql.NVarChar, formatArray(data.preferredCommunication));
    request.input('PreferredSchedule', sql.NVarChar, data.preferredSchedule);

    await request.execute('[banc].[usp_upd_referrals_profiling]');

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

    const request = new sql.Request()
    request.input('Token', sql.NVarChar, token)

    await request.execute('[banc].[usp_confirm_consent_request]')

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consent Confirmation</title>
          <link rel="icon" type="image/x-icon" href="/favicon.ico">
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f6f9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }

          .card {
            background: #ffffff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
          }

          .icon {
            font-size: 60px;
            color: #28a745;
            margin-bottom: 15px;
          }

          h2 {
            color: #333;
            margin-bottom: 10px;
          }

          p {
            color: #666;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>Consent Successfully Confirmed</h2>
          <p>
            Thank you for providing your consent.
            Your confirmation has been recorded successfully.
          </p>
          <p>
            You may now proceed with your application process.
          </p>
        </div>
      </body>
      </html>`)

  } catch (error) {
    console.error('❌ Confirm Consent Error:', error)

  res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consent Confirmation</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f6f9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }

          .card {
            background: #ffffff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
          }

          .icon {
            font-size: 60px;
            color: #dc3545;
            margin-bottom: 15px;
          }

          h2 {
            color: #333;
          }

          p {
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">❌</div>
          <h2>Invalid or Expired Link</h2>
          <p>
            The consent confirmation link is no longer valid or has already been used.
          </p>
          <p>
            Please contact your branch representative for assistance.
          </p>
        </div>
      </body>
      </html>`)
  }
}
// CHECK CONSENT STATUS
export const checkConsent = async (req, res) => {
  try {
    const { email } = req.query

    const request = new sql.Request()
    request.input('Email', sql.NVarChar, email)

    const result = await request.execute('[banc].[usp_check_consent]')

    const status =
      result.recordset.length > 0
        ? result.recordset[0].Status
        : 'PENDING'

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
    const { user } = req.body
    console.log('Incoming user:', req.body.user)
    const request = new sql.Request()

    request.input('Role', sql.NVarChar, user.Role)
    request.input('UserCode', sql.NVarChar, user.UserCode)
    request.input('BranchCode', sql.Int, user.BranchCode)
    request.input('AreaCode', sql.Int, user.AreaCode)

    const result = await request.execute('[banc].[usp_sel_referrals_by_role]')

    res.json({
      success: true,
      data: result.recordset
    })

  } catch (error) {
    console.error('❌ Get Referrals Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch referrals'
    })
  }
}
// UPDATE REFERRAL STATUS FROM DASHBOARD
export const updateReferralStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || id === 'undefined') {
        return res.status(400).json({ success: false, message: 'Invalid ID provided' });
    }

    const request = new sql.Request();
    // Use UniqueIdentifier for UUIDs
    request.input('Id', sql.UniqueIdentifier, id); 
    request.input('Status', sql.NVarChar, status);

    await request.execute('[banc].[usp_upd_referral_status]');

    res.json({ success: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error('❌ Update Status Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
// GET REFERRAL BY ID
export const getReferralById = async (req, res) => {
  try {
    const { id } = req.params;

    const request = new sql.Request();
    
    request.input('Id', sql.UniqueIdentifier, id); 

    const result = await request.execute('[banc].[usp_sel_referral_by_id]');

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Referral not found' });
    }

    res.status(200).json({
      success: true,
      data: result.recordset[0]
    });

  } catch (error) {
    console.error('Get Referral By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral'
    });
  }
}
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