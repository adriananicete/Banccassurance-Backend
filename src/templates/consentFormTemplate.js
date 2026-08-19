import { escapeHtml } from '../utils/validators.js'

export const consentFormTemplate = (token, name, branchName, referrerName) => `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recording Your Consent</title>
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
            max-width: 480px;
            width: 100%;
            text-align: center;
          }

          h2 {
            color: #333;
            margin: 0 0 12px;
          }

          p {
            color: #555;
            line-height: 1.6;
            margin: 0 0 12px;
          }

          #working { display: none; }

          .spinner {
            width: 36px;
            height: 36px;
            margin: 0 auto 20px;
            border: 4px solid #e0e0e0;
            border-top-color: #1e3a8a;
            border-radius: 50%;
            animation: spin 0.9s linear infinite;
          }

          @keyframes spin { to { transform: rotate(360deg); } }

          @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none; }
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
            margin-top: 8px;
          }

          .confirm-btn:hover { background-color: #162d6e; }
        </style>
      </head>
      <body>
        <div class="card">
          <form id="consentForm" method="POST" action="/api/consent/confirm">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <input type="hidden" name="name" value="${escapeHtml(name)}" />
            <input type="hidden" name="branchName" value="${escapeHtml(branchName)}" />
            <input type="hidden" name="referrerName" value="${escapeHtml(referrerName)}" />

            <div id="working">
              <div class="spinner"></div>
              <h2>Recording your consent</h2>
              <p>One moment please. Do not close this window.</p>
            </div>

            <noscript>
              <h2>Confirm Your Consent</h2>
              <p>
                You have already read and agreed to the consent notice in the email.
                Press the button below to record it.
              </p>
              <button type="submit" class="confirm-btn">Record My Consent</button>
            </noscript>
          </form>

        <script>
          document.getElementById('working').style.display = 'block';
          document.getElementById('consentForm').submit();
        </script>
        </div>
      </body>
      </html>`
