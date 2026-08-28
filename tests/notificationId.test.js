import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

const NOTIFICATION_MODEL = "../../src/models/notificationModel.js";
const NOTIFICATION_SERVICE = "../../src/services/notificationService.js";

const OWNER = "PHL-AO-1168";

const markRead = async (id) => {
  const { service, calls } = await withStubbedModules(
    {
      [NOTIFICATION_MODEL]: {
        markAsRead: () => ({ run: async () => ({ rowsAffected: [1] }) }),
      },
    },
    NOTIFICATION_SERVICE,
  );

  const error = await captureThrown(() => service.markNotificationAsRead(id, OWNER));
  const written = calls.filter((call) => call.name === "markAsRead");

  return { error, written };
};

test("a numeric id reaches the model as a number, carrying the caller's own UserCode", async () => {
  const { error, written } = await markRead("7");

  assert.equal(error, null);
  assert.deepEqual(written[0].args, [7, OWNER]);
});

test("an id with trailing characters is refused, not silently truncated", async () => {
  // parseInt("7abc") is 7, so this used to mark notification 7 as read and answer
  // 200. The caller asked for something that does not exist and was told it worked.
  const { error, written } = await markRead("7abc");

  assert.equal(error?.statusCode, 400);
  assert.equal(written.length, 0);
});

test("a decimal id is refused rather than rounded down to a different notification", async () => {
  const { error, written } = await markRead("7.5");

  assert.equal(error?.statusCode, 400);
  assert.equal(written.length, 0);
});

test("an id that is not a number is a 400, never reaching the sql.Int parameter", async () => {
  // parseInt("abc") is NaN, which went straight into request.input('Id', sql.Int).
  // Whatever the driver did with it, a 500 or a silent no-op, both were wrong.
  for (const id of ["abc", "", " ", "null", "undefined"]) {
    const { error, written } = await markRead(id);

    assert.equal(error?.statusCode, 400, `id ${JSON.stringify(id)}`);
    assert.equal(written.length, 0, `id ${JSON.stringify(id)}`);
  }
});

test("zero and negative ids are refused", async () => {
  for (const id of ["0", "-1", "-0"]) {
    const { error, written } = await markRead(id);

    assert.equal(error?.statusCode, 400, `id ${id}`);
    assert.equal(written.length, 0, `id ${id}`);
  }
});

test("the refusal says what a valid id looks like", async () => {
  const { error } = await markRead("7abc");

  assert.match(error.message, /positive whole number/i);
});
