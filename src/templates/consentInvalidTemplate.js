export const consentInvalidTemplate = () => `
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
      </html>`
