import fetch from 'node-fetch'

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

  const emailBody = `
    <p><strong>Dear Valued Client,</strong></p>

    <p>Good day!</p>

    <p>
      As part of our financial needs assessment and product presentation process, 
      we kindly request your consent to allow <strong>PHILLIFE</strong> and its 
      authorized representatives to process your information for account servicing 
      and endorsement to the assigned Account Officer at your Landbank servicing branch.
    </p>

    <p>
      By providing your consent, you authorize the company and its authorized 
      representatives to collect, process, store, and use your information for the following purposes:
    </p>

    <ol>
      <li>Evaluation of your financial and insurance needs</li>
      <li>Product presentation and proposal preparation</li>
      <li>Account servicing and client support</li>
      <li>Policy processing and future claims evaluation</li>
      <li>Communication regarding products, services, and updates</li>
    </ol>

    <p>
      Please be assured that your information will be handled in accordance 
      with the <strong>Data Privacy Act of 2012</strong> and the company’s 
      policies on confidentiality and data protection.
    </p>

    <p>
      By clicking the button below, you confirm that the information you provided 
      is true and complete to the best of your knowledge. You also understand that 
      incomplete or inaccurate information may affect the processing of your application or request.
    </p>

    <p>
      <a href="${confirmLink}" 
          style="display:inline-block; padding:10px 20px; background-color:#1e3a8a; color:white; text-decoration:none; border-radius:5px;">
          Confirm Consent
      </a>
    </p>

    <p>
      This consent shall remain valid unless withdrawn in writing.
    </p>

    <p>
      Should you have any questions or concerns, please feel free to contact us:
    </p>

    <p>
      Email: bancassurance@phillife.com.ph <br/>
      Telephone: (02) 7798-5433 <br/>
      Mobile: 0998-xxxxxxxxx
    </p>

    <p>
      Thank you for your trust and support.
    </p>

    <p>
      <strong>Best regards,</strong><br/>
      PHILLIFE FINANCIAL
    </p>
  `

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

  const emailBody = `
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: auto;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    .otp {
      font-size: 28px;
      font-weight: bold;
      text-align: center;
      color: #1976d2;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Bancassurance Referral System</h2>

    <p>Hello,</p>

    <p>Your One-Time Password (OTP) is:</p>

    <div class="otp">${otp}</div>

    <p>This OTP will expire in 5 minutes.</p>

    <p>If you did not request this code, please ignore this email.</p>

    <br>

    <p>Regards,<br>
    Bancassurance Referral System Team</p>
  </div>
</body>
</html>
`;

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

  const emailBody = `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    .credentials { background-color: #f4f6fb; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .label { font-size: 12px; color: #888; margin-bottom: 2px; }
    .value { font-size: 16px; font-weight: bold; color: #1e3a8a; }
    .note { font-size: 13px; color: #e53935; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Bancassurance Referral System</h2>

    <p>Hello, <strong>${firstName}</strong>!</p>

    <p>Your registration has been received and is currently <strong>pending approval</strong> by your branch head.
    Once approved, you may log in using the credentials below.</p>

    <div class="credentials">
      <div class="label">User Code</div>
      <div class="value">${userCode}</div>
      <br/>
      <div class="label">Temporary Password</div>
      <div class="value">${tempPassword}</div>
    </div>

    <p class="note">⚠ For security purposes, please change your password immediately upon first login.</p>

    <p>If you did not request this registration, please contact your system administrator immediately.</p>

    <br/>
    <p>Regards,<br/>Bancassurance Referral System Team</p>
  </div>
</body>
</html>
  `;

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

  const emailBody = `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    .status { font-size: 18px; font-weight: bold; text-align: center; padding: 12px; border-radius: 6px;
              color: white; background-color: ${isApproved ? '#2e7d32' : '#c62828'}; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Bancassurance Referral System</h2>
    <p>Hello, <strong>${firstName}</strong>!</p>
    <div class="status">Your registration has been ${isApproved ? 'APPROVED' : 'REJECTED'}</div>
    ${isApproved
      ? `<p>Your account is now active. You may log in using your User Code: <strong>${userCode}</strong> and the temporary password sent to you during registration.</p>
         <p>Please change your password immediately upon first login.</p>`
      : `<p>Unfortunately your registration request has been rejected. Please contact your Branch Head for more information.</p>`
    }
    <br/>
    <p>Regards,<br/>Bancassurance Referral System Team</p>
  </div>
</body>
</html>
  `;

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