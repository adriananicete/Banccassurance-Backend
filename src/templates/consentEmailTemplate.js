export const consentEmailTemplate = (confirmLink) => `
    <p><strong>Dear Valued Client,</strong></p>

    <p>Good day!</p>

    <p>
      As part of our financial needs assessment and product presentation process,
      we kindly request your consent to allow <strong>PHILLIFE</strong> and its
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
      with the <strong>Data Privacy Act of 2012</strong> and the company’s
      policies on confidentiality and data protection.
    </p>

    <p>
      By clicking the button below, you confirm that the information you provided
      is true and complete to the best of your knowledge. You also understand that
      incomplete or inaccurate information may affect the processing of your application or request.
    </p>

    <p>
      <a href="${confirmLink}"
          style="display:inline-block; padding:10px 20px; background-color:#1e3a8a; color:white; text-decoration:none; border-radius:5px;">
          Confirm Consent
      </a>
    </p>

    <p>
      This consent shall remain valid unless withdrawn in writing.
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
      PHILLIFE FINANCIAL
    </p>
  `
