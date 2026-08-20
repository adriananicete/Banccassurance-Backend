import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const NOTIFICATION_MODEL = "../../src/models/notificationModel.js";
const NOTIFICATION_SERVICE = "../../src/services/notificationService.js";

const OWNER = "PHL-AO-1168";

const ok = () => ({ run: async () => ({ recordset: [], rowsAffected: [1] }) });

// The procedure returns TotalCount and UnreadCount on every row; the service
// strips both. A stubbed page has to carry them or the strip is never exercised.
const page = (...records) =>
  rows(...records.map((r) => ({ TotalCount: records.length, UnreadCount: 1, ...r })));

const PAGE_1 = { PageNumber: 1, PageSize: 20, UnreadOnly: 0 };

const withNotifications = (overrides = {}) =>
  withStubbedModules(
    {
      [NOTIFICATION_MODEL]: {
        getByUserCode: page({ Id: 1, Message: "hello", IsRead: false }),
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

  const result = await service.getUserNotifications(OWNER, PAGE_1);

  assert.equal(result.success, true);
  assert.equal(result.notifications.length, 1);
});

test("the UserCode is trimmed before it reaches the query", async () => {
  const { service, calls } = await withNotifications();

  await service.getUserNotifications(`  ${OWNER}  `, PAGE_1);

  assert.deepEqual(calls.find((c) => c.name === "getByUserCode").args, [OWNER, PAGE_1]);
});

test("reading with no UserCode answers an empty page, while writing refuses", async () => {
  // A real asymmetry, and the one most likely to be tidied into consistency by
  // a later reader. Reading returns 200 with nothing; the two writes throw 400.
  for (const missing of [null, undefined, "", "undefined"]) {
    const { service, calls } = await withNotifications();

    const read = await service.getUserNotifications(missing, PAGE_1);
    assert.deepEqual(
      read,
      {
        success: true,
        notifications: [],
        unreadCount: 0,
        pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 },
      },
      `read ${missing}`,
    );
    assert.equal(calls.length, 0, `read ${missing} must not query`);

    const cleared = await captureThrown(() => service.clearUserNotifications(missing));
    const marked = await captureThrown(() => service.markAllNotificationsAsRead(missing));

    assert.equal(cleared?.statusCode, 400, `clear ${missing}`);
    assert.equal(marked?.statusCode, 400, `markAll ${missing}`);
  }
});

test("the refused read answers the same shape as a real one", async () => {
  // The early return builds its own object. If the two drift, a caller reading
  // pagination.totalPages crashes on exactly the input that was meant to be safe.
  const { service } = await withNotifications();

  const real = await service.getUserNotifications(OWNER, PAGE_1);
  const refused = await service.getUserNotifications(null, PAGE_1);

  assert.deepEqual(Object.keys(refused).sort(), Object.keys(real).sort());
  assert.deepEqual(
    Object.keys(refused.pagination).sort(),
    Object.keys(real.pagination).sort(),
  );
});

test("only the reader guards against the literal string 'null'", async () => {
  // getUserNotifications checks for 'null'; the two writes do not. Pinned
  // because it is invisible, not because it is right.
  const { service, calls } = await withNotifications();

  const read = await service.getUserNotifications("null", PAGE_1);
  assert.deepEqual(read.notifications, []);
  assert.equal(calls.length, 0);

  const { service: writer } = await withNotifications();
  const error = await captureThrown(() => writer.clearUserNotifications("null"));
  assert.equal(error, null);
});

test("TotalCount and UnreadCount are stripped from every row, not just the first", async () => {
  // They ride on each row of the recordset. Reading them off row 0 and
  // forgetting the map leaks two internal columns into the bell menu.
  const { service } = await withNotifications({
    getByUserCode: page(
      { Id: 3, Message: "third", IsRead: false },
      { Id: 2, Message: "second", IsRead: true },
      { Id: 1, Message: "first", IsRead: true },
    ),
  });

  const result = await service.getUserNotifications(OWNER, PAGE_1);

  for (const row of result.notifications) {
    assert.equal("TotalCount" in row, false, `TotalCount survived on ${row.Id}`);
    assert.equal("UnreadCount" in row, false, `UnreadCount survived on ${row.Id}`);
  }
  assert.deepEqual(
    result.notifications.map((r) => r.Id),
    [3, 2, 1],
  );
});

test("the counts are lifted off the recordset, not derived from the page", async () => {
  // The badge counts every unread the user has, not the unread on this page.
  // Recomputing it from `notifications` would silently cap it at pageSize.
  const { service } = await withNotifications({
    getByUserCode: rows(
      { Id: 9, Message: "one of many", IsRead: false, TotalCount: 137, UnreadCount: 42 },
    ),
  });

  const result = await service.getUserNotifications(OWNER, { ...PAGE_1, PageSize: 20 });

  assert.equal(result.unreadCount, 42);
  assert.equal(result.pagination.totalCount, 137);
  assert.equal(result.pagination.totalPages, 7);
});

test("the paging options are passed through to the model untouched", async () => {
  const { service, calls } = await withNotifications();
  const options = { PageNumber: 3, PageSize: 50, UnreadOnly: 1 };

  await service.getUserNotifications(OWNER, options);

  const call = calls.find((c) => c.name === "getByUserCode");
  assert.deepEqual(call.args[1], options);
});

test("an empty recordset answers zero rather than throwing", async () => {
  // A user with no notifications gets no rows at all, so there is no row 0 to
  // read TotalCount from.
  const { service } = await withNotifications({ getByUserCode: rows() });

  const result = await service.getUserNotifications(OWNER, PAGE_1);

  assert.deepEqual(result.notifications, []);
  assert.equal(result.unreadCount, 0);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
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
