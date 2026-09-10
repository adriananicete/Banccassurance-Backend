import * as userModel from "../models/userModel.js";
import * as messagingModel from "../models/messagingModel.js";
import { deliver } from "../realtime/socketServer.js";
import { throwHttpError } from "../utils/error.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  GROUP_HEAD,
  messagingRoles,
  REGIONAL_SALES_HEAD,
} from "../utils/constant.js";

const pair = (a, b) => [a, b].sort().join("|");

const sameBranch = async (one, two) =>
  one.BranchCode != null && String(one.BranchCode) === String(two.BranchCode);

const sameGroup = async (one, two) =>
  one.GroupCode != null && String(one.GroupCode) === String(two.GroupCode);

const officerHoldsTheOthersBranch = async (one, two) => {
  const officer = one.Role === ACCOUNT_OFFICER ? one : two;
  const member = one.Role === ACCOUNT_OFFICER ? two : one;

  if (member.BranchCode == null) return false;

  const held = await userModel
    .isBranchInAccountOfficerScope(officer.UserCode, member.BranchCode)
    .run();

  return held.recordset.length > 0;
};

const areaHeadHoldsOfficersGroup = async (one, two) => {
  const head = one.Role === AREA_SALES_HEAD ? one : two;
  const officer = one.Role === AREA_SALES_HEAD ? two : one;

  if (officer.GroupCode == null) return false;

  const inScope = await userModel
    .isAreaInAreaSalesHeadScope(head.UserCode, officer.GroupCode)
    .run();

  return inScope.recordset.length > 0;
};

const areaAndRegionalShareAGroup = async (one, two) => {
  const area = one.Role === AREA_SALES_HEAD ? one : two;
  const regional = one.Role === AREA_SALES_HEAD ? two : one;

  const shared = await userModel
    .shareAGroupAshRsh(area.UserCode, regional.UserCode)
    .run();

  return shared.recordset.length > 0;
};

const edges = {
  [pair(BRANCH_STAFF, BRANCH_STAFF)]: sameBranch,
  [pair(BRANCH_STAFF, BRANCH_HEAD)]: sameBranch,
  [pair(BRANCH_HEAD, BRANCH_HEAD)]: sameBranch,
  [pair(BRANCH_STAFF, ACCOUNT_OFFICER)]: officerHoldsTheOthersBranch,
  [pair(BRANCH_HEAD, ACCOUNT_OFFICER)]: officerHoldsTheOthersBranch,
  [pair(BRANCH_HEAD, GROUP_HEAD)]: sameGroup,
  [pair(GROUP_HEAD, GROUP_HEAD)]: sameGroup,
  [pair(ACCOUNT_OFFICER, ACCOUNT_OFFICER)]: sameGroup,
  [pair(ACCOUNT_OFFICER, AREA_SALES_HEAD)]: areaHeadHoldsOfficersGroup,
  [pair(AREA_SALES_HEAD, REGIONAL_SALES_HEAD)]: areaAndRegionalShareAGroup,
};

export const loadMessagingUser = async (userCode) => {
  const found = await userModel.getUserScopeByCode(userCode).run();

  if (found.recordset.length === 0) return null;

  const row = found.recordset[0];

  return row.IsActive === 1 || row.IsActive === true ? row : null;
};

export const canMessage = async (user, target) => {
  if (!user || !target) return false;
  if (user.UserCode === target.UserCode) return false;

  if (!messagingRoles.includes(user.Role)) return false;
  if (!messagingRoles.includes(target.Role)) return false;

  const holds = edges[pair(user.Role, target.Role)];

  return holds ? holds(user, target) : false;
};

export const assertCanMessage = async (user, targetUserCode) => {
  if (!messagingRoles.includes(user.Role))
    throwHttpError(
      403,
      `Your role cannot use messaging. Only ${messagingRoles.join(", ")} can.`,
    );

  const target = await loadMessagingUser(targetUserCode);

  if (!target) throwHttpError(404, "No such account.");

  if (!(await canMessage(user, target)))
    throwHttpError(403, "You cannot message this person.");

  return target;
};

