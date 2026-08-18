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

          <p><strong>Dear Valued Client,${name ? ` ${escapeHtml(name)},` : ''}</strong></p>

          <p>Good day!</p>

          <p>
            As part of the Bancassurance financial needs assessment, client profiling, referral, and
            product presentation process, Philippine Life Financial Assurance Corp. (<span class="highlight">&ldquo;PhilLife&rdquo;</span>)
            may collect and process the personal information you provide in this form.
          </p>

          <p>
            By providing your consent, you authorize PhilLife and its duly authorized representatives to
            collect, use, store, disclose, and otherwise process your personal information, as applicable,
            for the following purposes:
          </p>

          <ol>
            <li>Conducting financial and insurance needs assessment and client profiling;</li>
            <li>Identifying insurance products that may be appropriate for your stated needs and financial profile;</li>
            <li>Preparing and presenting insurance product proposals;</li>
            <li>Facilitating your referral or endorsement between the authorized LANDBANK personnel and PhilLife Account Officer handling your bancassurance transaction;</li>
            <li>Processing and administering an insurance application or policy, should you decide to apply for a product;</li>
            <li>Providing account servicing and client support; and</li>
            <li>Complying with applicable legal, regulatory, audit, and record-keeping requirements.</li>
          </ol>

          <p>
            The personal information processed may include your identification and contact information,
            employment or business information, financial profile, existing financial products, insurance
            or banking needs and preferences, and other information you voluntarily provide for the
            purposes stated above.
          </p>

          <p>
            Your personal information may be disclosed, where necessary, to PhilLife, LANDBANK, their duly
            authorized personnel and service providers, and government or regulatory authorities when
            required by applicable law or regulation, subject to appropriate data privacy and security
            safeguards.
          </p>

          <p>
            Your personal information shall be retained only for as long as necessary to fulfill the
            purposes stated above and applicable legal and regulatory requirements, after which it shall
            be securely disposed of in accordance with applicable retention policies.
          </p>

          <p>
            By clicking the button below, you confirm that the information you provided
            is true and complete to the best of your knowledge. You also understand that
            incomplete or inaccurate information may affect the processing of your application or request.
          </p>

          <p>
            You may withdraw your consent where processing is based on consent, subject to applicable
            legal or contractual limitations. Withdrawal shall not affect processing lawfully undertaken
            before such withdrawal or processing that PhilLife is otherwise required or permitted by law
            to undertake.
          </p>

          <p>
            You may exercise your rights under the <span class="highlight">Data Privacy Act</span>, including your rights to
            access, object, rectify, erase or block your personal data, and file a complaint with the
            National Privacy Commission.
          </p>

          <p>
            Should you have any questions or concerns, please feel free to contact us: Email: bancassurance@phillife.com.ph,
            Telephone: (02) 7798-5433, Mobile: 0998-xxxxxxxxx.
          </p>

          <div class="form-section">
            <form method="POST" action="/api/referrals/confirm-consent">
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
