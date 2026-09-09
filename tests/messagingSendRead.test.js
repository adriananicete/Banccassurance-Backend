import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { captureThrown } from "./helpers/userService.js";
import messagingRoutes from "../src/routes/messagingRoutes.js";
import { ACCOUNT_OFFICER, BRANCH_STAFF } from "../src/utils/constant.js";

// Sending, reading, and the two watermarks. This is the branch where the
// feature becomes usable -- everything here is HTTP, and the socket in the
// next branch only delivers.

const USER_MODEL = "../../src/models/userModel.js";
const MESSAGING_MODEL = "../../src/models/messagingModel.js";
const MESSAGING = "../../src/services/messagingService.js";

const STAFF = {
  UserCode: "USR-STF-00001",
  Role: BRANCH_STAFF,
  BranchCode: 3,
  GroupCode: 1,
  IsActive: 1,
};

const OFFICER = {
  UserCode: "PHL-AO-00001",
  Role: ACCOUNT_OFFICER,
  BranchCode: null,
  GroupCode: 1,
  IsActive: 1,
};

const written = () => ({
  run: async () => ({
    recordset: [
      {
        Id: 501,
        ConversationId: 12,
        SenderUserCode: STAFF.UserCode,
        Body: "on my way",
        CreatedAt: new Date("2026-09-09T03:00:00.000Z"),
      },
    ],
  }),
});

const affected = () => ({ run: async () => ({ rowsAffected: [1] }) });

const withSend = (overrides = {}, userOverrides = {}) =>
  withStubbedModules(
    {
      [USER_MODEL]: {
        getUserScopeByCode: rows(OFFICER),
        isBranchInAccountOfficerScope: scopeHit,
        ...userOverrides,
      },
      [MESSAGING_MODEL]: {
        getParticipation: rows({ Id: 1, ConversationId: 12, UserCode: STAFF.UserCode }),
        getOtherParticipant: rows({ UserCode: OFFICER.UserCode }),
        insertMessage: written,
        listMessages: rows(),
        markRead: affected,
        unreadCount: rows({ Total: 0 }),
        ...overrides,
      },
    },
    MESSAGING,
  );

// ------------------------------------------------------------- sending

test("an empty or blank message is refused and nothing is written", async () => {
  for (const bad of ["", "   ", "\n\t ", null, undefined, 42]) {
    const { service, calls } = await withSend();

    const error = await captureThrown(() => service.sendMessage(STAFF, 12, bad));

    assert.equal(error?.statusCode, 400, JSON.stringify(bad));
    assert.equal(calls.length, 0, `${JSON.stringify(bad)} must not touch the database`);
  }
});

test("a message longer than the column is refused rather than truncated", async () => {
  // ⚠️ Body is NVARCHAR(4000). SQL Server truncates silently on assignment to a
  // narrower parameter -- the same trap that made @Action NVARCHAR(10) worth a
  // whitelist in PR #132. Refusing is the only way the sender learns.
  const { service, calls } = await withSend();

  const error = await captureThrown(() => service.sendMessage(STAFF, 12, "x".repeat(4001)));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /4000/);
  assert.equal(calls.length, 0);
});

test("the body is trimmed before it is stored", async () => {
  const { service, calls } = await withSend();

  await service.sendMessage(STAFF, 12, "  on my way  ");

  assert.equal(calls.find((c) => c.name === "insertMessage").args[2], "on my way");
});

test("a conversation you are not in is a 404, not a 403", async () => {
  // ⚠️ Deliberate, and the same reasoning as an unknown user code: "you may not
  // read this" confirms the conversation exists to anybody who guesses an id.
  const { service, calls } = await withSend({ getParticipation: rows() });

  const error = await captureThrown(() => service.sendMessage(STAFF, 999, "hello"));

  assert.equal(error?.statusCode, 404);
  assert.equal(calls.some((c) => c.name === "insertMessage"), false);
});

test("⭐ a conversation stays readable after a scope change and stops accepting replies", async () => {
  // The decision this feature was designed around. An Account Officer moved off
  // a branch keeps the history and loses the reply box -- membership is stored,
  // permission is evaluated live on every send.
  const { service, calls } = await withSend({}, { isBranchInAccountOfficerScope: scopeMiss });

  const readable = await service.readConversation(STAFF, 12, { PageNumber: 1, PageSize: 20 });
  assert.deepEqual(readable.data, [], "reading must still work");

  const error = await captureThrown(() => service.sendMessage(STAFF, 12, "still there?"));

  assert.equal(error?.statusCode, 403);
  assert.equal(calls.some((c) => c.name === "insertMessage"), false);
});

test("permission is re-checked against the other participant, not cached", async () => {
  const { service, calls } = await withSend();

  await service.sendMessage(STAFF, 12, "hello");

  const order = calls.map((c) => c.name);

  assert.ok(order.indexOf("getOtherParticipant") < order.indexOf("insertMessage"));
  assert.ok(calls.find((c) => c.name === "getUserScopeByCode"), "the other side was loaded");
});

test("a conversation with nobody else in it is a 409, not a crash", async () => {
  const { service } = await withSend({ getOtherParticipant: rows() });

  const error = await captureThrown(() => service.sendMessage(STAFF, 12, "hello"));

  assert.equal(error?.statusCode, 409);
});

// ------------------------------------------------------------- reading

