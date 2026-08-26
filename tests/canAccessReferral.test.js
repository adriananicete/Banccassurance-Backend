import test from "node:test";
import assert from "node:assert/strict";
import { canAccessReferral } from "../src/services/referralService.js";
import {
  ACCOUNT_OFFICER,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
} from "../src/utils/constant.js";

const referral = (overrides) => ({
  ReferrerCode: "USR-STF-0115",
  BranchCode: 58,
  AreaCode: 5,
  AOCode: "PHL-AO-0001",
  ...overrides,
});

test("Branch Staff reach their own referrals and no others", async () => {
  const user = { Role: BRANCH_STAFF, UserCode: "USR-STF-0115" };
  assert.equal(await canAccessReferral(referral(), user), true);
  assert.ok(!(await canAccessReferral(referral({ ReferrerCode: "USR-STF-0999" }), user)));
});

test("Branch Head reach their own branch and no others", async () => {
  const user = { Role: BRANCH_HEAD, UserCode: "USR-BRH-0058", BranchCode: 58 };
  assert.equal(await canAccessReferral(referral(), user), true);
  assert.ok(!(await canAccessReferral(referral({ BranchCode: 59 }), user)));
});

test("Account Officers reach referrals assigned to them, including ones referred by Landbank staff", async () => {
  const user = { Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-0001" };
  assert.equal(await canAccessReferral(referral(), user), true);
  assert.ok(!(await canAccessReferral(referral({ AOCode: "PHL-AO-0002" }), user)));
});

test("Group Head area comparison holds whether the codes arrive as numbers or strings", async () => {
  // The two sides carry different names now: the session's GroupCode against
  // Referrals.AreaCode, which has not been renamed. Both are INT columns, so the
  // schema mismatch this once guarded against is gone. The comparison stays
  // type-tolerant on purpose: the JWT is JSON and a query string is text, so
  // neither side can be relied on to preserve the column's type.
  const user = { Role: GROUP_HEAD, UserCode: "USR-GRH-0001", GroupCode: "5" };
  assert.equal(await canAccessReferral(referral({ AreaCode: 5 }), user), true);
  assert.equal(await canAccessReferral(referral({ AreaCode: "5" }), user), true);
  assert.ok(!(await canAccessReferral(referral({ AreaCode: 4 }), user)));
});

test("a Group Head session carrying only the old AreaCode is refused, not admitted", async () => {
  // undefined stringifies to "undefined", which matches no referral, so the
  // stale key fails closed rather than open. Asserting it keeps a silent revert
  // from looking like a pass.
  const stale = { Role: GROUP_HEAD, UserCode: "USR-GRH-0001", AreaCode: "5" };
  assert.ok(!(await canAccessReferral(referral({ AreaCode: 5 }), stale)));
});

const departmentHead = { Role: DEPARTMENT_HEAD, UserCode: "PHL-DH-0001" };

test("Department Head reach a referral their own AO is working, even when Landbank staff referred it", async () => {
  const row = referral({ ReferrerCode: "USR-STF-0115", AOCode: "PHL-AO-0001" });
  assert.equal(await canAccessReferral(row, departmentHead), true);
});

test("Department Head tenant check reads AOCode, not ReferrerCode", async () => {
  const otherTenant = referral({ ReferrerCode: "PHL-AO-0001", AOCode: "USR-STF-0115" });
  assert.ok(!(await canAccessReferral(otherTenant, departmentHead)));
});

test("Department Head are denied, not errored, when AOCode is not a user code", async () => {
  assert.ok(!(await canAccessReferral(referral({ AOCode: "as-123" }), departmentHead)));
  assert.ok(!(await canAccessReferral(referral({ AOCode: null }), departmentHead)));
  assert.ok(!(await canAccessReferral(referral({ AOCode: "" }), departmentHead)));
});

test("an unrecognised role is denied", async () => {
  assert.ok(!(await canAccessReferral(referral(), { Role: "SOMETHING_ELSE", UserCode: "PHL-XX-0001" })));
});
