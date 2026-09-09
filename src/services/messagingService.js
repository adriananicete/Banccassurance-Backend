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

// The permission rule, and it lives here and nowhere else.
//
// Every pair that may talk is a key; anything absent is refused. An earlier
// draft derived this from "their scopes intersect" and that was too loose --
// it let a Branch Staff reach any Account Officer in their group, when the
// rule is the one officer who holds their branch.
//
// A Sector Head, a Department Head and a superadmin are not here at all. They
// oversee and approve; they have no working relationship to hold a conversation
// in. That is enforced at the route as well, so the refusal is a 403 rather
// than an empty contact list.
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

  // A deactivated or unknown account is a 404 rather than a 403: refusing with
  // "you may not talk to them" would confirm the account exists to anybody who
  // guessed a user code.
  if (!target) throwHttpError(404, "No such account.");

  if (!(await canMessage(user, target)))
    throwHttpError(403, "You cannot message this person.");

  return target;
};

// The two user codes SORTED, which is what makes UX_conversations_Direct work.
// Unsorted, 'A|B' and 'B|A' are different strings and the unique index permits
// exactly the duplicate it exists to prevent. The index cannot check this --
// it is the application's job and this one line is all of it.
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

// Membership is stored; permission is live. You are in the conversation because
// you were added, and you may post because the rule still holds -- so an
// Account Officer moved off a branch keeps the history and loses the reply box.
const loadConversation = async (user, conversationId) => {
  const mine = await messagingModel.getParticipation(conversationId, user.UserCode).run();

  if (mine.recordset.length === 0) throwHttpError(404, "Conversation not found.");

  return mine.recordset[0];
};

export const readConversation = async (user, conversationId, options) => {
  await loadConversation(user, conversationId);

  const result = await messagingModel.listMessages(conversationId, options).run();

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

export const sendMessage = async (user, conversationId, body) => {
  const text = typeof body === "string" ? body.trim() : "";

  if (!text) throwHttpError(400, "A message cannot be empty.");
  if (text.length > MAX_BODY)
    throwHttpError(400, `A message cannot be longer than ${MAX_BODY} characters.`);

  await loadConversation(user, conversationId);

  const other = await messagingModel.getOtherParticipant(conversationId, user.UserCode).run();

  if (other.recordset.length === 0)
    throwHttpError(409, "This conversation has nobody else in it.");

  // Re-checked on every send, never cached onto the row. This is the half that
  // makes a conversation readable but not replyable after a scope change.
  await assertCanMessage(user, other.recordset[0].UserCode);

  const written = await messagingModel
    .insertMessage(conversationId, user.UserCode, text)
    .run();

  const message = written.recordset[0];
  const recipient = other.recordset[0].UserCode;

  // The message is stored. Everything below is delivery, and delivery must
  // never fail a send that has already succeeded -- the rule safeNotify follows
  // next door, for the same reason.
  let delivered = false;

  try {
    delivered = deliver(recipient, "message:new", { conversationId, message });

    // "Delivered" means it reached them, so only a live connection sets the
    // watermark. Offline leaves it, and the sender sees "sent" until the
    // recipient comes back.
    if (delivered) await messagingModel.markDelivered(conversationId, recipient).run();
  } catch (error) {
    console.error(`delivery for message ${message.Id} failed:`, error);
  }

  return { ...message, Delivered: delivered };
};

export const markConversationRead = async (user, conversationId) => {
  await loadConversation(user, conversationId);

  await messagingModel.markRead(conversationId, user.UserCode).run();

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
