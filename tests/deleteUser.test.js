import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import { SUPERADMIN, ACCOUNT_OFFICER } from "../src/utils/constant.js";

// A UAT convenience: clearing a test account used to mean asking the DBA, whose
// login is the only one that can write. It is deliberately narrow, because a
// delete-any-account route reachable over HTTP sits behind the one credential
// that is both the most powerful in the system and still seeded with a
// guessable password -- CONTEXT.md records password123 as a pre-production item.

const USER_MODEL = "../../src/models/userModel.js";

const ADMIN = { UserId: 1, UserCode: "SYS-ADM-00001", Role: SUPERADMIN };

const target = (overrides) =>
  rows({
    UserId: 1784,
    UserCode: "PHL-AO-00003",
    IsActive: 1,
    Role: ACCOUNT_OFFICER,
    BranchCode: null,
    GroupCode: 1,
    ...overrides,
  });

const model = (overrides) => ({
  getUserScopeById: target(),
  countUsersByRole: rows({ Total: 2 }),
  deleteUser: () => ({ run: async () => {} }),
  ...overrides,
});

test("a superadmin deletes an account, and the deletion is audited", async () => {
  const { service, calls } = await withUserService(model());

  const result = await service.deleteUser(ADMIN, 1784);

  assert.equal(result.success, true);
  assert.equal(result.userCode, "PHL-AO-00003");

  const [, userCode, audit] = calls.find((c) => c.name === "deleteUser").args;
  assert.equal(userCode, "PHL-AO-00003");
  assert.equal(audit.action, "USER_DELETED");
  assert.equal(audit.actorUserCode, "SYS-ADM-00001");
  assert.equal(audit.entityId, "PHL-AO-00003");
});

test("the last superadmin cannot be deleted", async () => {
  // Bootstrap lockout, and it is unrecoverable from inside the application.
  // getSuperadmins is the approver lookup for SECTOR_HEAD and DEPARTMENT_HEAD,
  // so with no superadmin left nobody can ever create either role again --
  // POST /users is guarded by requireRole(SUPERADMIN) and /users/register
  // answers 400 for want of an approver. Only a database insert recovers it.
  const { service } = await withUserService(
    model({
      getUserScopeById: target({ UserCode: "SYS-ADM-00002", Role: SUPERADMIN }),
      countUsersByRole: rows({ Total: 1 }),
    }),
  );

  const error = await captureThrown(() => service.deleteUser(ADMIN, 2));

  assert.equal(error.statusCode, 409);
  assert.match(error.message, /only superadmin/);
});

test("a second superadmin can be deleted, so the guard is a count and not a role ban", async () => {
  // Non-vacuous half: refusing every superadmin would pass the test above.
  const { service } = await withUserService(
    model({
      getUserScopeById: target({ UserCode: "SYS-ADM-00002", Role: SUPERADMIN }),
      countUsersByRole: rows({ Total: 2 }),
    }),
  );

  const result = await service.deleteUser(ADMIN, 2);

  assert.equal(result.success, true);
});

test("a superadmin cannot delete themselves", async () => {
  const { service } = await withUserService(
    model({ getUserScopeById: target({ UserCode: "SYS-ADM-00001", Role: SUPERADMIN }) }),
  );

  const error = await captureThrown(() => service.deleteUser(ADMIN, 1));

  assert.equal(error.statusCode, 400);
  assert.match(error.message, /your own account/);
});

test("a foreign key violation answers 409 rather than 500", async () => {
  // Referrals.AOCode and .ReferrerCode carry NO_ACTION foreign keys, so an
  // account that has touched a referral cannot be deleted. Without this the
  // driver's error reaches errorHandler with no statusCode and renders as
  // "Server Error", which reads as a bug in the endpoint rather than a rule.
  const { service } = await withUserService(
    model({
      deleteUser: () => ({
        run: async () => {
          const error = new Error("The DELETE statement conflicted...");
          error.number = 547;
          throw error;
        },
      }),
    }),
  );

  const error = await captureThrown(() => service.deleteUser(ADMIN, 1784));

  assert.equal(error.statusCode, 409);
  assert.match(error.message, /referrals/i);
});

