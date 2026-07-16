import fetch from 'node-fetch'
import { consentEmailTemplate } from '../templates/consentEmailTemplate.js'
import { otpEmailTemplate } from '../templates/otpEmailTemplate.js'
import { welcomeEmailTemplate } from '../templates/welcomeEmailTemplate.js'
import { approvalEmailTemplate } from '../templates/approvalEmailTemplate.js'

// TODO: broad TLS-bypass for the whole process — kept as-is since it may be load-bearing
// for the Graph API calls in this network, but should be scoped to a dedicated
// https.Agent for just these requests instead of process-wide.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const TENANT_ID = process.env.GRAPH_TENANT_ID
const CLIENT_ID = process.env.GRAPH_CLIENT_ID
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET
const SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL

// ✅ Get token
const getAccessToken = async () => {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`

  const params = new URLSearchParams()
  params.append('client_id', CLIENT_ID)
  params.append('client_secret', CLIENT_SECRET)
  params.append('scope', 'https://graph.microsoft.com/.default')
  params.append('grant_type', 'client_credentials')

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })

  const data = await response.json()

  return data.access_token
}

// ✅ Send email
export const sendConsentEmail = async (toEmail, token) => {
  const accessToken = await getAccessToken()

  const confirmLink = `http://localhost:5000/api/referrals/confirm-consent?token=${token}`

  const emailBody = consentEmailTemplate(confirmLink)

  const mail = {
    message: {
      subject: 'Consent for Endorsement and Data Processing',
      body: {
        contentType: 'HTML',
        content: emailBody
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmail
          }
        }
      ]
    }
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mail)
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Email error:', error)
    throw new Error('Failed to send email')
  }

  console.log('✅ Email sent')
}

export const sendOtpEmail = async (toEmail, otp) => {
  const accessToken = await getAccessToken()

  const emailBody = otpEmailTemplate(otp);

  const mail = {
    message: {
      subject: 'Your OTP Code',
      body: {
        contentType: 'HTML',
        content: emailBody
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmail
          }
        }
      ]
    }
  };

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mail)
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('OTP Email error:', error)
    throw new Error('Failed to send OTP email')
  }

  console.log('✅ OTP Email sent to:', toEmail)
}

export const sendWelcomeEmail = async (toEmail, firstName, userCode, tempPassword) => {
  const accessToken = await getAccessToken();

  const emailBody = welcomeEmailTemplate(firstName, userCode, tempPassword);

  const mail = {
    message: {
      subject: 'Your Bancassurance Referral System Account',
      body: { contentType: 'HTML', content: emailBody },
      toRecipients: [{ emailAddress: { address: toEmail } }]
    }
  };

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mail)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Welcome Email error:', error);
    throw new Error('Failed to send welcome email');
  }

  console.log('✅ Welcome Email sent to:', toEmail);
};



export const sendApprovalEmail = async (toEmail, firstName, userCode, action) => {
  const accessToken = await getAccessToken();

  const isApproved = action === 'APPROVE';

  const emailBody = approvalEmailTemplate(firstName, userCode, isApproved);

  const mail = {
    message: {
      subject: `Your Registration has been ${isApproved ? 'Approved' : 'Rejected'} - Bancassurance Referral System`,
      body: { contentType: 'HTML', content: emailBody },
      toRecipients: [{ emailAddress: { address: toEmail } }]
    }
  };

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mail)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Approval Email error:', error);
    throw new Error('Failed to send approval email');
  }

  console.log(`✅ Approval Email (${action}) sent to:`, toEmail);
};