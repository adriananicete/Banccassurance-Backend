import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { withStubbedModules, rows, scopeHit } from "./helpers/stubModel.js";
import { readAuthCookie } from "../src/realtime/socketAuth.js";
import { ACCOUNT_OFFICER, BRANCH_STAFF } from "../src/utils/constant.js";

// ⚠️ What this file does NOT do, deliberately: it does not open a socket.
// There is no socket client in devDependencies and the suite runs with no
// database and no .env, so a handshake cannot be exercised the way every other
// path here is. A test that stood up a mock server and asserted it talked to
// itself would prove nothing.
//
// What can be asserted is the part that matters -- the handshake refuses a
// missing cookie, a forged token and a deactivated row, exactly as
// liveSessionAuthz.test.js asserts for requireAuth -- and that a delivery
// failure never fails a send that has already been stored.

const USER_MODEL = "../../src/models/userModel.js";
const MESSAGING_MODEL = "../../src/models/messagingModel.js";
const SOCKET_SERVER = "../../src/realtime/socketServer.js";
const SOCKET_AUTH = "../../src/realtime/socketAuth.js";
const MESSAGING = "../../src/services/messagingService.js";

process.env.JWT_SECRET = "test-secret";

const account = (overrides = {}) => ({
  UserId: 31,
  UserCode: "USR-STF-00001",
  FullName: "Maricel Bautista Aquino",
  IsActive: 1,
  Role: BRANCH_STAFF,
  BranchCode: 3,
  GroupCode: 1,
  ...overrides,
});

const tokenFor = (claims = {}) =>
  jwt.sign({ UserId: 31, ...claims }, process.env.JWT_SECRET);

const cookieOf = (token) => `theme=dark; auth_token=${token}; other=1`;

const withAuth = (row) =>
  withStubbedModules(
    { [USER_MODEL]: { getUserScopeById: row === null ? rows() : rows(row) } },
    SOCKET_AUTH,
  );

// ------------------------------------------------------- the cookie header

test("the auth cookie is read out of a raw header, among others", async () => {
  // socket.io hands over the raw Cookie header and cookie-parser never runs on
  // it. Reading it by hand keeps this off a transitive dependency.
  assert.equal(readAuthCookie("auth_token=abc"), "abc");
  assert.equal(readAuthCookie("theme=dark; auth_token=abc; x=1"), "abc");
  assert.equal(readAuthCookie("  auth_token = abc  "), "abc");
});

test("a header with no auth cookie yields nothing, and neither does junk", async () => {
  for (const header of [undefined, null, "", "theme=dark", "auth_token", "=abc", 42]) {
    assert.equal(readAuthCookie(header), null, JSON.stringify(header));
  }
});

test("a cookie name that merely ends in auth_token is not the auth token", async () => {
  // "xauth_token=abc" contains the name as a suffix. A substring match would
  // accept it and authenticate on somebody else's cookie.
  assert.equal(readAuthCookie("xauth_token=abc"), null);
});

// ---------------------------------------------------------- the handshake

test("a handshake with no cookie is refused before the database is touched", async () => {
  const { service, calls } = await withAuth(account());

  assert.equal(await service.authenticateHandshake(undefined), null);
  assert.equal(calls.length, 0, "a round trip for a connection never to be served");
});

test("a forged token is refused, and so is one naming no user", async () => {
  const { service, calls } = await withAuth(account());

  assert.equal(await service.authenticateHandshake(cookieOf("not.a.token")), null);
  assert.equal(
    await service.authenticateHandshake(cookieOf(jwt.sign({ UserId: "x" }, "test-secret"))),
    null,
  );
  assert.equal(calls.length, 0);
});

test("a token signed with the wrong secret is refused", async () => {
  const { service } = await withAuth(account());

  const forged = jwt.sign({ UserId: 31 }, "not-the-secret");

  assert.equal(await service.authenticateHandshake(cookieOf(forged)), null);
});

test("⭐ a deactivated account cannot open a socket, whatever its token says", async () => {
  // The same guard requireAuth applies on every request. A valid, unexpired
  // token naming a real user is not enough -- the row is what says no.
  for (const IsActive of [-1, 0, 7]) {
    const { service } = await withAuth(account({ IsActive }));

    assert.equal(await service.authenticateHandshake(cookieOf(tokenFor())), null, `${IsActive}`);
  }
});

test("a user who no longer exists is refused", async () => {
  const { service } = await withAuth(null);

  assert.equal(await service.authenticateHandshake(cookieOf(tokenFor())), null);
});

test("⭐ the identity comes from the row, never from the token", async () => {
  // The mutation guard. A token claiming SUPERADMIN must not grant it, and a
  // socket authenticated from claims alone would hand out a feed by assertion.
  const { service } = await withAuth(account({ Role: BRANCH_STAFF, GroupCode: 1 }));

  const user = await service.authenticateHandshake(
    cookieOf(tokenFor({ Role: "SUPERADMIN", GroupCode: 99 })),
  );

  assert.equal(user.Role, BRANCH_STAFF);
  assert.equal(user.GroupCode, 1);
});

