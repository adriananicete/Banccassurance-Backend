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
  approverRoles,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  minimumLengthPassword,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
  superadminApprovableRoles,
  topLevelRoles,
} from "../utils/constant.js";
import { throwHttpError } from "../utils/error.js";
import { getTenant } from "../utils/tenant.js";
import { safeNotify } from "./notificationService.js";
import { record } from "./auditService.js";

const otpStore = {};

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const isApproved = (isActive) => isActive === true || isActive === 1;
const isPending = (isActive) => isActive === false || isActive === 0;

export const alwaysRequiredFields = {
  firstName: "First name",
  lastName: "Last name",
  birthday: "Birthday",
  mobileNumber: "Mobile number",
  employeeNo: "Employee number",
  email: "Email",
};

export const registrationFields = {
  [BRANCH_STAFF]: { group: "optional", branch: "required" },
  [BRANCH_HEAD]: { group: "required", branch: "required" },
  [GROUP_HEAD]: { group: "required", branch: "forbidden" },
  [SECTOR_HEAD]: { group: "forbidden", branch: "forbidden" },
  [ACCOUNT_OFFICER]: { group: "required", branch: "forbidden" },
  [AREA_SALES_HEAD]: { group: "required", branch: "forbidden" },
  [REGIONAL_SALES_HEAD]: { group: "forbidden", branch: "forbidden" },
  [DEPARTMENT_HEAD]: { group: "forbidden", branch: "forbidden" },
};

export const registrationCodeFields = {
  groupCode: "Group",
  branchCode: "Branch",
};

export const roleCaps = {
  [SECTOR_HEAD]: { limit: 1, label: "Sector Head" },
  [DEPARTMENT_HEAD]: { limit: 1, label: "Department Head" },
};

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

  if (user.StatusCode !== "ACTIVE") {
    throwHttpError(401, "Invalid credentials");
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

export const getBranches = async (groupCode, search, options = {}) => {
  const result = await userModel.getBranches(groupCode, search, options).run();

  const totalCount = result.recordset[0]?.TotalCount ?? 0;
  const rows = result.recordset.map(({ TotalCount, ...rest }) => rest);

  return {
    data: rows,
    pagination: {
      page: options.PageNumber,
      pageSize: options.PageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / options.PageSize),
    },
  };
};

export const checkEmail = async (email) => {
  const result = await userModel
    .checkOrRegisterUser({ email, checkOnly: true })
    .run();
  return result.recordset[0].exists === 1;
};

