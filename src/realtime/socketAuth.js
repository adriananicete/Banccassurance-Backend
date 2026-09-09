import jwt from "jsonwebtoken";
import * as userModel from "../models/userModel.js";

// The handshake carries the raw Cookie header rather than a parsed object, and
// cookie-parser never runs on it. Reading the one cookie we need by hand keeps
// this off a transitive dependency.
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

// Exactly what requireAuth does, and for the same reason: the token is an
// identity assertion and every authorisation value is read from the row.
//
// ⚠️ A socket then holds that answer for as long as it stays open, which is the
// problem PR #119 exists to prevent on the HTTP side. Sending is safe because
// it goes over HTTP and re-reads the row; receiving is not, which is what the
// sweep in socketServer.js is for.
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