test("an accepted handshake carries exactly the columns the row returns", async () => {
  const { service } = await withAuth(account());

  const user = await service.authenticateHandshake(cookieOf(tokenFor()));

  assert.deepEqual(
    Object.keys(user).sort(),
    ["BranchCode", "FullName", "GroupCode", "Role", "UserCode", "UserId"],
  );
});

test("isStillActive is what the sweep asks, and it reads the row", async () => {
  // ⚠️ A socket holds its answer for as long as it stays open, which is the
  // problem PR #119 exists to prevent on the HTTP side. Sending is safe because
  // it goes over HTTP and re-reads; receiving needs this.
  const live = await withAuth(account());
  assert.equal(await live.service.isStillActive(31), true);

  const revoked = await withAuth(account({ IsActive: -1 }));
  assert.equal(await revoked.service.isStillActive(31), false);

  const gone = await withAuth(null);
  assert.equal(await gone.service.isStillActive(31), false);
});

// ------------------------------------------------- delivery never fails a send

const OFFICER = {
  UserCode: "PHL-AO-00001",
  Role: ACCOUNT_OFFICER,
  BranchCode: null,
  GroupCode: 1,
  IsActive: 1,
};

const STAFF = account();

const stored = () => ({
  run: async () => ({
    recordset: [{ Id: 501, ConversationId: 12, SenderUserCode: STAFF.UserCode, Body: "hi" }],
  }),
});

const withSend = (deliverImpl) =>
  withStubbedModules(
    {
      [USER_MODEL]: {
        getUserScopeByCode: rows(OFFICER),
        isBranchInAccountOfficerScope: scopeHit,
      },
      [MESSAGING_MODEL]: {
        getParticipation: rows({ ConversationId: 12, UserCode: STAFF.UserCode }),
        getOtherParticipant: rows({ UserCode: OFFICER.UserCode }),
        insertMessage: stored,
        markDelivered: () => ({ run: async () => ({ rowsAffected: [1] }) }),
      },
      [SOCKET_SERVER]: { deliver: deliverImpl },
    },
    MESSAGING,
  );

test("⭐ a delivery that throws does not fail a message that is already stored", async () => {
  // The message row is written before any of this. Letting a socket failure
  // reach the caller would lose a message the database already has.
  const { service } = await withSend(() => {
    throw new Error("socket server is down");
  });

  const message = await service.sendMessage(STAFF, 12, "hi");

  assert.equal(message.Id, 501);
  assert.equal(message.Delivered, false);
});

test("delivered is only written when the recipient was actually connected", async () => {
  const offline = await withSend(() => false);
  const offlineMessage = await offline.service.sendMessage(STAFF, 12, "hi");

  assert.equal(offlineMessage.Delivered, false);
  assert.equal(offline.calls.some((c) => c.name === "markDelivered"), false);

  const online = await withSend(() => true);
  const onlineMessage = await online.service.sendMessage(STAFF, 12, "hi");

  assert.equal(onlineMessage.Delivered, true);
  assert.deepEqual(
    online.calls.find((c) => c.name === "markDelivered").args,
    [12, OFFICER.UserCode],
  );
});

test("the message goes to the other participant, never back to the sender", async () => {
  const seen = [];
  const { service } = await withSend((userCode, event, payload) => {
    seen.push({ userCode, event, payload });
    return true;
  });

  await service.sendMessage(STAFF, 12, "hi");

  assert.equal(seen.length, 1);
  assert.equal(seen[0].userCode, OFFICER.UserCode);
  assert.equal(seen[0].event, "message:new");
  assert.equal(seen[0].payload.conversationId, 12);
});

// ------------------------------------------------------------ the seen tick

const withMarkRead = (deliverImpl) =>
  withStubbedModules(
    {
      [MESSAGING_MODEL]: {
        getParticipation: rows({ ConversationId: 12, UserCode: OFFICER.UserCode }),
        getOtherParticipant: rows({ UserCode: STAFF.UserCode }),
        markRead: () => ({ run: async () => ({ rowsAffected: [1] }) }),
      },
      [SOCKET_SERVER]: { deliver: deliverImpl },
    },
    MESSAGING,
  );

test("⭐ the seen tick reaches the sender, and only the sender", async () => {
  // Without this the sender's window says "delivered" until something else
  // makes it re-read -- the tick would land on a refresh rather than when the
  // recipient actually opened the thread.
  const seen = [];
  const { service } = await withMarkRead((userCode, event, payload) => {
    seen.push({ userCode, event, payload });
    return true;
  });

  await service.markConversationRead(OFFICER, 12);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].userCode, STAFF.UserCode, "never back to the reader");
  assert.equal(seen[0].event, "message:read");
  assert.equal(seen[0].payload.conversationId, 12);
  assert.equal(seen[0].payload.readerUserCode, OFFICER.UserCode);
});

test("⭐ a receipt that fails to deliver does not fail the read that was recorded", async () => {
  // markRead has already written both watermarks. Letting a socket failure
  // reach the caller would leave the reader's own badge stuck on a number the
  // database says is zero.
  const { service, calls } = await withMarkRead(() => {
    throw new Error("socket server is down");
  });

  const result = await service.markConversationRead(OFFICER, 12);

  assert.equal(result.success, true);
  assert.ok(calls.find((c) => c.name === "markRead"), "the write still happened");
});
