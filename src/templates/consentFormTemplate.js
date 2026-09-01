import { escapeHtml } from '../utils/validators.js'
import { API_VERSION_PREFIX } from '../utils/constant.js'

export const consentFormTemplate = (token, name, branchName, referrerName, fullName) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Confirm Consent</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico">
        <style>
          :root {
            --navy: #1e3a8a;
            --navy-dark: #162d6e;
            --ink: #1f2937;
            --body: #4b5563;
            --line: #e5e7eb;
            --page: #eef1f6;
          }

          * { box-sizing: border-box; }

          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            background: var(--page);
            color: var(--body);
            margin: 0;
            padding: 32px 16px 120px;
            -webkit-font-smoothing: antialiased;
          }

          .card {
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 12px 32px rgba(16,24,40,.08);
            max-width: 720px;
            margin: 0 auto;
            overflow: hidden;
          }

          .masthead {
            background: var(--navy);
            color: #ffffff;
            padding: 28px 40px;
          }

          .eyebrow {
            margin: 0 0 6px;
            font-size: 12px;
            letter-spacing: .12em;
            text-transform: uppercase;
            color: rgba(255,255,255,.72);
          }

          .masthead h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1.3;
            font-weight: 700;
          }

          .content { padding: 32px 40px 8px; }

          .salutation {
            font-size: 17px;
            color: var(--ink);
            margin: 0 0 4px;
          }

          .client-name { color: var(--navy); }

          p { line-height: 1.7; margin: 0 0 16px; }

          ol {
            line-height: 1.7;
            padding-left: 22px;
            margin: 0 0 20px;
          }

          ol li { margin-bottom: 8px; padding-left: 4px; }

          .highlight { font-weight: 700; color: var(--ink); }

          .rule {
            border: 0;
            border-top: 1px solid var(--line);
            margin: 28px 0;
          }

          .contact {
            background: #f8fafc;
            border: 1px solid var(--line);
            border-radius: 10px;
            padding: 16px 20px;
            font-size: 14px;
          }

          .contact p { margin: 0; }

          .form-section {
            position: sticky;
            bottom: 0;
            background: #ffffff;
            border-top: 1px solid var(--line);
            padding: 20px 40px 28px;
            text-align: center;
          }

          .final-step {
            margin: 0 0 14px;
            color: var(--ink);
            font-size: 15px;
          }

          .confirm-btn {
            display: inline-block;
            padding: 14px 44px;
            background-color: var(--navy);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
          }

          .confirm-btn:hover { background-color: var(--navy-dark); }

          .confirm-btn:focus-visible {
            outline: 3px solid #93c5fd;
            outline-offset: 2px;
          }

          @media (max-width: 560px) {
            body { padding: 0 0 100px; }
            .card { border-radius: 0; box-shadow: none; }
            .masthead { padding: 24px 20px; }
            .content { padding: 24px 20px 4px; }
            .form-section { padding: 16px 20px 20px; }
            .confirm-btn { width: 100%; }
          }

          @media print {
            body { background: #ffffff; padding: 0; }
            .card { box-shadow: none; max-width: none; }
            .form-section { position: static; }
            .confirm-btn { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <header class="masthead">
            <h1>Consent for Endorsement and Data Processing</h1>
          </header>

          <div class="content">
            <p class="salutation">Dear Valued Client, <strong class="client-name">${escapeHtml(fullName)}</strong></p>

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

            <hr class="rule" />

            <div class="contact">
              <p>
                Should you have any questions or concerns, please feel free to contact us: Email: bancassurance@phillife.com.ph,
                Telephone: (02) 7798-5433, Mobile: 0998-xxxxxxxxx.
              </p>
            </div>
          </div>

          <div class="form-section">
            <p class="final-step"><strong>This is the final step. Your consent is recorded when you press the button below.</strong></p>

            <form method="POST" action="${API_VERSION_PREFIX}/consent/confirm">
              <input type="hidden" name="token" value="${escapeHtml(token)}" />
              <input type="hidden" name="name" value="${escapeHtml(name)}" />
              <input type="hidden" name="branchName" value="${escapeHtml(branchName)}" />
              <input type="hidden" name="referrerName" value="${escapeHtml(referrerName)}" />
              <button type="submit" class="confirm-btn">I Agree</button>
            </form>
          </div>
        </div>
      </body>
      </html>`
