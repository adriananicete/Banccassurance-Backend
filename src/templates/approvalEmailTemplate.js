export const approvalEmailTemplate = (firstName, userCode, isApproved) => `
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
  `