const inProduction = async (action) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    return await action();
  } finally {
    process.env.NODE_ENV = previous;
  }
};

test("in production an approved account cannot be deleted", async () => {
  // Deletion is irreversible and an approved account has history behind it --
  // a login, maybe referrals. Deactivation is the tool for those, once A17
  // lands. Until then production simply refuses.
  const { service } = await withUserService(model());

  const error = await inProduction(() =>
    captureThrown(() => service.deleteUser(ADMIN, 1784)),
  );

  assert.equal(error.statusCode, 403);
  assert.match(error.message, /Deactivate an approved account instead/);
});

test("in production a pending registration can still be deleted", async () => {
  // The case this endpoint exists for, and the one that keeps happening: a
  // registration with a typo in the email. Email, UserCode and EmployeeNo are
  // all unique-constrained, so a wrong row holds that address permanently and
  // the person cannot re-register until it goes. A pending account has no
  // login, no referrals and no history -- removing it cancels a mistake rather
  // than erasing a record.
  const { service } = await withUserService(
    model({ getUserScopeById: target({ IsActive: 0 }) }),
  );

  const result = await inProduction(() => service.deleteUser(ADMIN, 1784));

  assert.equal(result.success, true);
  assert.equal(result.userCode, "PHL-AO-00003");
});

test("outside production an approved account is deletable, so the gate is the environment", async () => {
  // Non-vacuous half: refusing every approved account everywhere would pass the
  // production test above and quietly remove the whole point of the endpoint.
  const { service } = await withUserService(model());

  const result = await service.deleteUser(ADMIN, 1784);

  assert.equal(result.success, true);
});

test("a missing user is a 404 and a non-numeric id is a 400", async () => {
  // asInt returns NaN for "abc", and sql.Int refuses NaN before the query is
  // sent -- the EPARAM 500 that PR #116 removed from registration.
  const { service } = await withUserService(model({ getUserScopeById: noRows }));

  assert.equal((await captureThrown(() => service.deleteUser(ADMIN, 9999))).statusCode, 404);
  assert.equal((await captureThrown(() => service.deleteUser(ADMIN, "abc"))).statusCode, 400);
});

test("the delete removes every table the application writes, in one transaction", async () => {
  // Stubbing the model proves the service passes data through; only captureSql
  // catches a child table missed. An orphaned notification or junction row
  // would not error -- it would sit there pointing at nobody.
  const { model: sqlModel, transactions } = await captureSql(USER_MODEL);

  await sqlModel
    .deleteUser(1784, "PHL-AO-00003", {
      actorUserCode: "SYS-ADM-00001",
      action: "USER_DELETED",
      entityType: "USER",
      entityId: "PHL-AO-00003",
      detail: ACCOUNT_OFFICER,
    })
    .run();

  restoreSqlCapture();

  const events = transactions[0].events;

  assert.equal(events[0], "begin");
  assert.equal(events[events.length - 1], "commit");

  const at = (needle) => events.findIndex((e) => e.includes(needle));

  for (const table of [
    "banc.Notifications",
    "banc.account_officer_branches",
    "banc.area_sales_head_areas",
    "banc.regional_sales_head_areas",
  ]) {
    assert.notEqual(at(table), -1, `${table} is never deleted from`);
    // Children before the parent, whatever the foreign keys happen to allow.
    assert.ok(at(table) < at("[banc].[Users]") || at("banc.Users") > at(table));
  }

  // The audit row is written inside the same transaction and before the user
  // row goes, so a rollback takes the audit with it and the actor is recorded
  // while the subject still exists.
  assert.notEqual(at("AuditLog"), -1);
  assert.ok(at("AuditLog") < at("DELETE FROM banc.Users"));
});
