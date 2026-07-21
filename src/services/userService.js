import bcrypt from "bcrypt";
import crypto from "crypto";
import * as userModel from "../models/userModel.js";
import {
  sendOtpEmail,
  sendWelcomeEmail,
  sendApprovalEmail,
} from "./emailService.js";
import {
  BRANCH_HEAD,
  BRANCH_STAFF,
  GROUP_HEAD,
  SECTOR_HEAD,
} from "../utils/constant.js";

const otpStore = {};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const sendOtp = async (identifier) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    return { success: false, message: "Invalid user" };
  }

  const user = result.recordset[0];
  const email = user.Email;
  const otp = generateOtp();

  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  console.log("Sending OTP to:", email);
  console.log("Generated OTP:", otp);

  await sendOtpEmail(email, otp);

  return { success: true };
};

export const verifyOtp = async (identifier, otp) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    return { success: false };
  }

  const user = result.recordset[0];
  const record = otpStore[user.Email];

  if (!record) return { success: false, message: "No OTP found" };
  if (record.expires < Date.now())
    return { success: false, message: "OTP expired" };
  if (record.otp !== otp) return { success: false, message: "Invalid OTP" };

  // Clear OTP immediately on successful use to prevent reuse replay attacks
  delete otpStore[user.Email];

  return { success: true, user };
};

export const loginStep1 = async (identifier, password) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    return { success: false, message: "Invalid credentials" };
  }

  const user = result.recordset[0];

  if (user.StatusCode === "NOT_FOUND") {
    return { success: false, message: "Invalid credentials" };
  }

  if (user.StatusCode === "PENDING") {
    return {
      success: false,
      message:
        "Your account is pending approval. Please wait for your Branch Head to approve your registration.",
    };
  }

  if (user.StatusCode === "DEACTIVATED") {
    return {
      success: false,
      message:
        "Your account has been deactivated. Please contact your Branch Head.",
    };
  }

  if (!user.PasswordHash) {
    return { success: false, message: "No password set" };
  }

  const isMatch = await bcrypt.compare(password, user.PasswordHash);

  if (!isMatch) {
    return { success: false, message: "Invalid credentials" };
  }

  const email = user.Email;
  const otp = generateOtp();

  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  console.log("2FA OTP:", otp);

  await sendOtpEmail(email, otp);

  return { success: true };
};

export const changePassword = async (
  userCode,
  currentPassword,
  newPassword,
) => {
  const result = await userModel.getPasswordHash(userCode).run();

  if (result.recordset.length === 0) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const user = result.recordset[0];
  const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash);

  if (!isMatch) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 400;
    throw err;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await userModel.updatePassword(userCode, newHash).run();

  return { success: true, message: "Password updated successfully" };
};

export const uploadProfilePhoto = async (userCode, fileName) => {
  const existing = await userModel.getPhoto(userCode).run();
  const oldPhoto = existing.recordset[0]?.Photo;

  await userModel.updatePhoto(userCode, fileName).run();

  return { oldPhoto };
};

export const getGroups = async () => {
  const result = await userModel.getGroups().run();
  return result.recordset;
};

export const getBranches = async (areaCode) => {
  const result = await userModel.getBranches(areaCode).run();
  return result.recordset;
};

export const checkEmail = async (email) => {
  const result = await userModel
    .checkOrRegisterUser({ email, checkOnly: true })
    .run();
  return result.recordset[0].exists === 1;
};

export const register = async (fields) => {
  const tempPassword = crypto.randomBytes(12).toString("base64url");

  const checkEmployeeNo = await userModel.checkEmployeeNoExists(fields.employeeNo).run();

  if(checkEmployeeNo.recordset.length > 0) {
    return {
      success: false,
      message: 'Employee number already registered'
    }
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const result = await userModel
    .checkOrRegisterUser({
      ...fields,
      checkOnly: false,
      passwordHash,
    })
    .run();

  const { Success, Message, UserCode } = result.recordset[0];

  if (Success === 1) {
    await sendWelcomeEmail(
      fields.email,
      fields.firstName,
      UserCode,
      tempPassword,
    );
    return { success: true, message: Message, userCode: UserCode };
  }

  return { success: false, message: Message };
};

export const getUsersForApproval = async (user, status) => {
  if (user.Role === BRANCH_HEAD) {
    const result = await userModel
      .getUsersForApproval(Number(user.BranchCode), status)
      .run();
    return result.recordset;
  }

  else if (user.Role === GROUP_HEAD) {
    const result = await userModel
      .getBranchHeadsForApproval(user.AreaCode, status)
      .run();
    return result.recordset;
  }

  else if (user.Role === SECTOR_HEAD) {
    const result = await userModel
      .getGroupHeadsForApproval(user.UserId, status)
      .run();
    return result.recordset;
  }

  else {
    const err = new Error("Invalid Role");
      err.statusCode = 400;
      throw err;
  }
};

export const approveRejectUser = async (user, userId, action) => {
  const getUserScopeById = await userModel.getUserScopeById(userId).run();
  if (getUserScopeById.recordset.length === 0) {
    const err = new Error("Not Found");
    err.statusCode = 404;
    throw err;
  }
  const targetUser = getUserScopeById.recordset[0];

  if (user.Role === BRANCH_HEAD) {
    if (
      targetUser.Role !== BRANCH_STAFF ||
      targetUser.BranchCode !== user.BranchCode
    ) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
  }

  if (user.Role === GROUP_HEAD) {
    if (
      targetUser.Role !== BRANCH_HEAD ||
      targetUser.AreaCode !== user.AreaCode
    ) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
  }

  if (user.Role === SECTOR_HEAD) {
    if (targetUser.Role !== GROUP_HEAD) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }

    const scopeCheck = await userModel
      .isAreaInSectorScope(user.UserId, targetUser.AreaCode)
      .run();

    if (scopeCheck.recordset.length === 0) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
  }

  const result = await userModel.approveRejectUser(userId, action).run();
  const { Success, Message, FirstName, Email, UserCode } = result.recordset[0];

  if (Success === 1) {
    await sendApprovalEmail(Email, FirstName, UserCode, action);
    return { success: true, message: Message };
  }

  return { success: false, message: Message };
};

export const findByUserCode = async (userCode) => {
  // Leverages the existing pattern in your service file
  const result = await userModel.validateUser(userCode).run();

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0];
};
