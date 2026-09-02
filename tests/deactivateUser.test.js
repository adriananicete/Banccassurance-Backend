import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, target, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const superadmin = { Role: SUPERADMIN, UserCode: "SYS-ADM-0001" };

const changed = rows({
  Success: 1,
  Message: "User DEACTIVATED successfully.",
  FirstName: "Test",
  Email: "x@example.com",
  UserCode: "PHL-AO-1168",
});

// An approved account: IsActive 1 and an AgentCode minted by APPROVE. AgentCode
// is BIGINT and generated as ISNULL(MAX(AgentCode), 600000) + 1, so it is a
// number in the 600001 range rather than a formatted string.
const approvedTarget = (overrides) =>
  target({ IsActive: 1, AgentCode: 600042, ...overrides });

const acting = (targetStub) => ({
  getUserScopeById: targetStub,
  approveRejectUser: changed,
});

test("an unknown action is refused before the database is touched", async () => {
  // approveRejectUser passed @Action through to the procedure unvalidated. That
  // was harmless while APPROVE and REJECT were the only two the procedure knew;
  // with four actions and two of them destructive, a typo reaching the procedure
  // is a state change nobody named.
  const { service, calls } = await withUserService(acting(approvedTarget()));

  const error = await captureThrown(() =>
    service.approveRejectUser(superadmin, 1784, "DEACTIVE"),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /unknown action/i);
  assert.deepEqual(calls, []);
});