export const register = async (fields, { createdBySuperadmin = false } = {}) => {
  const rule = registrationFields[fields.role];
  if (!rule) throwHttpError(400, "Invalid role");

  const tempPassword = crypto.randomBytes(12).toString("base64url");

  if (rule.group === "required" && !fields.groupCode)
    throwHttpError(400, "Group is required for this role");

  if (rule.group === "forbidden" && fields.groupCode)
    throwHttpError(400, "Group is not selected at registration for this role");

  if (rule.branch === "required" && !fields.branchCode)
    throwHttpError(400, "Branch is required for this role");

  if (rule.branch === "forbidden" && fields.branchCode)
    throwHttpError(400, "Branch is not selected at registration for this role");

  for (const [field, label] of Object.entries(alwaysRequiredFields))
    if (!fields[field]) throwHttpError(400, `${label} is required`);

  for (const [field, label] of Object.entries(registrationCodeFields)) {
    const value = fields[field];
    if (value === null || value === undefined || value === "") continue;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
      throwHttpError(400, `${label} must be a whole number`);
  }

  const cap = roleCaps[fields.role];

  if (cap) {
    const held = await userModel.countUsersByRole(fields.role).run();

    if ((held.recordset[0]?.Total ?? 0) >= cap.limit)
      throwHttpError(
        409,
        `The ${cap.label} role is limited to ${cap.limit} account${cap.limit === 1 ? "" : "s"}, and an approved or pending registration already holds it.`,
      );
  }

  if (fields.role === GROUP_HEAD) {
    const held = await userModel.checkGroupHeadExists(fields.groupCode).run();

    if (held.recordset.length > 0)
      throwHttpError(
        409,
        "This group already has a Group Head. Only one Group Head may hold a group.",
      );
  }

  let approvers;
  let approverMessage;
  let noApproverMessage;

  if (createdBySuperadmin) {
    approvers = { recordset: [] };
  } else if (fields.role === BRANCH_STAFF) {
     approvers = await userModel
      .getBranchHeadByBranch(fields.branchCode)
      .run();
     approverMessage = `New staff registration pending for approval: ${fields.firstName} ${fields.lastName}`;
     noApproverMessage = `No Branch Head is assigned to this branch yet. Please contact your administrator.`;

  } else if (fields.role === BRANCH_HEAD) {
     approvers = await userModel
      .getGroupHeadByArea(fields.groupCode)
      .run();
    approverMessage = `New branch head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Group Head is assigned to this group yet. Please contact your administrator.'

  } else if (fields.role === GROUP_HEAD) {
    approvers = await userModel.getSectorHead().run();

    approverMessage = `New group head registration pending for approval: ${fields.firstName} ${fields.lastName}`;

    noApproverMessage = 'No Sector Head account is active, so this registration cannot be approved by anyone. Please contact your administrator.'

  } else if (fields.role === ACCOUNT_OFFICER) {
    approvers = await userModel
      .getAreaSalesHeadByArea(fields.groupCode)
      .run();
    approverMessage = `New account officer registration pending for approval: ${fields.firstName} ${fields.lastName}`;

    noApproverMessage = 'No Area Sales Head is assigned to this group yet. Please contact your administrator.'

  } else if (fields.role === AREA_SALES_HEAD) {
    approvers = await userModel.getRegionalSalesHeadByArea(fields.groupCode).run();
    approverMessage = `New area sales head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Regional Sales Head is assigned to this group yet. Please contact your administrator.';

  } else if (fields.role === REGIONAL_SALES_HEAD) {
    approvers = await userModel.getDepartmentHead().run();
    approverMessage = `New regional sales head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage = 'No Department Head is assigned yet. Please contact your administrator.'

  } else if (topLevelRoles.includes(fields.role)) {
    approvers = await userModel.getSuperadmins().run();
    approverMessage =
      fields.role === SECTOR_HEAD
        ? `New sector head registration pending for approval: ${fields.firstName} ${fields.lastName}`
        : `New department head registration pending for approval: ${fields.firstName} ${fields.lastName}`;
    noApproverMessage =
      'No superadmin account is active, so this registration cannot be approved by anyone. Please contact IT.';

  } else {
    throwHttpError(
      400,
      "No approver is assigned for this role. Please contact your administrator"
    );
  }

  if (!createdBySuperadmin && approvers.recordset.length === 0)
    throwHttpError(400, noApproverMessage)

  const checkEmployeeNo = await userModel
    .checkEmployeeNoExists(fields.employeeNo)
    .run();

  if (checkEmployeeNo.recordset.length > 0)
    throwHttpError(
      409,
      checkEmployeeNo.recordset[0].MatchedOn === "USER_CODE"
        ? "This employee number is already in use as another account's user code. Please check it and try again."
        : "Employee number already registered",
    );

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const result = await userModel
    .checkOrRegisterUser({
      ...fields,
      groupCode: fields.role === AREA_SALES_HEAD ? null : fields.groupCode,
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
      await userModel.assignAreaSalesHeadArea(UserCode, fields.groupCode).run();
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

  throwHttpError(409, Message);
};


export const getUsersForApproval = async (user, options = {}) => {
  if (!approverRoles.includes(user.Role)) throwHttpError(400, "Invalid Role");

  const result = await userModel.getUsersForApproval(user, options).run();

  const totalCount = result.recordset[0]?.TotalCount ?? 0;
  const rows = result.recordset.map(({ TotalCount, ...rest }) => rest);

  return {
    data: rows,
    pagination: {
      page: options.PageNumber,
      pageSize: options.PageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / options.PageSize),
    },
  };
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
      targetUser.GroupCode !== user.GroupCode
    ) {
      throwHttpError(403, "Forbidden");
    }
  } else if (user.Role === SECTOR_HEAD) {
    if (targetUser.Role !== GROUP_HEAD) {
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

    const scopeCheck = await userModel.isAreaInAreaSalesHeadScope(user.UserCode, targetUser.GroupCode).run();
    if(scopeCheck.recordset.length === 0) {
      throwHttpError(403, 'Forbidden')
    }
  } else if (user.Role === SUPERADMIN) {
    if (action === "APPROVE" && !superadminApprovableRoles.includes(targetUser.Role)) {
      throwHttpError(
        403,
        "A superadmin approves Sector Heads and Department Heads. Every other role is approved by the role above it.",
      );
    }

    if (targetUser.UserCode === user.UserCode) {
      throwHttpError(400, "You cannot deactivate your own account.");
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

export const createTopLevelUser = async (actor, fields) => {
  if (!superadminApprovableRoles.includes(fields.role))
    throwHttpError(
      400,
      "A superadmin creates Sector Heads and Department Heads. Every other role registers and is approved by the role above it.",
    );

  if (fields.groupCode || fields.branchCode)
    throwHttpError(400, "Group is not selected at registration for this role");

  const created = await register(fields, { createdBySuperadmin: true });

  const found = await userModel.findUserIdByCode(created.userCode).run();
  if (found.recordset.length === 0)
    throwHttpError(500, "The account was created but could not be approved. Please approve it from the approvals list.");

  await userModel.approveRejectUser(found.recordset[0].UserId, "APPROVE").run();

  await record({
    actorUserCode: actor.UserCode,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: created.userCode,
    detail: fields.role,
  });

  return {
    success: true,
    message: "Account created and approved.",
    userCode: created.userCode,
  };
};

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

  const unscoped = user.Role === SUPERADMIN;

  if (!unscoped) {
    const inScope = await userModel
      .isAreaInAreaSalesHeadScope(user.UserCode, targetUser.GroupCode)
      .run();
    if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");
  }

  if (branches.length > 0) {
    const joined = branches.join(",");

    if (!unscoped) {
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
    }

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
    .replaceAccountOfficerBranches(targetUser.UserCode, branches.join(","), {
      actorUserCode: user.UserCode,
      action: "BRANCHES_ASSIGNED",
      entityType: "SCOPE",
      entityId: targetUser.UserCode,
      detail: branches.join(","),
    })
    .run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      branchCodes: branches,
    },
  };
};

export const replaceAreaSalesHeadAreas = async (user, userId, groupCodes) => {
  const areas = normalizeCodes(groupCodes, "groupCodes");

  const unscoped = user.Role === SUPERADMIN;

  if (areas.length === 0 && !unscoped)
    throwHttpError(
      400,
      "An Area Sales Head must keep at least one group. Removing every group would leave no Regional Sales Head able to manage this user. Deactivate the account instead.",
    );

  const targetUser = await loadAssignTarget(
    userId,
    AREA_SALES_HEAD,
    "an Area Sales Head",
  );

  if (!unscoped) {
    const inScope = await userModel
      .isAshInRegionalScope(user.UserCode, targetUser.UserCode)
      .run();
    if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");
  }

  if (areas.length > 0 && !unscoped) {
    const outside = await userModel
      .getAreasOutsideRegionalSalesHeadScope(user.UserCode, areas.join(","))
      .run();
    if (outside.recordset.length > 0)
      throwHttpError(
        403,
        `These groups are outside your region: ${outside.recordset
          .map((row) => row.GroupCode)
          .join(", ")}`,
      );
  }

  if (areas.length > 0 && unscoped) {
    const unknown = await userModel.getUnknownAreas(areas.join(",")).run();
    if (unknown.recordset.length > 0)
      throwHttpError(
        400,
        `These groups do not exist: ${unknown.recordset
          .map((row) => row.GroupCode)
          .join(", ")}`,
      );
  }

  await userModel
    .replaceAreaSalesHeadAreas(targetUser.UserCode, areas.join(","), {
      actorUserCode: user.UserCode,
      action: "AREAS_ASSIGNED",
      entityType: "SCOPE",
      entityId: targetUser.UserCode,
      detail: areas.join(","),
    })
    .run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      groupCodes: areas,
    },
  };
};

export const replaceRegionalSalesHeadAreas = async (
  user,
  userId,
  groupCodes,
) => {
  const areas = normalizeCodes(groupCodes, "groupCodes");
  const targetUser = await loadAssignTarget(
    userId,
    REGIONAL_SALES_HEAD,
    "a Regional Sales Head",
  );

  if (areas.length > 0) {
    const unknown = await userModel.getUnknownAreas(areas.join(",")).run();
    if (unknown.recordset.length > 0)
      throwHttpError(
        400,
        `These groups do not exist: ${unknown.recordset
          .map((row) => row.GroupCode)
          .join(", ")}`,
      );
  }

  await userModel
    .replaceRegionalSalesHeadAreas(targetUser.UserCode, areas.join(","), {
      actorUserCode: user.UserCode,
      action: "GROUPS_ASSIGNED",
      entityType: "SCOPE",
      entityId: targetUser.UserCode,
      detail: areas.join(","),
    })
    .run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      groupCodes: areas,
    },
  };
};

const SELF = "SELF";
const ASSIGNED = "ASSIGNED";
const TENANT = "TENANT";

export const scopeReach = {
  [BRANCH_STAFF]: SELF,
  [BRANCH_HEAD]: ASSIGNED,
  [GROUP_HEAD]: ASSIGNED,
  [SECTOR_HEAD]: TENANT,
  [ACCOUNT_OFFICER]: ASSIGNED,
  [AREA_SALES_HEAD]: ASSIGNED,
  [REGIONAL_SALES_HEAD]: ASSIGNED,
  [DEPARTMENT_HEAD]: TENANT,
  [SUPERADMIN]: TENANT,
};

const groupScope = (row) => ({
  level: "GROUP",
  code: row.GroupCode ?? null,
  name: row.GroupName ?? null,
  regionCode: row.RegionCode ?? null,
  regionName: row.RegionName ?? null,
  groupCode: row.GroupCode ?? null,
  groupName: row.GroupName ?? null,
});

const branchScope = (row) => ({
  branchCode: row.BranchCode ?? null,
  branchName: row.BranchName ?? null,
  regionCode: row.RegionCode ?? null,
  regionName: row.RegionName ?? null,
  groupCode: row.GroupCode ?? null,
  groupName: row.GroupName ?? null,
  clusterCode: row.ClusterCode ?? null,
  clusterName: row.ClusterName ?? null,
});

const assignableBranch = (row) => ({
  ...branchScope(row),
  aoCode: row.AOCode ?? null,
});

export const getOwnScope = async (user) => {
  if (user.Role === SUPERADMIN)
    return {
      success: true,
      data: {
        userId: user.UserId ?? null,
        userCode: user.UserCode,
        role: SUPERADMIN,
        tenant: null,
        reach: TENANT,
        scopes: [],
        branches: [],
      },
    };

  const found = await userModel.getUserScopeById(user.UserId).run();
  if (found.recordset.length === 0) throwHttpError(404, "Not Found");

  const self = found.recordset[0];
  const scopes = [];
  const branches = [];

  if (self.Role === BRANCH_STAFF || self.Role === BRANCH_HEAD) {
    if (self.BranchCode) {
      const result = await userModel.getBranchScope(self.BranchCode).run();
      branches.push(...result.recordset.map(branchScope));
    }
  } else if (self.Role === GROUP_HEAD) {
    if (self.GroupCode) {
      const result = await userModel.getGroupScope(self.GroupCode).run();
      scopes.push(...result.recordset.map(groupScope));
    }
  } else if (self.Role === ACCOUNT_OFFICER) {
    if (self.GroupCode) {
      const result = await userModel.getGroupScope(self.GroupCode).run();
      scopes.push(...result.recordset.map(groupScope));
    }
    const assigned = await userModel.getAccountOfficerBranchScope(self.UserCode).run();
    branches.push(...assigned.recordset.map(branchScope));
  } else if (self.Role === AREA_SALES_HEAD) {
    const result = await userModel.getAreaSalesHeadScope(self.UserCode).run();
    scopes.push(...result.recordset.map(groupScope));
  } else if (self.Role === REGIONAL_SALES_HEAD) {
    const result = await userModel.getRegionalSalesHeadScope(self.UserCode).run();
    scopes.push(...result.recordset.map(groupScope));
  }

  return {
    success: true,
    data: {
      userId: self.UserId,
      userCode: self.UserCode,
      role: self.Role,
      tenant: getTenant(self.UserCode),
      reach: scopeReach[self.Role] ?? ASSIGNED,
      scopes,
      branches,
    },
  };
};

export const getAccountOfficerBranches = async (user, userId) => {
  const targetUser = await loadAssignTarget(
    userId,
    ACCOUNT_OFFICER,
    "an Account Officer",
  );

  if (user.Role !== SUPERADMIN) {
    const inScope = await userModel
      .isAreaInAreaSalesHeadScope(user.UserCode, targetUser.GroupCode)
      .run();
    if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");
  }

  const result = await userModel
    .getAccountOfficerBranchScope(targetUser.UserCode)
    .run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      branchCodes: result.recordset.map((row) => row.BranchCode),
      branches: result.recordset.map(branchScope),
    },
  };
};

export const getAreaSalesHeadAreas = async (user, userId) => {
  const targetUser = await loadAssignTarget(
    userId,
    AREA_SALES_HEAD,
    "an Area Sales Head",
  );

  if (user.Role !== SUPERADMIN) {
    const inScope = await userModel
      .isAshInRegionalScope(user.UserCode, targetUser.UserCode)
      .run();
    if (inScope.recordset.length === 0) throwHttpError(403, "Forbidden");
  }

  const result = await userModel.getAreaSalesHeadScope(targetUser.UserCode).run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      groupCodes: result.recordset.map((row) => row.GroupCode),
      groups: result.recordset.map(groupScope),
    },
  };
};

export const getRegionalSalesHeadAreas = async (user, userId) => {
  const targetUser = await loadAssignTarget(
    userId,
    REGIONAL_SALES_HEAD,
    "a Regional Sales Head",
  );

  const result = await userModel
    .getRegionalSalesHeadScope(targetUser.UserCode)
    .run();

  return {
    success: true,
    data: {
      userId: targetUser.UserId,
      userCode: targetUser.UserCode,
      groupCodes: result.recordset.map((row) => row.GroupCode),
      groups: result.recordset.map(groupScope),
    },
  };
};

export const getAssignableBranches = async (user, groupCode) => {
  const unscoped = user.Role === SUPERADMIN;

  let group = null;
  if (groupCode !== undefined && groupCode !== null && groupCode !== "") {
    group = Number(groupCode);
    if (!Number.isInteger(group) || group <= 0)
      throwHttpError(400, "groupCode must be a whole number");
  }

  if (unscoped && group === null)
    throwHttpError(
      400,
      "Name a group: /users/assignable-branches?groupCode=1. Without one this answers with every branch in the country.",
    );

  const result = await userModel
    .getAssignableBranches(unscoped ? null : user.UserCode, group)
    .run();

  return { success: true, data: result.recordset.map(assignableBranch) };
};

export const findByUserCode = async (userCode) => {
  const result = await userModel.validateUser(userCode).run();

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0];
};
