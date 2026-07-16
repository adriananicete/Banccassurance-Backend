export const otpEmailTemplate = (otp) => `
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
`
