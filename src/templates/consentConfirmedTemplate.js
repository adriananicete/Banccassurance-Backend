import { escapeHtml } from '../utils/validators.js'

export const consentConfirmedTemplate = (referral, fallback = {}) => {
  const confirmedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const clientName = (referral && `${referral.FirstName || ''} ${referral.LastName || ''}`.trim()) || fallback.name || ''
  const branch = (referral && referral.BranchName) || fallback.branchName || ''
  const referredBy = (referral && referral.ReferrerName) || fallback.referrerName || ''

  const detailRows = [
    ['Client Name', clientName],
    ['Branch', branch],
    ['Referred By', referredBy],
    ['Date Confirmed', confirmedDate]
  ].filter(([, value]) => value)

  const detailsHtml = detailRows.length ? `
          <div class="details">
            <div class="details-heading">Referral Details</div>
            ${detailRows.map(([label, value]) => `
            <div class="details-row">
              <span class="label">${escapeHtml(label)}</span>
              <span class="value">${escapeHtml(value)}</span>
            </div>`).join('')}
          </div>` : ''

  return `
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
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }

          .card {
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 440px;
            width: 100%;
          }

          .icon-circle {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background-color: #e1f0e8;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
          }

          .icon-circle svg {
            width: 32px;
            height: 32px;
          }

          h2 {
            color: #121926;
            margin: 0 0 8px;
            font-size: 22px;
          }

          p.body-text {
            color: #697586;
            line-height: 1.5;
            margin: 0 0 20px;
            font-size: 14px;
          }

          .details {
            text-align: left;
            border: 1px solid #e3e8ef;
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 20px;
          }

          .details-heading {
            font-size: 12px;
            font-weight: 600;
            color: #697586;
            margin-bottom: 10px;
          }

          .details-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            font-size: 13px;
          }

          .details-row .label {
            color: #697586;
          }

          .details-row .value {
            color: #121926;
            font-weight: 600;
            text-align: right;
          }

          .done-btn {
            display: block;
            width: 100%;
            padding: 12px 20px;
            background-color: #223c86;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 12px;
          }

          .done-btn:hover {
            background-color: #152554;
          }

          .support-link {
            font-size: 12px;
            color: #697586;
            text-decoration: none;
          }

          .support-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0a8444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2>Consent Confirmed</h2>
          <p class="body-text">
            Thank you${clientName ? `, ${escapeHtml(clientName)},` : ''} for confirming your consent. Your referral will now move forward, and our team will reach out to you shortly to continue the process.
          </p>
          ${detailsHtml}
          <button type="button" class="done-btn" onclick="window.close()">Done</button>
          <a class="support-link" href="mailto:bancassurance@phillife.com.ph">Need help? Contact support</a>
        </div>
      </body>
      </html>`
}