test("reading strips TotalCount and reports it in pagination", async () => {
  const { service } = await withSend({
    listMessages: rows(
      { Id: 3, Body: "later", TotalCount: 41 },
      { Id: 2, Body: "earlier", TotalCount: 41 },
    ),
  });

  const result = await service.readConversation(STAFF, 12, { PageNumber: 1, PageSize: 20 });

  assert.equal(result.pagination.totalCount, 41);
  assert.equal(result.pagination.totalPages, 3);
  assert.equal("TotalCount" in result.data[0], false);
});

test("reading a conversation you are not in is a 404", async () => {
  const { service, calls } = await withSend({ getParticipation: rows() });

  const error = await captureThrown(() =>
    service.readConversation(STAFF, 999, { PageNumber: 1, PageSize: 20 }),
  );

  assert.equal(error?.statusCode, 404);
  assert.equal(calls.some((c) => c.name === "listMessages"), false);
});

// ------------------------------------------------------- the watermarks

test("⭐ marking read sets delivered as well, in one statement", async () => {
  // Seen implies delivered. A conversation opened without a live event behind
  // it -- a fresh page load -- would otherwise read as seen but never
  // delivered, which is impossible in reality and renders as a defect.
  //
  // Only captureSql can see this: stubbing the model proves markRead was
  // called, not what it sets.
  const { model, queries } = await captureSql(MESSAGING_MODEL);

  await model.markRead(12, STAFF.UserCode).run();

  restoreSqlCapture();

  const sql = queries.join(" ");

  assert.match(sql, /LastReadAt\s*=\s*SYSUTCDATETIME\(\)/i);
  assert.match(sql, /LastDeliveredAt\s*=\s*SYSUTCDATETIME\(\)/i);
  assert.match(sql, /WHERE\s+ConversationId\s*=\s*@ConversationId\s+AND\s+UserCode\s*=\s*@UserCode/i);
});

test("marking read is scoped to the caller's own participant row", async () => {
  const { service, calls } = await withSend();

  await service.markConversationRead(STAFF, 12);

  assert.deepEqual(calls.find((c) => c.name === "markRead").args, [12, STAFF.UserCode]);
});

test("marking a conversation you are not in is a 404", async () => {
  const { service, calls } = await withSend({ getParticipation: rows() });

  const error = await captureThrown(() => service.markConversationRead(STAFF, 999));

  assert.equal(error?.statusCode, 404);
  assert.equal(calls.some((c) => c.name === "markRead"), false);
});

// ------------------------------------------------------- the unread badge

test("the unread badge is one number across every conversation", async () => {
  const { service } = await withSend({ unreadCount: rows({ Total: 7 }) });

  assert.deepEqual(await service.getUnreadCount(STAFF), { total: 7 });
});

test("no unread messages is a zero, not a missing key", async () => {
  const { service } = await withSend({ unreadCount: rows() });

  assert.deepEqual(await service.getUnreadCount(STAFF), { total: 0 });
});

test("the unread count excludes the caller's own messages", async () => {
  // Asserted on the SQL because the exclusion is the whole correctness of a
  // badge: counting your own sends means the icon never reaches zero.
  const { model, queries } = await captureSql(MESSAGING_MODEL);

  await model.unreadCount(STAFF.UserCode).run();

  restoreSqlCapture();

  assert.match(queries.join(" "), /SenderUserCode\s*<>\s*@UserCode/i);
});

// ----------------------------------------------------------- the routes

test("every static path is declared above the first /:id route", async () => {
  // ⚠️ referralRoutes and userRoutes have both been bitten by this. A static
  // path below a param route is swallowed rather than 404, and surfaces as a
  // 400 about a malformed id -- which sends a frontend developer looking in
  // their own code.
  const paths = messagingRoutes.stack.filter((l) => l.route).map((l) => l.route.path);

  const firstParam = paths.findIndex((p) => p.includes("/:id"));
  const staticAfter = paths.slice(firstParam).filter((p) => !p.includes("/:id"));

  assert.notEqual(firstParam, -1, "no /:id route is mounted");
  assert.deepEqual(staticAfter, [], `static paths below /:id: ${staticAfter.join(", ")}`);
});

test("⭐ the message limiter sits below requireAuth, never above it", async () => {
  // keyByUser reads req.user. Above requireAuth there is none, so it degrades
  // to per-IP silently -- which is exactly the behaviour the per-user limiters
  // exist to remove, and it would put a whole branch office in one bucket.
  const layer = messagingRoutes.stack.find(
    (l) => l.route?.path === "/conversations/:id" && l.route?.methods?.post,
  );

  assert.ok(layer, "POST /conversations/:id is not mounted");
  assert.equal(layer.route.stack.length, 4, "requireAuth, requireRole, limiter, handler");

  const captured = {};
  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    json(body) {
      captured.body = body;
    },
  };

  await layer.route.stack[0].handle({ cookies: {} }, res, () => {});

  assert.equal(captured.status, 401, "requireAuth is not first");
  assert.equal(captured.body.message, "Not authenticated");
});

test("sending is the only route carrying the limiter", async () => {
  // A limiter on a read would throttle somebody scrolling their own history.
  for (const [method, path] of [
    ["get", "/conversations"],
    ["get", "/conversations/:id"],
    ["get", "/unread-count"],
  ]) {
    const layer = messagingRoutes.stack.find(
      (l) => l.route?.path === path && l.route?.methods?.[method],
    );

    assert.equal(layer.route.stack.length, 3, `${method} ${path}`);
  }
});
