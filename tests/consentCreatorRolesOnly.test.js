import test from "node:test";
import assert from "node:assert/strict";
import consentRoutes from "../src/routes/consentRoutes.js";
import { requireRole } from "../src/middleware/auth.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
  referralCreatorRoles,
} from "../src/utils/constant.js";

// The consent routes took requireAuth and nothing else, so any signed-in user
// could send a Data Privacy notice to a client. That was survivable while the
// referrer's name came from the request body and was arbitrary anyway.
//
// It stopped being survivable when the name started coming from the session
// (PR #134): the notice now names whoever sent it, and a role that cannot
// create a referral will never be the person named on the referral that
// follows. A Group Head sending consent guarantees that the notice the client
// agreed to names a different person than the referral it authorises.
//
// Consent is gathered by whoever talks to the client, and that is exactly the
// three roles that may create a referral.

const NON_CREATORS = [
  GROUP_HEAD,
  SECTOR_HEAD,
  AREA_SALES_HEAD,
  REGIONAL_SALES_HEAD,
  DEPARTMENT_HEAD,
  SUPERADMIN,
];

const runGuard = (role) => {
  const captured = { status: null, body: null, nextCalled: false };

  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    json(body) {
      captured.body = body;
    },
  };

  requireRole(...referralCreatorRoles)({ user: { Role: role } }, res, () => {
    captured.nextCalled = true;
  });

  return captured;
};

test("all three referral creators may gather consent", async () => {
  for (const role of [BRANCH_STAFF, BRANCH_HEAD, ACCOUNT_OFFICER]) {
    assert.equal(runGuard(role).nextCalled, true, role);
  }
});

test("every role that cannot create a referral is refused", async () => {
  // Assert the set. A role missing from referralCreatorRoles throws nothing and
  // cannot be caught by exercising the roles that are present -- and the list is
  // shared with the create-referral guard, so this also fails if somebody widens
  // it there without meaning to widen it here.
  for (const role of NON_CREATORS) {
    const { status, nextCalled } = runGuard(role);

    assert.equal(status, 403, role);
    assert.equal(nextCalled, false, role);
  }
});

test("the superadmin is refused with everybody else", async () => {
  // Worth its own line because it is the exception elsewhere: a superadmin
  // reaches all three assign endpoints and both approval paths. It never creates
  // or reads a referral, so it has no client to gather consent from.
  const { status } = runGuard(SUPERADMIN);

  assert.equal(status, 403);
});

// ------------------------------------------------------------- the wiring

const layerFor = (method, path) =>
  consentRoutes.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);

// Runs a route's chain and stops at the first response.
//
// It starts at index 1, past requireAuth, which answers 401 without a cookie and
// would end every chain before the guard. That requireAuth is first is asserted
// on its own below, so the two together cover the order.
const callChain = async (layer, role) => {
  const captured = { status: null, reached: 0 };

  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    json() {},
    send() {},
  };

  const req = { user: { Role: role }, body: {}, query: {}, headers: {}, ip: "127.0.0.1" };

  for (const handle of layer.route.stack.slice(1)) {
    let advanced = false;

    await handle.handle(req, res, () => {
      advanced = true;
    });

    captured.reached += 1;
    if (!advanced) break;
  }

  return captured;
};

test("requireAuth is still the first handle on all three", async () => {
  // The guard reads req.user, and so does the limiter key generator. If anything
  // is ever inserted above requireAuth, both read undefined and the limiter
  // silently falls back to counting by IP address.
  for (const path of ["/send", "/resend", "/upload"]) {
    const first = layerFor("post", path).route.stack[0].handle;

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

    await first({ cookies: {} }, res, () => {});

    assert.equal(captured.status, 401, path);
    assert.equal(captured.body.message, "Not authenticated", path);
  }
});

test("send, resend and upload all carry the guard", async () => {
  // The behaviour tests above prove requireRole refuses the right set. This is
  // the half that proves the routes actually call it -- they are separate
  // failures, and the second one is invisible from the service.
  for (const path of ["/send", "/resend", "/upload"]) {
    const layer = layerFor("post", path);

    assert.ok(layer, `POST ${path} is not mounted`);

    const { status } = await callChain(layer, GROUP_HEAD);

    assert.equal(status, 403, `POST ${path} did not refuse a Group Head`);
  }
});

test("the guard sits above the limiter, not below it", async () => {
  // A role that may not gather consent should not spend a limiter budget to be
  // told so, and on /upload the chain would otherwise have written the file to
  // disk before anything checked who sent it.
  const { reached } = await callChain(layerFor("post", "/upload"), GROUP_HEAD);

  assert.equal(reached, 1, "requireRole answered, and nothing below it ran");
});

test("check is deliberately left open to every signed-in role", async () => {
  // It reads a status and writes nothing. Narrowing it would 403 any screen that
  // polls consent state for a role that cannot refer, and we have no way to see
  // from here whether one exists.
  const layer = layerFor("get", "/check");

  assert.ok(layer, "GET /check is not mounted");
  assert.equal(layer.route.stack.length, 2);
});
