import { escapeHtml } from '../utils/validators.js'

const invalidReason = {
  heading: 'Invalid or Expired Link',
  body: 'The consent confirmation link is no longer valid or has already been used.',
  advice: 'Please contact your branch representative for assistance.',
}

export const supersededReason = {
  heading: 'This Link Has Been Replaced',
  body: 'A newer consent request was sent to this email address, so this link is no longer active.',
  advice: 'Please open the most recent consent email and use the link there.',
}

export const consentInvalidTemplate = (reason = invalidReason) => `
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
          <h2>${escapeHtml(reason.heading)}</h2>
          <p>
            ${escapeHtml(reason.body)}
          </p>
          <p>
            ${escapeHtml(reason.advice)}
          </p>
        </div>
      </body>
      </html>`
