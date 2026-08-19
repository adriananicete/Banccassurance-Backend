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
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  landBankRoles,
  minimumLengthPassword,
  philLifeRoles,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
} from "../utils/constant.js";
import { throwHttpError } from "../utils/error.js";
import { safeNotify } from "./notificationService.js";
import { record } from "./auditService.js";

const otpStore = {};

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

// banc.Users.IsActive is a bit column, so mssql hands back a JavaScript boolean --
// never the numbers these guards used to be compared against. `IsActive !== 0` was
// therefore true even for a pending user, and `IsActive !== 1` true even for an
// approved one. Accept both shapes so that changing the column to INT later (which a
// real REJECTED state would need) does not silently break the guards a second time.
// The column is nullable, and NULL is neither -- both helpers return false for it.
const isApproved = (isActive) => isActive === true || isActive === 1;
const isPending = (isActive) => isActive === false || isActive === 0;

export const verifyOtp = async (identifier, otp) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    throwHttpError(401, "Invalid credentials");
  }

  const user = result.recordset[0];
  const record = otpStore[user.UserCode];

  if (!record) throwHttpError(401, "No OTP found");
  if (record.expires < Date.now()) throwHttpError(401, "OTP expired");
  if (record.otp !== otp) {
    record.attempts++;
    if (record.attempts >= 5) {
      delete otpStore[user.UserCode];
      throwHttpError(401, "Too many incorrect attempts. Please log in again.");
    }
    throwHttpError(401, "Invalid OTP");
  }

  delete otpStore[user.UserCode];

  return { success: true, user };
};

export const loginStep1 = async (identifier, password) => {
  const result = await userModel.validateUser(identifier).run();

  if (result.recordset.length === 0) {
    throwHttpError(401, "Invalid credentials");
  }

  const user = result.recordset[0];

  if (!user.PasswordHash) {
    throwHttpError(401, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.PasswordHash);

  if (!isMatch) {
    throwHttpError(401, "Invalid credentials");
  }

  if (user.StatusCode === "NOT_FOUND") {
    throwHttpError(401, "Invalid credentials");
  }

  if (user.StatusCode === "PENDING") {
    throwHttpError(
      401,
      "Your account is pending approval. Please wait for your Branch Head to approve your registration.",
    );
  }

  if (user.StatusCode === "DEACTIVATED") {
    throwHttpError(
      401,
      "Your account has been deactivated. Please contact your Branch Head.",
    );
  }

  const email = user.Email;
  const otp = generateOtp();

  otpStore[user.UserCode] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  };

  if (process.env.NODE_ENV !== "production") console.log("2FA OTP:", otp);

  await sendOtpEmail(email, otp);

  return { success: true };
};

