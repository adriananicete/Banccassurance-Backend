import { escapeHtml } from '../utils/validators.js'

export const consentEmailTemplate = (confirmLink, name) => `
    <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#333333; max-width:560px;">

      <p style="margin:0 0 16px;"><strong>Dear Valued Client,${name ? ` ${escapeHtml(name)},` : ''}</strong></p>

      <p style="margin:0 0 16px;">Good day!</p>

      <p style="margin:0 0 16px;">
        As part of the Bancassurance financial needs assessment, client profiling, referral, and
        product presentation process, Philippine Life Financial Assurance Corp.
        (&ldquo;PhilLife&rdquo;) needs your consent before we may collect and process your personal
        information.
      </p>

      <p style="margin:0 0 24px;">
        Please review the full Consent for Endorsement and Data Processing, which explains what
        information is collected, how it is used and disclosed, how long it is kept, and your rights
        under the Data Privacy Act.
      </p>

      <p style="margin:0 0 16px;">
        <a href="${confirmLink}"
           style="display:inline-block; padding:12px 28px; background-color:#1e3a8a; color:#ffffff; text-decoration:none; border-radius:6px; font-size:16px; font-weight:bold;">
          Review and Give Consent
        </a>
      </p>

      <p style="margin:0 0 24px; color:#666666; font-size:13px;">
        Opening this link does not record anything on its own. Your consent is
        recorded only when you press <strong>I Agree</strong> on that page.
      </p>

      <p style="margin:0 0 6px;">Should you have any questions or concerns, please feel free to contact us:</p>

      <p style="margin:0 0 24px; color:#555555;">
        Email: bancassurance@phillife.com.ph <br/>
        Telephone: (02) 7798-5433 <br/>
        Mobile: 0998-xxxxxxxxx
      </p>

      <p style="margin:0 0 16px;">Thank you for your trust and support.</p>

      <p style="margin:0;">
        <strong>Best regards,</strong><br/>
        PHILLIFE BANCASSURANCE
      </p>

    </div>
  `;