export const directKeyFor = (one, two) => [one, two].sort().join("|");

export const openDirectConversation = async (user, targetUserCode) => {
  const target = await assertCanMessage(user, targetUserCode);

  const directKey = directKeyFor(user.UserCode, target.UserCode);

  const existing = await messagingModel.findDirectConversation(directKey).run();

  if (existing.recordset.length > 0)
    return { conversation: existing.recordset[0], created: false };

  const created = await messagingModel
    .createDirectConversation(directKey, user.UserCode, target.UserCode)
    .run();

  return { conversation: created.recordset[0], created: true };
};

const MAX_BODY = 4000;

const loadConversation = async (user, conversationId) => {
  const mine = await messagingModel.getParticipation(conversationId, user.UserCode).run();

  if (mine.recordset.length === 0) throwHttpError(404, "Conversation not found.");

  return mine.recordset[0];
};

const receiptsFor = (row) =>
  row
    ? {
        userCode: row.UserCode,
        lastDeliveredAt: row.LastDeliveredAt ?? null,
        lastReadAt: row.LastReadAt ?? null,
      }
    : null;

export const readConversation = async (user, conversationId, options) => {
  await loadConversation(user, conversationId);

  const result = await messagingModel.listMessages(conversationId, options).run();
  const other = await messagingModel.getOtherParticipant(conversationId, user.UserCode).run();

  const totalCount = result.recordset[0]?.TotalCount ?? 0;
  const rows = result.recordset.map(({ TotalCount, ...rest }) => rest);

  return {
    data: rows,
    receipts: receiptsFor(other.recordset[0]),
    pagination: {
      page: options.PageNumber,
      pageSize: options.PageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / options.PageSize),
    },
  };
};

export const sendMessage = async (user, conversationId, body) => {
  const text = typeof body === "string" ? body.trim() : "";

  if (!text) throwHttpError(400, "A message cannot be empty.");
  if (text.length > MAX_BODY)
    throwHttpError(400, `A message cannot be longer than ${MAX_BODY} characters.`);

  await loadConversation(user, conversationId);

  const other = await messagingModel.getOtherParticipant(conversationId, user.UserCode).run();

  if (other.recordset.length === 0)
    throwHttpError(409, "This conversation has nobody else in it.");

  await assertCanMessage(user, other.recordset[0].UserCode);

  const written = await messagingModel
    .insertMessage(conversationId, user.UserCode, text)
    .run();

  const message = written.recordset[0];
  const recipient = other.recordset[0].UserCode;

  let delivered = false;

  try {
    delivered = deliver(recipient, "message:new", { conversationId, message });

    if (delivered) await messagingModel.markDelivered(conversationId, recipient).run();
  } catch (error) {
    console.error(`delivery for message ${message.Id} failed:`, error);
  }

  return { ...message, Delivered: delivered };
};

export const markConversationRead = async (user, conversationId) => {
  await loadConversation(user, conversationId);

  await messagingModel.markRead(conversationId, user.UserCode).run();

  try {
    const other = await messagingModel.getOtherParticipant(conversationId, user.UserCode).run();
    const sender = other.recordset[0]?.UserCode;

    if (sender)
      deliver(sender, "message:read", {
        conversationId,
        readerUserCode: user.UserCode,
        readAt: new Date().toISOString(),
      });
  } catch (error) {
    console.error(`read receipt for conversation ${conversationId} failed:`, error);
  }

  return { success: true, message: "Conversation marked as read." };
};

export const getUnreadCount = async (user) => {
  const result = await messagingModel.unreadCount(user.UserCode).run();

  return { total: result.recordset[0]?.Total ?? 0 };
};

export const listConversations = async (user, options) => {
  const result = await messagingModel.listForUser(user.UserCode, options).run();

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