export const changePassword = async (
  userCode,
  currentPassword,
  newPassword,
) => {
  if (!newPassword || newPassword.length < minimumLengthPassword)
    throwHttpError(400, "Your password must be at least 8 characters.");

  const result = await userModel.getPasswordHash(userCode).run();

  if (result.recordset.length === 0) {
    throwHttpError(404, "User not found");
  }

  const user = result.recordset[0];
  const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash);

  if (!isMatch) {
    throwHttpError(400, "Current password is incorrect");
  }

  if (newPassword === currentPassword)
    throwHttpError(400, "Old password must be changed");

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
  if (
    !landBankRoles.includes(fields.role) &&
    !philLifeRoles.includes(fields.role)
  )
    throwHttpError(400, "Invalid role");
  const tempPassword = crypto.randomBytes(12).toString("base64url");

  if (fields.role === ACCOUNT_OFFICER || fields.role === AREA_SALES_HEAD) {
    if (!fields.areaCode)
      throwHttpError(400, "Group is required for this role");

    if (fields.branchCode)
      throwHttpError(
        400,
        "Branch is not selected at registration for this role",
      );
  }

  if (fields.role === REGIONAL_SALES_HEAD) {
    if (fields.areaCode || fields.branchCode)
      throwHttpError(
        400,
        "Group is not selected at registration for this role",
      );
  }

  if (fields.role === BRANCH_STAFF || fields.role === BRANCH_HEAD) {
    if (!fields.branchCode)
      throwHttpError(400, "Branch is required for this role");
  }

  let approvers;
  let approverMessage;
  let noApproverMessage;

  if (fields.role === BRANCH_STAFF) {
     approvers = await userModel
      .getBranchHeadByBranch(fields.branchCode)
      .run();
     approverMessage = `New staff registration pending for approval: ${fields.firstName} ${fields.lastName}`;
     noApproverMessage = `No Branch Head is assigned to this branch yet. Please contact your administrator.`;

  } else if (fields.role === BRANCH_HEAD) {
     approvers = await userModel
      .getGroupHeadByArea(fields.areaCode)
      .run();
    approverMessage = `New branch head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Group Head is assigned to this group yet. Please contact your administrator.'

  } else if (fields.role === GROUP_HEAD) {
    approvers = await userModel
      .getSectorHeadByArea(fields.areaCode)
      .run();

    approverMessage = `New group head registration pending for approval: ${fields.firstName} ${fields.lastName}`;

    noApproverMessage = 'No Sector Head is assigned to this group yet. Please contact your administrator.'

  } else if (fields.role === ACCOUNT_OFFICER) {
    approvers = await userModel
      .getAreaSalesHeadByArea(fields.areaCode)
      .run();
    approverMessage = `New account officer registration pending for approval: ${fields.firstName} ${fields.lastName}`;

    noApproverMessage = 'No Area Sales Head is assigned to this group yet. Please contact your administrator.'

  } else if (fields.role === AREA_SALES_HEAD) {
    approvers = await userModel.getRegionalSalesHeadByArea(fields.areaCode).run();
    approverMessage = `New area sales head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Regional Sales Head is assigned to this group yet. Please contact your administrator.';

  } else if (fields.role === REGIONAL_SALES_HEAD) {
    approvers = await userModel.getDepartmentHead().run();
    approverMessage = `New regional sales head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Department Head is assigned yet. Please contact your administrator.'
  
  } else {
    throwHttpError(
      400,
      "No approver is assigned for this role. Please contact your administrator"
    );
  }

  if (approvers.recordset.length === 0) throwHttpError(400, noApproverMessage)

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
      areaCode: fields.role === AREA_SALES_HEAD ? null : fields.areaCode,
      checkOnly: false,
      passwordHash,
    })
    .run();

  const { Success, Message, UserCode } = result.recordset[0];

  if (Success === 1) {
    try {
      await sendWelcomeEmail(
        fields.email,
        fields.firstName,
        UserCode,
        tempPassword,
      );
    } catch (error) {
      console.error(error);
    }

    if(fields.role === AREA_SALES_HEAD) {
      await userModel.assignAreaSalesHeadArea(UserCode, fields.areaCode).run();
    }

    try {
        for (let approver of approvers.recordset) {
          await safeNotify(approver.UserCode, approverMessage)
        }
      } catch (error) {
        console.error(error);
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
  } else if (user.Role === DEPARTMENT_HEAD) {
    const result = await userModel.getRegionalSalesHeadsForApproval(status).run();
    return result.recordset;
  } else if (user.Role === REGIONAL_SALES_HEAD) {
    const result = await userModel.getAreaSalesHeadsForApproval(user.UserCode, status).run();
    return result.recordset;
  } else if(user.Role === AREA_SALES_HEAD) {
    const result = await userModel.getAccountOfficersForApproval(user.UserCode, status).run();
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
  } else if (user.Role === GROUP_HEAD) {
    if (
      targetUser.Role !== BRANCH_HEAD ||
      targetUser.AreaCode !== user.AreaCode
    ) {
      throwHttpError(403, "Forbidden");
    }
  } else if (user.Role === SECTOR_HEAD) {
    if (targetUser.Role !== GROUP_HEAD) {
      throwHttpError(403, "Forbidden");
    }

    const scopeCheck = await userModel
      .isAreaInSectorScope(user.UserId, targetUser.AreaCode)
      .run();

    if (scopeCheck.recordset.length === 0) {
      throwHttpError(403, "Forbidden");
    }
  } else if (user.Role === DEPARTMENT_HEAD) {
    if(targetUser.Role !== REGIONAL_SALES_HEAD) {
      throwHttpError(403, 'Forbidden');
    }

  } else if (user.Role === REGIONAL_SALES_HEAD) {
    if(targetUser.Role !== AREA_SALES_HEAD) {
      throwHttpError(403, 'Forbidden')
    }

    const scopeCheck = await userModel.isAshInRegionalScope(user.UserCode, targetUser.UserCode).run();
    if(scopeCheck.recordset.length === 0) {
      throwHttpError(403, 'Forbidden')
    }
  } else if (user.Role === AREA_SALES_HEAD) {
    if(targetUser.Role !== ACCOUNT_OFFICER) {
      throwHttpError(403, 'Forbidden')
    }

    const scopeCheck = await userModel.isAreaInAreaSalesHeadScope(user.UserCode, targetUser.AreaCode).run();
    if(scopeCheck.recordset.length === 0) {
      throwHttpError(403, 'Forbidden')
    }
  } else {
    throwHttpError(403, "Forbidden");
  }

  if (!isPending(targetUser.IsActive))
    throwHttpError(400, "This user has already been approved or rejected.");

  const result = await userModel.approveRejectUser(userId, action).run();
  const { Success, Message, FirstName, Email, UserCode } = result.recordset[0];

  if (Success === 1) {
    await record({
      actorUserCode: user.UserCode,
      action: action === "APPROVE" ? "USER_APPROVED" : "USER_REJECTED",
      entityType: "USER",
      entityId: targetUser.UserCode,
      detail: targetUser.Role,
    });

    await sendApprovalEmail(Email, FirstName, UserCode, action);
    return { success: true, message: Message };
  }

  return { success: false, message: Message };
};

// All three assign endpoints replace the whole set, so the caller sends the full
// desired list and an empty array means "remove all".
const normalizeCodes = (codes, field) => {
  if (!Array.isArray(codes)) throwHttpError(400, `${field} must be an array`);

  const normalized = [];
  for (const code of codes) {
    const value = Number(code);
    if (!Number.isInteger(value) || value <= 0)
      throwHttpError(400, `${field} must contain whole numbers`);
    if (!normalized.includes(value)) normalized.push(value);
  }
  return normalized;
};

const loadAssignTarget = async (userId, expectedRole, roleLabel) => {
  // userId arrives from the URL, so it is a string until proven otherwise.
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throwHttpError(404, "Not Found");

  const result = await userModel.getUserScopeById(id).run();
  if (result.recordset.length === 0) throwHttpError(404, "Not Found");

  const targetUser = result.recordset[0];

  if (targetUser.Role !== expectedRole)
    throwHttpError(400, `This user is not ${roleLabel}.`);

  if (!isApproved(targetUser.IsActive))
    throwHttpError(400, "This user has not been approved yet.");

  return targetUser;
};

export const replaceAccountOfficerBranches = async (
  user,
  userId,
  branchCodes,
) => {
  const branches = normalizeCodes(branchCodes, "branchCodes");
  const targetUser = await loadAssignTarget(
    userId,
    ACCOUNT_OFFICER,
    "an Account Officer",
  );

  // The AO's group is the one they picked at registration -- the same key the
  // Area Sales Head approved them on.
  const inScope = await userModel
    .isAreaInAreaSalesHeadScope(user.UserCode, targetUser.AreaCode)
    .run();
  if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");

  if (branches.length > 0) {
    const joined = branches.join(",");

    const outside = await userModel
      .getBranchesOutsideAreaSalesHeadScope(user.UserCode, joined)
      .run();
    if (outside.recordset.length > 0)
      throwHttpError(
        403,
        `These branches are outside your assigned groups: ${outside.recordset
          .map((row) => row.BranchCode)
          .join(", ")}`,
      );

    const taken = await userModel
      .getBranchesAssignedToOtherAO(targetUser.UserCode, joined)
      .run();
    if (taken.recordset.length > 0)
      throwHttpError(
        409,
        `These branches are already assigned to another Account Officer: ${taken.recordset
          .map((row) => row.BranchCode)
          .join(", ")}`,
      );
  }

  await userModel
    .replaceAccountOfficerBranches(targetUser.UserCode, branches.join(","))
    .run();

  await record({
    actorUserCode: user.UserCode,
    action: "BRANCHES_ASSIGNED",
    entityType: "SCOPE",
    entityId: targetUser.UserCode,
    detail: branches.join(","),
  });

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      branchCodes: branches,
    },
  };
};

export const replaceAreaSalesHeadAreas = async (user, userId, areaCodes) => {
  const areas = normalizeCodes(areaCodes, "areaCodes");

  // This endpoint alone refuses the empty set. A Regional Sales Head's authority over an
  // Area Sales Head comes from `isAshInRegionalScope`, which works by finding an area the
  // two hold in common -- so emptying the set is the one write that revokes the caller's own
  // ability to undo it, and no other role can reach the user afterwards. `/branches` and
  // `/groups` still accept it: neither takes its permission from the table it edits.
  if (areas.length === 0)
    throwHttpError(
      400,
      "An Area Sales Head must keep at least one group. Removing every group would leave no Regional Sales Head able to manage this user. Deactivate the account instead.",
    );

  const targetUser = await loadAssignTarget(
    userId,
    AREA_SALES_HEAD,
    "an Area Sales Head",
  );

  const inScope = await userModel
    .isAshInRegionalScope(user.UserCode, targetUser.UserCode)
    .run();
  if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");

  if (areas.length > 0) {
    const outside = await userModel
      .getAreasOutsideRegionalSalesHeadScope(user.UserCode, areas.join(","))
      .run();
    if (outside.recordset.length > 0)
      throwHttpError(
        403,
        `These groups are outside your region: ${outside.recordset
          .map((row) => row.AreaCode)
          .join(", ")}`,
      );
  }

  await userModel
    .replaceAreaSalesHeadAreas(targetUser.UserCode, areas.join(","))
    .run();

  await record({
    actorUserCode: user.UserCode,
    action: "AREAS_ASSIGNED",
    entityType: "SCOPE",
    entityId: targetUser.UserCode,
    detail: areas.join(","),
  });

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      areaCodes: areas,
    },
  };
};

export const replaceRegionalSalesHeadAreas = async (
  user,
  userId,
  areaCodes,
) => {
  const areas = normalizeCodes(areaCodes, "areaCodes");
  const targetUser = await loadAssignTarget(
    userId,
    REGIONAL_SALES_HEAD,
    "a Regional Sales Head",
  );

  // No caller scope check -- the Department Head sees the whole tenant.
  if (areas.length > 0) {
    const unknown = await userModel.getUnknownAreas(areas.join(",")).run();
    if (unknown.recordset.length > 0)
      throwHttpError(
        400,
        `These groups do not exist: ${unknown.recordset
          .map((row) => row.AreaCode)
          .join(", ")}`,
      );
  }

  await userModel
    .replaceRegionalSalesHeadAreas(targetUser.UserCode, areas.join(","))
    .run();

  await record({
    actorUserCode: user.UserCode,
    action: "GROUPS_ASSIGNED",
    entityType: "SCOPE",
    entityId: targetUser.UserCode,
    detail: areas.join(","),
  });

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      areaCodes: areas,
    },
  };
};

export const findByUserCode = async (userCode) => {
  // Leverages the existing pattern in your service file
  const result = await userModel.validateUser(userCode).run();

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0];
};
