import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const USER_MODEL = "../../src/models/userModel.js";

const AUDIT = {
  actorUserCode: "PHL-ASH-0005",
  action: "BRANCHES_ASSIGNED",
  entityType: "SCOPE",
  entityId: "PHL-AO-1170",
  detail: "58,59",
};

// The three replace* functions open their own transaction and now write the
// audit row on it. Stubbing the model proves the service passes the entry down;
// only this can show the row lands inside the transaction rather than beside it.
const runReplace = async (fn, args) => {
  const { model, transactions, inputs } = await captureSql(USER_MODEL);
  await model[fn](...args).run();
  restoreSqlCapture();

  return { tx: transactions[0], inputs };
};

test("the audit insert happens on the transaction, between the write and the commit", async () => {
  const { tx } = await runReplace("replaceAccountOfficerBranches", [
    "PHL-AO-1170",
    "58,59",
    AUDIT,
  ]);

  assert.ok(tx, "no transaction was opened");
  assert.equal(tx.events[0], "begin");
  assert.equal(tx.events[tx.events.length - 1], "commit");

  const audit = tx.events.findIndex((e) => /INSERT INTO \[banc\]\.\[AuditLog\]/i.test(e));
  const scopeWrite = tx.events.findIndex((e) => /INSERT INTO banc\.account_officer_branches/i.test(e));

  assert.ok(audit > -1, "the audit row was not written on this transaction");
  assert.ok(scopeWrite > -1);
  assert.ok(audit > scopeWrite, "the audit row must follow the change it describes");
  assert.ok(audit < tx.events.length - 1, "the audit row must precede the commit");
});

test("all three replace functions behave the same way", async () => {
  const cases = [
    ["replaceAccountOfficerBranches", ["PHL-AO-1170", "58", AUDIT], /account_officer_branches/i],
    ["replaceAreaSalesHeadAreas", ["PHL-ASH-1167", "5", AUDIT], /area_sales_head_areas/i],
    ["replaceRegionalSalesHeadAreas", ["PHL-RSH-1164", "1", AUDIT], /regional_sales_head_areas/i],
  ];

  for (const [fn, args, table] of cases) {
    const { tx } = await runReplace(fn, args);

    const statements = tx.events.filter((e) => e !== "begin" && e !== "commit");
    assert.equal(statements.length, 3, `${fn}: expected DELETE, INSERT, audit`);
    assert.match(statements[0], /^\s*DELETE/i, fn);
    assert.match(statements[0], table, fn);
    assert.match(statements[2], /INSERT INTO \[banc\]\.\[AuditLog\]/i, fn);
  }
});

// Do not assert on `inputs` for the audit row here. captureSql re-imports the
// module under test with a changing query string, but the modules *it* imports
// resolve to the cached copy -- so auditModel stays bound to the fake sql from
// the first capture in this file and its parameters land in that call's array,
// not the current one. Its parameter binding is covered in auditLog.test.js,
// which imports auditModel directly. The transaction assertions below are
// unaffected, because the transaction arrives as an argument.

test("the audit row is still stamped in UTC", async () => {
  // Notifications and AuditLog are UTC; Referrals is server-local. Moving the
  // insert into another module is exactly when that gets rewritten by accident.
  const { tx } = await runReplace("replaceAccountOfficerBranches", [
    "PHL-AO-1170",
    "58",
    AUDIT,
  ]);

  const audit = tx.events.find((e) => /INSERT INTO \[banc\]\.\[AuditLog\]/i.test(e));

  assert.match(audit, /SYSUTCDATETIME\(\)/);
  assert.doesNotMatch(audit, /GETDATE\(\)/);
});
