import { v4 as uuidv4 } from "uuid";
import * as referralService from "../services/referralService.js";
import { consentConfirmedTemplate } from "../templates/consentConfirmedTemplate.js";
import { consentInvalidTemplate } from "../templates/consentInvalidTemplate.js";
import { consentFormTemplate } from "../templates/consentFormTemplate.js";

export const sendConsent = async (req, res, next) => {
  try {
    const { email, firstName, lastName, branchName, referrerName } = req.body;
    const token = uuidv4();
    const name = [firstName, lastName].filter(Boolean).join(' ');

    await referralService.sendConsent(email, token, name, branchName, referrerName);

    res.status(200).json({
      success: true,
      message: "Consent email sent"
    });
  } catch (error) {
    next(error);
  }
};

export const confirmConsent = async (req, res) => {
  try {
    const { token, name, branchName, referrerName } = req.query;

    await referralService.validateConsentToken(token)

    res.send(consentFormTemplate(token, name, branchName, referrerName))

  } catch (error) {
    console.error("❌ Confirm Consent Error:", error);

    res.status(400).send(consentInvalidTemplate());
  }
};

export const checkConsent = async (req, res, next) => {
  try {
    const { email } = req.query;

    const status = await referralService.checkConsent(email);

    res.json({ status });
  } catch (error) {
    next(error);
  }
};

export const uploadConsent = async (req, res, next) => {
  try {

    const { email } = req.body;
    const file = req.file;

    if(!email) return res.status(400).json({
      success: false,
      message: 'Email is required'
    })

    if (!file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const filePath = file.filename

    const result = await referralService.uploadConsent(email, filePath)

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

export const confirmConsentPost = async (req, res) => {
  try {
    const { token, name, branchName, referrerName } = req.body;

    await referralService.confirmConsentRequest(token);

    res.send(consentConfirmedTemplate(null, { name, branchName, referrerName }))
  } catch (error) {
    console.error("❌ Confirm Consent Error:", error);

    res.status(400).send(consentInvalidTemplate());
  }
};
