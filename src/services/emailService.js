import https from 'https';
import fetch from "node-fetch";
import { consentEmailTemplate } from "../templates/consentEmailTemplate.js";
import { otpEmailTemplate } from "../templates/otpEmailTemplate.js";
import { welcomeEmailTemplate } from "../templates/welcomeEmailTemplate.js";
import { approvalEmailTemplate } from "../templates/approvalEmailTemplate.js";

const tlsAgent = new https.Agent({ rejectUnauthorized: false });

const TENANT_ID = process.env.GRAPH_TENANT_ID;
const CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL;

let cachedToken = null;
let tokenExpiry = 0;

// ✅ Get token
const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    agent: tlsAgent
  });

  const data = await response.json();

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;

  return cachedToken;
};

const sendMail = async (toEmail, subject, htmlBody) => {
  const accessToken = await getAccessToken();

    const mail = {
      message: {
        subject: subject,
        body: {
          contentType: "HTML",
          content: htmlBody,
        },
        toRecipients: [
          {
            emailAddress: {
              address: toEmail,
            },
          },
        ],
      },
    };

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': "application/json",
        },
        body: JSON.stringify(mail),
        agent: tlsAgent
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(errText);
      throw new Error("Failed to send email");
    }
};

// ✅ Send email
export const sendConsentEmail = async (toEmail, token, name, branchName, referrerName) => {

  const params = new URLSearchParams({ token });
  if (name) params.set('name', name);
  if (branchName) params.set('branchName', branchName);
  if (referrerName) params.set('referrerName', referrerName);

  const confirmLink = `${process.env.BASE_URL}/api/referrals/confirm-consent?${params.toString()}`;

  const emailBody = consentEmailTemplate(confirmLink);

  await sendMail(toEmail,"Consent for Endorsement and Data Processing", emailBody);

  console.log("✅ Email sent");
};

export const sendOtpEmail = async (toEmail, otp) => {
  
  const emailBody = otpEmailTemplate(otp);

  await sendMail(toEmail, 'Your OTP Code', emailBody)

  console.log("✅ OTP Email sent to:", toEmail);
};

export const sendWelcomeEmail = async (
  toEmail,
  firstName,
  userCode,
  tempPassword,
) => {

  const emailBody = welcomeEmailTemplate(firstName, userCode, tempPassword);

  await sendMail(toEmail, 'Your Bancassurance Referral System Account', emailBody)

  console.log("✅ Welcome Email sent to:", toEmail);
};

export const sendApprovalEmail = async (
  toEmail,
  firstName,
  userCode,
  action,
) => {

  const isApproved = action === "APPROVE";

  const subject = `Your Registration has been ${isApproved ? "Approved" : "Rejected"} - Bancassurance Referral System`;

  const emailBody = approvalEmailTemplate(firstName, userCode, isApproved);

  await sendMail(toEmail, subject, emailBody);

  console.log(`✅ Approval Email (${action}) sent to:`, toEmail);
};
