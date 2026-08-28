import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, target, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  REGIONAL_SALES_HEAD,
} from "../src/utils/constant.js";

// Found live on 2026-08-28. A Regional Sales Head approved an Area Sales Head
// whose email was "anicete.iandev" -- no domain, accepted at registration. The
// approval committed, then sendApprovalEmail threw and the request answered
// 500 "Server Error".
//
// ⚠️ The account was approved. IsActive was 1 and the queue said APPROVED while
// the caller had been told the request failed, and the retry answered "This user
// has already been approved or rejected" -- which reads as a different problem
// entirely. That is the worst shape a failure can take: the action succeeded,
// the caller was told it did not, and the second attempt blames them.
//
// usp_ins_approve_reject_user commits its own transaction, so nothing here can
// roll the approval back. The notification has to be isolated instead, which is
// what registration already does with sendWelcomeEmail and what safeNotify
// exists for.

const RSH = { Role: REGIONAL_SALES_HEAD, UserCode: "PHL-RSH-00001" };

const approved = rows({
  Success: 1,
  Message: "User approved successfully.",
  FirstName: "Sara",
  Email: "anicete.iandev",
  UserCode: "PHL-ASH-00001",
});

const model = (overrides) => ({
  getUserScopeById: target({ IsActive: 0, Role: AREA_SALES_HEAD, UserCode: "PHL-ASH-00001" }),
  isAshInRegionalScope: rows({ InScope: 1 }),
  approveRejectUser: approved,
  ...overrides,
});

const withEmail = (send) => ({ email: { sendApprovalEmail: send } });

test("an approval that commits is reported as success even if its email fails", async () => {
  const { service } = await withUserService(
    model(),
    withEmail(async () => {
      throw new Error("Failed to send email");
    }),
  );

  const result = await service.approveRejectUser(RSH, 7, "APPROVE");

  assert.equal(result.success, true);
  assert.match(result.message, /approved successfully/i);
});

test("the email is still sent when it can be", async () => {
  // Non-vacuous half: swallowing the call entirely would pass the test above and
  // nobody would ever be told their account was approved.
  let sent = null;

  const { service } = await withUserService(
    model(),
    withEmail(async (...args) => {
      sent = args;
    }),
  );

  await service.approveRejectUser(RSH, 7, "APPROVE");

  assert.deepEqual(sent, ["anicete.iandev", "Sara", "PHL-ASH-00001", "APPROVE"]);
});

test("a refusal from the procedure is still a refusal", async () => {
  // The isolation must not turn Success = 0 into a success. The procedure
  // answers that when the row was already approved or rejected.
  const { service } = await withUserService(
    model({
      approveRejectUser: rows({
        Success: 0,
        Message: "User has already been approved or rejected.",
      }),
    }),
    withEmail(async () => {}),
  );

  const result = await service.approveRejectUser(RSH, 7, "APPROVE");

  assert.equal(result.success, false);
  assert.match(result.message, /already been approved/i);
});

test("an address with no domain is refused at registration, not at approval", async () => {
  // The root cause. "anicete.iandev" passed every check: it is present, it is
  // unique, and nothing looked at its shape. The welcome email then failed
  // silently -- registration already isolates that one -- so the account existed
  // with an address that could never receive anything, and the failure surfaced
  // two steps later on somebody else's request.
  const { service, calls } = await withUserService({
    getAreaSalesHeadByArea: rows({ UserCode: "PHL-ASH-00001" }),
    checkEmployeeNoExists: noRows,
    checkGroupHeadExists: noRows,
  });

  for (const bad of ["anicete.iandev", "no-at-sign", "trailing@", "@leading.com", "spaces in@x.com"]) {
    const error = await captureThrown(() =>
      service.register({
        firstName: "Sara", lastName: "Duterte", birthday: "1985-04-12",
        email: bad, mobileNumber: "09171230005", employeeNo: "2026-123",
        role: ACCOUNT_OFFICER, groupCode: 1,
      }),
    );

    assert.equal(error?.statusCode, 400, bad);
    assert.match(error.message, /valid email/i, bad);
  }

  assert.deepEqual(calls, [], "nothing may be looked up for an unusable address");
});
