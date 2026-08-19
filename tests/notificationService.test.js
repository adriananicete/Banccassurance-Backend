import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const NOTIFICATION_MODEL = "../../src/models/notificationModel.js";
const NOTIFICATION_SERVICE = "../../src/services/notificationService.js";

const OWNER = "PHL-AO-1168";

const ok = () => ({ run: async () => ({ recordset: [], rowsAffected: [1] }) });

const withNotifications = (overrides = {}) =>
  withStubbedModules(
    {
      [NOTIFICATION_MODEL]: {
        getByUserCode: rows({ Id: 1, Message: "hello", IsRead: false }),
        deleteByUserCode: ok,
        markAllAsRead: ok,
        insert: ok,
        ...overrides,
      },
    },
    NOTIFICATION_SERVICE,
  );

test("the list is returned under `notifications`, not `data`", async () => {
  // The frontend reads res.data.notifications. This shape is load-bearing and
  // differs from every other list endpoint in the API.
  const { service } = await withNotifications();

  const result = await service.getUserNotifications(OWNER);

  assert.equal(result.success, true);
  assert.equal(result.notifications.length, 1);
});

test("the UserCode is trimmed before it reaches the query", async () => {
  const { service, calls } = await withNotifications();

  await service.getUserNotifications(`  ${OWNER}  `);

  assert.deepEqual(calls.find((c) => c.name === "getByUserCode").args, [OWNER]);
});

test("reading with no UserCode answers an empty list, while writing refuses", async () => {
  // A real asymmetry, and the one most likely to be tidied into consistency by
  // a later reader. Reading returns 200 with nothing; the two writes throw 400.
  for (const missing of [null, undefined, "", "undefined"]) {
    const { service, calls } = await withNotifications();

    const read = await service.getUserNotifications(missing);
    assert.deepEqual(read, { success: true, notifications: [] }, `read ${missing}`);
    assert.equal(calls.length, 0, `read ${missing} must not query`);

    const cleared = await captureThrown(() => service.clearUserNotifications(missing));
    const marked = await captureThrown(() => service.markAllNotificationsAsRead(missing));

    assert.equal(cleared?.statusCode, 400, `clear ${missing}`);
    assert.equal(marked?.statusCode, 400, `markAll ${missing}`);
  }
});

test("only the reader guards against the literal string 'null'", async () => {
  // getUserNotifications checks for 'null'; the two writes do not. Pinned
  // because it is invisible, not because it is right.
  const { service, calls } = await withNotifications();

  const read = await service.getUserNotifications("null");
  assert.deepEqual(read.notifications, []);
  assert.equal(calls.length, 0);

  const { service: writer } = await withNotifications();
  const error = await captureThrown(() => writer.clearUserNotifications("null"));
  assert.equal(error, null);
});

test("clearing and marking all answer a message and touch only their own query", async () => {
  const cleared = await withNotifications();
  const clearResult = await cleared.service.clearUserNotifications(OWNER);

  assert.equal(clearResult.success, true);
  assert.match(clearResult.message, /cleared/i);
  assert.deepEqual(
    cleared.calls.map((c) => c.name),
    ["deleteByUserCode"],
  );

  const marked = await withNotifications();
  const markResult = await marked.service.markAllNotificationsAsRead(OWNER);

  assert.equal(markResult.success, true);
  assert.match(markResult.message, /all notifications/i);
  assert.deepEqual(
    marked.calls.map((c) => c.name),
    ["markAllAsRead"],
  );
});

test("safeNotify swallows a failing insert instead of failing its caller", async () => {
  // Every notification in createReferral and register goes through this. A
  // notification failure must never roll back or 500 the thing that caused it.
  const { service } = await withNotifications({
    insert: () => ({
      run: async () => {
        throw new Error("notification insert failed");
      },
    }),
  });

  await assert.doesNotReject(() => service.safeNotify(OWNER, "anything"));
});

test("safeNotify passes the recipient and message straight through", async () => {
  const { service, calls } = await withNotifications();

  await service.safeNotify(OWNER, "New referral assigned to you");

  assert.deepEqual(calls.find((c) => c.name === "insert").args, [
    OWNER,
    "New referral assigned to you",
  ]);
});
