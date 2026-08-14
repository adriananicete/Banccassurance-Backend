import bcrypt from "bcrypt";
import crypto from "crypto";
import * as userModel from "../models/userModel.js";
import * as notificationModel from "../models/notificationModel.js";
import {
  sendOtpEmail,
  sendWelcomeEmail,
  sendApprovalEmail,
} from "./emailService.js";
import {
  BRANCH_HEAD,
  BRANCH_STAFF,
  GROUP_HEAD,
  landBankRoles,
  minimumLengthPassword,
  SECTOR_HEAD,
} from "../utils/constant.js";
import { throwHttpError } from "../utils/error.js";

const otpStore = {};

const generateOtp = () => crypto.randomInt(100000,1000000).toString();

export const sendOtp = async (identifier) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    return { success: false, message: "Invalid user" };
    throwHttpError(401, 'Invalid credentials');
  }

  const user = result.recordset[0];
  const email = user.Email;
  const otp = generateOtp();

  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000, attempts: 0 };

  console.log("Sending OTP to:", email);
  console.log("Generated OTP:", otp);

  await sendOtpEmail(email, otp);

  return { success: true };
};

export const verifyOtp = async (identifier, otp) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
        throwHttpError(401, 'Invalid credentials');
  }

  const user = result.recordset[0];
  const record = otpStore[user.Email];

  if (!record) throwHttpError(401, 'No OTP found');
  if (record.expires < Date.now())
    throwHttpError(401, 'OTP expired');
  if (record.otp !== otp) {
    record.attempts++;
    if(record.attempts >= 5) {
      delete otpStore[user.Email];
      throwHttpError(401, 'Too many incorrect attempts. Please log in again.')
    }
    throwHttpError(401, 'Invalid OTP')
  };

  delete otpStore[user.Email];

  return { success: true, user };
};

export const loginStep1 = async (identifier, password) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    throwHttpError(401, 'Invalid credentials');
  }

  const user = result.recordset[0];

  if (!user.PasswordHash) {
    throwHttpError(401, 'Invalid credentials')
  }

  const isMatch = await bcrypt.compare(password, user.PasswordHash);

  if (!isMatch) {
    throwHttpError(401, 'Invalid credentials');
  }


  if (user.StatusCode === "NOT_FOUND") {
    throwHttpError(401, 'Invalid credentials');
  }

  if (user.StatusCode === "PENDING") {
    throwHttpError(401, 'Your account is pending approval. Please wait for your Branch Head to approve your registration.');
  }

  if (user.StatusCode === "DEACTIVATED") {
    throwHttpError(401, 'Your account has been deactivated. Please contact your Branch Head.');

  }

  const email = user.Email;
  const otp = generateOtp();

  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000, attempts: 0 };

  console.log("2FA OTP:", otp);

  await sendOtpEmail(email, otp);

  return { success: true };
};

export const changePassword = async (
  userCode,
  currentPassword,
  newPassword,
) => {

  if(!newPassword || newPassword.length < minimumLengthPassword) throwHttpError(400, 'Your password must be at least 8 characters.')

  const result = await userModel.getPasswordHash(userCode).run();

  if (result.recordset.length === 0) {
    throwHttpError(404, "User not found");
  }

  const user = result.recordset[0];
  const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash);

  if (!isMatch) {
    throwHttpError(400, "Current password is incorrect");
  }

  if(newPassword === currentPassword) throwHttpError(400, 'Old password must be changed')

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
  if(!landBankRoles.includes(fields.role)) throwHttpError(400, 'Invalid LandBank role')
  const tempPassword = crypto.randomBytes(12).toString("base64url");

  const checkEmployeeNo = await userModel
    .checkEmployeeNoExists(fields.employeeNo)
    .run();

  if (checkEmployeeNo.recordset.length > 0) {
    return {
      success: false,
      message: "Employee number already registered",
    };
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

    if (fields.role === BRANCH_STAFF) {
      const branchHeads = await userModel
        .getBranchHeadByBranch(fields.branchCode)
        .run();

      if (branchHeads.recordset.length > 0) {
        try {
          const message = `New staff registration pending for approval: ${fields.firstName} ${fields.lastName}`;
          for (let branchHead of branchHeads.recordset) {
            await notificationModel.insert(branchHead.UserCode, message).run();
          }
        } catch (error) {
          console.error(error);
        }
      }
    } else if (fields.role === BRANCH_HEAD) {
      const groupHeads = await userModel
        .getGroupHeadByArea(fields.areaCode)
        .run();

      if (groupHeads.recordset.length > 0) {
        try {
          const message = `New branch head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
          for (let groupHead of groupHeads.recordset) {
            await notificationModel.insert(groupHead.UserCode, message).run();
          }
        } catch (error) {
          console.error(error);
        }
      }
    } else if (fields.role === GROUP_HEAD) {
      const sectorHeads = await userModel
        .getSectorHeadByArea(fields.areaCode)
        .run();

      if (sectorHeads.recordset.length > 0) {
        try {
          const message = `New group head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
          for (let sectorHead of sectorHeads.recordset) {
            await notificationModel.insert(sectorHead.UserCode, message).run();
          }
        } catch (error) {
          console.error(error);
        }
      }
    } else {
      console.log("No approver for this role");
    }

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
  } else if (user.Role === GROUP_HEAD) {
    const result = await userModel
      .getBranchHeadsForApproval(user.AreaCode, status)
      .run();
    return result.recordset;
  } else if (user.Role === SECTOR_HEAD) {
    const result = await userModel
      .getGroupHeadsForApproval(user.UserId, status)
      .run();
    return result.recordset;
  } else {
    throwHttpError(400, "Invalid Role");
  }
};

export const approveRejectUser = async (user, userId, action) => {
  const getUserScopeById = await userModel.getUserScopeById(userId).run();
  if (getUserScopeById.recordset.length === 0) {
    throwHttpError(404, "Not Found");
  }
  const targetUser = getUserScopeById.recordset[0];

  if (user.Role === BRANCH_HEAD) {
    if (
      targetUser.Role !== BRANCH_STAFF ||
      targetUser.BranchCode !== user.BranchCode
    ) {
      throwHttpError(403, "Forbidden");
    }
  }

  if (user.Role === GROUP_HEAD) {
    if (
      targetUser.Role !== BRANCH_HEAD ||
      targetUser.AreaCode !== user.AreaCode
    ) {
      throwHttpError(403, "Forbidden");
    }
  }

  if (user.Role === SECTOR_HEAD) {
    if (targetUser.Role !== GROUP_HEAD) {
      throwHttpError(403, "Forbidden");
    }

    const scopeCheck = await userModel
      .isAreaInSectorScope(user.UserId, targetUser.AreaCode)
      .run();

    if (scopeCheck.recordset.length === 0) {
      throwHttpError(403, "Forbidden");
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
