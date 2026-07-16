export const welcomeEmailTemplate = (firstName, userCode, tempPassword) => `
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
  `
