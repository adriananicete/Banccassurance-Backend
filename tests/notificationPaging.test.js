import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const NOTIFICATION_MODEL = "../../src/models/notificationModel.js";

const OWNER = "PHL-AO-1168";

// Stubbing the model proves the service passes data through; only captureSql
// catches the model reading the wrong thing. The bell menu was an unpaged
// SELECT until banc.usp_sel_notifications_by_user existed, so these assert the
// move actually landed rather than that the response still looks right.
const build = async (userCode, options) => {
  const { model, queries, inputs } = await captureSql(NOTIFICATION_MODEL);
  await model.getByUserCode(userCode, options).run();
  restoreSqlCapture();

  return { query: queries[0], inputs };
};

const valueOf = (inputs, name) => inputs.find((i) => i.name === name)?.value;

test("the list goes through the procedure, not an inline SELECT", async () => {
  const { query } = await build(OWNER, { PageNumber: 1, PageSize: 20, UnreadOnly: 0 });

  assert.equal(query, "EXEC banc.usp_sel_notifications_by_user");
});

test("no query in this model reads Notifications without a row limit", async () => {
  // The defect being fixed: every notification a user had ever received came
  // back on every load of the bell menu. If a later change reintroduces an
  // inline SELECT here, this is what should fail.
  const { model, queries } = await captureSql(NOTIFICATION_MODEL);

  await model.getByUserCode(OWNER, { PageNumber: 1, PageSize: 20, UnreadOnly: 0 }).run();
  restoreSqlCapture();

  for (const query of queries) {
    assert.doesNotMatch(query, /SELECT[\s\S]*FROM\s+\[?banc\]?\.\[?Notifications\]?/i);
  }
});

test("all four parameters reach the procedure", async () => {
  const { inputs } = await build(OWNER, { PageNumber: 3, PageSize: 50, UnreadOnly: 1 });

  assert.deepEqual(
    inputs.map((i) => i.name).sort(),
    ["PageNumber", "PageSize", "UnreadOnly", "UserCode"],
  );
  assert.equal(valueOf(inputs, "UserCode"), OWNER);
  assert.equal(valueOf(inputs, "PageNumber"), 3);
  assert.equal(valueOf(inputs, "PageSize"), 50);
  assert.equal(valueOf(inputs, "UnreadOnly"), 1);
});

test("the parameter is named @UserCode, matching the procedure", async () => {
  // The old inline query bound @CleanUserCode. The procedure declares
  // @UserCode, and mssql fails at run time on a name it does not know -- which
  // a stubbed model would never show.
  const { inputs } = await build(OWNER, { PageNumber: 1, PageSize: 20, UnreadOnly: 0 });

  assert.equal(valueOf(inputs, "UserCode"), OWNER);
  assert.equal(inputs.some((i) => i.name === "CleanUserCode"), false);
});

test("the writes still use their own statements and are untouched", async () => {
  // markAsRead, markAllAsRead and deleteByUserCode share the table but not the
  // procedure. Moving the read must not have moved them.
  const { model, queries } = await captureSql(NOTIFICATION_MODEL);

  await model.markAsRead(7, OWNER).run();
  await model.markAllAsRead(OWNER).run();
  await model.deleteByUserCode(OWNER).run();
  await model.insert(OWNER, "hello").run();
  restoreSqlCapture();

  assert.equal(queries.length, 4);
  for (const query of queries) {
    assert.doesNotMatch(query, /^EXEC /);
  }
  assert.match(queries[0], /UPDATE[\s\S]*IsRead/i);
  assert.match(queries[1], /UPDATE[\s\S]*IsRead/i);
  assert.match(queries[2], /DELETE/i);
  assert.match(queries[3], /INSERT/i);
});

test("insert still stamps CreatedAt in UTC", async () => {
  // Notifications and AuditLog are UTC; Referrals is server-local. Pinned
  // because the read moving to a procedure is the kind of change that invites
  // tidying the write beside it.
  const { model, queries } = await captureSql(NOTIFICATION_MODEL);

  await model.insert(OWNER, "hello").run();
  restoreSqlCapture();

  assert.match(queries[0], /SYSUTCDATETIME\(\)/);
  assert.doesNotMatch(queries[0], /GETDATE\(\)/);
});
