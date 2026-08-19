export const consentEmailTemplate = (confirmLink) => `
 <p>Good day!</p>

    <p>
      As part of our financial needs assessment and product presentation process,
      we kindly request your consent to allow <strong>PHILLIFE</strong> and its
      authorized representatives to process your information for account servicing
      and endorsement to the assigned Account Officer at your Landbank servicing branch.
    </p>

    <p>
      <a href="${confirmLink}"
          style="display:inline-block; padding:10px 20px; background-color:#1e3a8a; color:white; text-decoration:none; border-radius:5px;">
          Review and Give Consent
      </a>
    </p>

    <p style="color:#666; font-size:13px;">
      Opening this link does not record anything on its own. Your consent is
      recorded only when you press <strong>I Agree</strong> on that page.
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
  `;
