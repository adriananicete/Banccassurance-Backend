export const consentConfirmedTemplate = () => `
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
      </html>`
