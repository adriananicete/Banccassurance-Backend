import { escapeHtml } from '../utils/validators.js'

export const consentEmailTemplate = (confirmLink, name) => `
    <p><strong>Dear Valued Client,${name ? ` ${escapeHtml(name)},` : ''}</strong></p>

    <p>Good day!</p>

    <p>
      As part of the Bancassurance financial needs assessment, client profiling, referral, and
      product presentation process, Philippine Life Financial Assurance Corp. (&ldquo;PhilLife&rdquo;)
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
      You may withdraw your consent where processing is based on consent, subject to applicable
      legal or contractual limitations. Withdrawal shall not affect processing lawfully undertaken
      before such withdrawal or processing that PhilLife is otherwise required or permitted by law
      to undertake.
    </p>

    <p>
      You may exercise your rights under the Data Privacy Act, including your rights to access,
      object, rectify, erase or block your personal data, and file a complaint with the National
      Privacy Commission.
    </p>

    <p>
      <a href="${confirmLink}"
          style="display:inline-block; padding:10px 20px; background-color:#1e3a8a; color:white; text-decoration:none; border-radius:5px;">
          Confirm Consent
      </a>
    </p>

    <p>
      Should you have any questions or concerns, please feel free to contact us:
    </p>

    <p>
      Email: bancassurance@phillife.com.ph <br/>
      Telephone: (02) 7798-5433 <br/>
      Mobile: 0998-xxxxxxxxx
    </p>

    <p>
      Thank you for your trust and support.
    </p>

    <p>
      <strong>Best regards,</strong><br/>
      PHILLIFE BANCASSURANCE
    </p>
  `
