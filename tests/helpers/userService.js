import { withStubbedModules, rows } from "./stubModel.js";

const USER_MODEL = "../../src/models/userModel.js";
const EMAIL_SERVICE = "../../src/services/emailService.js";
const USER_SERVICE = "../../src/services/userService.js";

const silentEmail = {
  sendOtpEmail: async () => {},
  sendWelcomeEmail: async () => {},
  sendApprovalEmail: async () => {},
};

export const withUserService = (userModel) =>
  withStubbedModules(
    { [USER_MODEL]: userModel, [EMAIL_SERVICE]: silentEmail },
    USER_SERVICE,
  );

export const noRows = () => ({ run: async () => ({ recordset: [] }) });

export const target = (overrides) =>
  rows({
    UserId: 1784,
    UserCode: "PHL-AO-1168",
    IsActive: false,
    Role: "ACCOUNT_OFFICER",
    BranchCode: null,
    AreaCode: "5",
    ...overrides,
  });

export const captureThrown = async (action) => {
  try {
    await action();
    return null;
  } catch (error) {
    return error;
  }
};
