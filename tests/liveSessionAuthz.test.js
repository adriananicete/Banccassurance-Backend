import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { withStubbedModules, rows, restoreStubs } from "./helpers/stubModel.js";

// requireAuth used to be jwt.verify and nothing else, so Role, BranchCode and
// GroupCode were whatever they were at login and stayed that way for eight
// hours (authController.js, expiresIn: '8h'). Two consequences, both found on
// 2026-08-28 while testing the new seed:
//
//   - A scope assigned to a logged-in user did not reach them until they logged
//     in again. Fixing Users.Role in the database changed nothing for an open
//     session, which cost half a debugging session on its own.
//   - Deactivation could not end a session. When A17 lands, a revoked account
//     would have kept working until its token expired.
//
// The token is now an identity assertion -- UserId, signed -- and every
// authorisation value is read live. getOwnScope (userService.js:797) already
// worked this way, so this makes the two agree rather than inventing a pattern.

const AUTH = "../../src/middleware/auth.js";
const USER_MODEL = "../../src/models/userModel.js";

process.env.JWT_SECRET = "test-secret";

const account = (overrides = {}) => ({
  UserId: 31,
  UserCode: "USR-GRH-0031",
  IsActive: 1,
  Role: "GROUP_HEAD",
  BranchCode: null,
  GroupCode: 2,
  ...overrides,
});

// The token deliberately disagrees with the row wherever a test needs it to.
const tokenFor = (claims = {}) =>
  jwt.sign({ UserId: 31, UserCode: "USR-GRH-0031", Role: "GROUP_HEAD", ...claims },
    process.env.JWT_SECRET);

const call = async (row, token = tokenFor()) => {
  const { service } = await withStubbedModules(
    { [USER_MODEL]: { getUserScopeById: row === null ? rows() : rows(row) } },
    AUTH,
  );

  const req = { cookies: token === null ? {} : { auth_token: token } };
  const captured = { status: null, body: null, nextCalled: false, error: null };

  const res = {
    status(code) {
      captured.status = code;
      return this;
    },
    json(body) {
      captured.body = body;
    },
  };

  await service.requireAuth(req, res, (error) => {
    captured.nextCalled = true;
    captured.error = error ?? null;
  });

  restoreStubs();

  return { ...captured, user: req.user };
};

test("a deactivated account cannot use a token that is still valid", async () => {
  // The whole point. The token verifies, has not expired, and names a real
  // user -- the row is the only thing that says no.
  const { status, body, nextCalled } = await call(account({ IsActive: -1 }));

  assert.equal(status, 401);
  assert.match(body.message, /deactivated/);
  assert.equal(nextCalled, false);
});

test("only IsActive 1 passes, so an unknown state is refused rather than admitted", async () => {
  // Mirrors the ACTIVE check in loginStep1 (PR #118). IsActive carries no CHECK
  // constraint, so a reseed can write a value nobody planned for.
  const { status, nextCalled } = await call(account({ IsActive: 7 }));

  assert.equal(status, 401);
  assert.equal(nextCalled, false);
});

test("the role comes from the row, not from the token", async () => {
  // The mutation guard for the whole change. A token claiming SUPERADMIN must
  // not grant it -- reverting to jwt.verify alone passes every other test here
  // and fails this one.
  const { user, nextCalled } = await call(
    account({ Role: "BRANCH_STAFF" }),
    tokenFor({ Role: "SUPERADMIN" }),
  );

  assert.equal(nextCalled, true);
  assert.equal(user.Role, "BRANCH_STAFF");
});

test("the scope comes from the row, so an assignment reaches an open session", async () => {
  // This is the half that bites daily rather than rarely: a branch assigned to
  // an Account Officer while they are logged in used to be invisible to them
  // until the token expired.
  const { user } = await call(
    account({ Role: "ACCOUNT_OFFICER", GroupCode: 5, BranchCode: null }),
    tokenFor({ GroupCode: 2 }),
  );

  assert.equal(user.GroupCode, 5);
});

test("a user who no longer exists is refused", async () => {
  const { status, nextCalled } = await call(null);

  assert.equal(status, 401);
  assert.equal(nextCalled, false);
});

test("an active account passes, carrying exactly the columns the row returns", async () => {
  // Non-vacuous half: a guard that refused everything would pass all of the
  // above. Asserting the key set also catches a field quietly dropped from
  // req.user, which would surface as a wrong scope rather than an error.
  const { user, nextCalled, status } = await call(account());

  assert.equal(nextCalled, true);
  assert.equal(status, null);
  assert.deepEqual(
    Object.keys(user).sort(),
    ["BranchCode", "GroupCode", "Role", "UserCode", "UserId"],
  );
});

test("no token and a forged token are both refused before the database is touched", async () => {
  const { service, calls } = await withStubbedModules(
    { [USER_MODEL]: { getUserScopeById: rows(account()) } },
    AUTH,
  );

  const run = async (cookies) => {
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
    await service.requireAuth({ cookies }, res, () => {});
    return captured;
  };

  const missing = await run({});
  const forged = await run({ auth_token: "not.a.token" });

  restoreStubs();

  assert.equal(missing.status, 401);
  assert.equal(missing.body.message, "Not authenticated");
  assert.equal(forged.status, 401);
  // A round trip for a request that was never going to be served is waste, and
  // this middleware now runs on every authenticated route.
  assert.equal(calls.length, 0);
});
