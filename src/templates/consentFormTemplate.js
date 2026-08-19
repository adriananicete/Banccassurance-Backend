import { escapeHtml } from '../utils/validators.js'

export const consentFormTemplate = (token, name, branchName, referrerName) => `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Confirm Consent</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico">
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f6f9;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }

          .card {
            background: #ffffff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-width: 600px;
            width: 100%;
          }

          h2 {
            color: #333;
            margin-bottom: 16px;
            text-align: center;
          }

          p {
            color: #555;
            line-height: 1.6;
            margin-bottom: 12px;
          }

          ol {
            color: #555;
            line-height: 1.8;
            padding-left: 20px;
            margin-bottom: 16px;
          }

          .highlight {
            font-weight: bold;
          }

          .form-section {
            text-align: center;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
          }

          .confirm-btn {
            display: inline-block;
            padding: 12px 32px;
            background-color: #1e3a8a;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          }

          .confirm-btn:hover {
            background-color: #162d6e;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Consent for Endorsement and Data Processing</h2>

          <p><strong>Dear Valued Client,</strong></p>

          <p>Good day!</p>

          <p>
            As part of our financial needs assessment and product presentation process,
            we kindly request your consent to allow <span class="highlight">PHILLIFE</span> and its
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
            with the <span class="highlight">Data Privacy Act of 2012</span> and the company's
            policies on confidentiality and data protection.
          </p>

          <p>
            By clicking the button below, you confirm that the information you provided
            is true and complete to the best of your knowledge. You also understand that
            incomplete or inaccurate information may affect the processing of your application or request.
          </p>

          <p>This consent shall remain valid unless withdrawn in writing.</p>

          <div class="form-section">
            <form method="POST" action="/api/consent/confirm">
              <input type="hidden" name="token" value="${escapeHtml(token)}" />
              <input type="hidden" name="name" value="${escapeHtml(name)}" />
              <input type="hidden" name="branchName" value="${escapeHtml(branchName)}" />
              <input type="hidden" name="referrerName" value="${escapeHtml(referrerName)}" />
              <button type="submit" class="confirm-btn">Confirm Consent</button>
            </form>
          </div>
        </div>
      </body>
      </html>`