test("an action longer than the procedure's parameter cannot truncate into a real one", async () => {
  // @Action is NVARCHAR(10) and DEACTIVATE is exactly ten characters, so the
  // procedure's parameter has no headroom. userModel binds sql.NVarChar with no
  // length, and SQL Server truncates silently on assignment to a narrower
  // parameter -- so "DEACTIVATEX" would arrive as "DEACTIVATE" and revoke an
  // account. The whitelist runs before the bind, which is what closes it.
  const { service, calls } = await withUserService(acting(approvedTarget()));

  const error = await captureThrown(() =>
    service.approveRejectUser(superadmin, 1784, "DEACTIVATEX"),
  );

  assert.equal(error?.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("the action is normalised the way the procedure normalises it", async () => {
  // The procedure runs UPPER(LTRIM(RTRIM(@Action))) before it compares, so
  // lowercase and padded actions have always worked. Validating the raw string
  // would refuse callers the procedure accepts today -- a new restriction this
  // branch has no reason to introduce -- so the service normalises first and
  // sends the normalised value on.
  const { service, calls } = await withUserService(acting(approvedTarget()));

  const result = await service.approveRejectUser(superadmin, 1784, "  deactivate  ");

  assert.equal(result.success, true);
  assert.deepEqual(
    calls.find((call) => call.name === "approveRejectUser").args,
    [1784, "DEACTIVATE"],
  );
});

test("only a superadmin may deactivate or reactivate", async () => {
  // Every one of these roles may approve somebody, and requireRole lets all of
  // them reach this service. The registration hierarchy does not carry over to
  // revoking access -- that decision was taken 2026-09-02 and lives here, not on
  // the route, because the route cannot see which action was asked for.
  const approvers = [
    BRANCH_HEAD,
    GROUP_HEAD,
    SECTOR_HEAD,
    DEPARTMENT_HEAD,
    REGIONAL_SALES_HEAD,
    AREA_SALES_HEAD,
  ];

  for (const role of approvers) {
    for (const action of ["DEACTIVATE", "REACTIVATE"]) {
      const { service, calls } = await withUserService(acting(approvedTarget()));

      const error = await captureThrown(() =>
        service.approveRejectUser({ Role: role, UserCode: "USR-X-0001" }, 1784, action),
      );

      assert.equal(error?.statusCode, 403, `${role} ${action}`);
      assert.match(error.message, /only a superadmin/i, `${role} ${action}`);
      assert.equal(
        calls.some((call) => call.name === "approveRejectUser"),
        false,
        `${role} ${action} reached the procedure`,
      );
    }
  }
});

test("a superadmin deactivates an approved account", async () => {
  const { service, calls } = await withUserService(acting(approvedTarget()));

  const result = await service.approveRejectUser(superadmin, 1784, "DEACTIVATE");

  assert.equal(result.success, true);
  assert.deepEqual(
    calls.find((call) => call.name === "approveRejectUser").args,
    [1784, "DEACTIVATE"],
  );
});

test("only an approved account can be deactivated, and the refusal names the right action", async () => {
  // These refuse here rather than at the procedure, so they must not be less
  // useful than the procedure's own messages -- it answers "Pending users cannot
  // be deactivated. Use REJECT." and intercepting it with something vaguer would
  // be a downgrade.
  const cases = [
    [false, /reject it instead/i],
    [0, /reject it instead/i],
    [-1, /already inactive/i],
  ];

  for (const [IsActive, expected] of cases) {
    const { service } = await withUserService(acting(approvedTarget({ IsActive })));

    const error = await captureThrown(() =>
      service.approveRejectUser(superadmin, 1784, "DEACTIVATE"),
    );

    assert.equal(error?.statusCode, 400, `IsActive ${JSON.stringify(IsActive)}`);
    assert.match(error.message, expected, `IsActive ${JSON.stringify(IsActive)}`);
  }
});

test("only a deactivated account can be reactivated, and the refusal names the right action", async () => {
  const cases = [
    [true, /already active/i],
    [1, /already active/i],
    [false, /approve it instead/i],
    [0, /approve it instead/i],
  ];

  for (const [IsActive, expected] of cases) {
    const { service } = await withUserService(acting(approvedTarget({ IsActive })));

    const error = await captureThrown(() =>
      service.approveRejectUser(superadmin, 1784, "REACTIVATE"),
    );

    assert.equal(error?.statusCode, 400, `IsActive ${JSON.stringify(IsActive)}`);
    assert.match(error.message, expected, `IsActive ${JSON.stringify(IsActive)}`);
  }
});

test("a rejected registration cannot be reactivated into an approved account", async () => {
  // This is the guard the whole branch exists for. IsActive = -1 means two
  // different things -- refused at registration, and revoked after approval --
  // and REACTIVATE would otherwise turn the first into an active account,
  // bypassing the approval chain entirely and leaving it live with no AgentCode.
  //
  // AgentCode is what tells them apart: it is minted on APPROVE and never
  // cleared, so it is a durable record of "approved at least once", which is the
  // question IsActive cannot answer.
  //
  // The check is `== null` rather than a falsy test because the column is BIGINT
  // and 0 is a number it could hold.
  for (const AgentCode of [null, undefined]) {
    const { service, calls } = await withUserService(
      acting(approvedTarget({ IsActive: -1, AgentCode })),
    );

    const error = await captureThrown(() =>
      service.approveRejectUser(superadmin, 1784, "REACTIVATE"),
    );

    assert.equal(error?.statusCode, 400, `AgentCode ${JSON.stringify(AgentCode)}`);
    assert.match(error.message, /rejected at registration/i);
    assert.equal(
      calls.some((call) => call.name === "approveRejectUser"),
      false,
      "the procedure was reached",
    );
  }
});

test("a deactivated account that was once approved is reactivated", async () => {
  // The other half of the guard above. Without this, refusing every -1 row would
  // read as correct and reactivation would never work at all.
  const { service, calls } = await withUserService(
    acting(approvedTarget({ IsActive: -1, AgentCode: "AG-00042" })),
  );

  const result = await service.approveRejectUser(superadmin, 1784, "REACTIVATE");

  assert.equal(result.success, true);
  assert.deepEqual(
    calls.find((call) => call.name === "approveRejectUser").args,
    [1784, "REACTIVATE"],
  );
});

test("nobody changes the status of their own account", async () => {
  // The superadmin branch has carried this guard since before any action could
  // fire it. It now applies to every caller and every action: the check sits
  // above the role branches rather than inside one of them.
  for (const action of ["APPROVE", "REJECT", "DEACTIVATE", "REACTIVATE"]) {
    const { service } = await withUserService(
      acting(approvedTarget({ UserCode: "SYS-ADM-0001" })),
    );

    const error = await captureThrown(() =>
      service.approveRejectUser(superadmin, 1784, action),
    );

    assert.equal(error?.statusCode, 400, action);
    assert.match(error.message, /your own account/i, action);
  }
});

test("no registration email is sent when an account is deactivated or reactivated", async () => {
  // sendApprovalEmail renders "Your Registration has been Rejected" for anything
  // that is not APPROVE, so reaching it with DEACTIVATE would tell a working
  // employee their registration was refused.
  for (const [action, IsActive] of [["DEACTIVATE", 1], ["REACTIVATE", -1]]) {
    const sent = [];
    const { service } = await withUserService(acting(approvedTarget({ IsActive })), {
      email: { sendApprovalEmail: async (...args) => sent.push(args) },
    });

    const result = await service.approveRejectUser(superadmin, 1784, action);

    assert.equal(result.success, true, action);
    assert.deepEqual(sent, [], action);
  }
});

test("each action is audited under its own name", async () => {
  const cases = [
    ["DEACTIVATE", 1, "USER_DEACTIVATED"],
    ["REACTIVATE", -1, "USER_REACTIVATED"],
  ];

  for (const [action, IsActive, expected] of cases) {
    const recorded = [];
    const { service } = await withUserService(acting(approvedTarget({ IsActive })), {
      audit: { record: async (entry) => recorded.push(entry) },
    });

    await service.approveRejectUser(superadmin, 1784, action);

    assert.equal(recorded.length, 1, action);
    assert.equal(recorded[0].action, expected);
    assert.equal(recorded[0].actorUserCode, "SYS-ADM-0001");
    assert.equal(recorded[0].entityId, "PHL-AO-1168");
  }
});

test("a refusal from the procedure is passed back rather than audited", async () => {
  // The procedure guards the source value again in its own UPDATE. If it ever
  // disagrees with the checks above, Success = 0 must not leave an audit row
  // claiming a change that did not happen.
  const recorded = [];
  const { service } = await withUserService(
    {
      getUserScopeById: approvedTarget(),
      approveRejectUser: rows({ Success: 0, Message: "Account is not active." }),
    },
    { audit: { record: async (entry) => recorded.push(entry) } },
  );

  const result = await service.approveRejectUser(superadmin, 1784, "DEACTIVATE");

  assert.equal(result.success, false);
  assert.equal(result.message, "Account is not active.");
  assert.deepEqual(recorded, []);
});

test("an empty recordset is a 500 rather than a crash", async () => {
  // The old code destructured result.recordset[0] unguarded, so a procedure that
  // returned no rows threw a TypeError and answered 500 with a stack rather than
  // a message.
  const { service } = await withUserService({
    getUserScopeById: approvedTarget(),
    approveRejectUser: rows(),
  });

  const error = await captureThrown(() =>
    service.approveRejectUser(superadmin, 1784, "DEACTIVATE"),
  );

  assert.equal(error?.statusCode, 500);
  assert.match(error.message, /could not be changed/i);
});

test("the registration actions are untouched by the new branch", async () => {
  // DEACTIVATE and REACTIVATE return before the approval hierarchy is consulted.
  // This asserts the hierarchy still runs for APPROVE, so the early return
  // cannot quietly swallow it.
  const { service } = await withUserService({
    getUserScopeById: target({ Role: ACCOUNT_OFFICER, IsActive: 0 }),
    approveRejectUser: changed,
  });

  const error = await captureThrown(() =>
    service.approveRejectUser({ Role: SECTOR_HEAD, UserCode: "USR-SEC-0001" }, 1784, "APPROVE"),
  );

  assert.equal(error?.statusCode, 403);
});
