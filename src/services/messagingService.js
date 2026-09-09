import * as userModel from "../models/userModel.js";
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
