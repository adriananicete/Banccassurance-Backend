import jwt from "jsonwebtoken";
import * as userModel from "../models/userModel.js";

export const readAuthCookie = (header) => {
  if (typeof header !== "string" || header === "") return null;

  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;

    if (part.slice(0, at).trim() === "auth_token")
      return decodeURIComponent(part.slice(at + 1).trim()) || null;
  }

  return null;
};

export const authenticateHandshake = async (cookieHeader) => {
  const token = readAuthCookie(cookieHeader);

  if (!token) return null;

  let claims;

  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  const userId = Number(claims.UserId);

  if (!Number.isInteger(userId)) return null;

  const result = await userModel.getUserScopeById(userId).run();
  const account = result.recordset[0];

  if (!account) return null;
  if (account.IsActive !== 1 && account.IsActive !== true) return null;

  return {
    UserId: account.UserId,
    UserCode: account.UserCode,
    FullName: account.FullName,
    Role: account.Role,
    BranchCode: account.BranchCode,
    GroupCode: account.GroupCode,
  };
};

export const isStillActive = async (userId) => {
  const result = await userModel.getUserScopeById(userId).run();
  const account = result.recordset[0];

  return Boolean(account) && (account.IsActive === 1 || account.IsActive === true);
};
