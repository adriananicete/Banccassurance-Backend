import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { withStubbedModules, restoreStubs } from "./helpers/stubModel.js";

const USER_SERVICE = "../../src/services/userService.js";
const AUTH_CONTROLLER = "../../src/controllers/authController.js";

process.env.JWT_SECRET = "test-secret";

// usp_ValidateUser stopped returning AreaCode and returns GroupCode instead.
// The controller kept reading user.AreaCode, so every session was built with
// undefined in it -- and because asInt turns undefined into null, nothing threw.
// A Group Head's approvals list and referral list simply came back empty.
const login = async (user) => {
  const controller = await withStubbedModules(
    {
      [USER_SERVICE]: {
        verifyOtp: async () => ({ user }),
      },
    },
    AUTH_CONTROLLER,
  );

  const captured = {};
  const res = {
    cookie: (name, value) => {
      captured.cookie = { name, value };
    },
    json: (body) => {
      captured.body = body;
    },
  };

  let thrown = null;
  await controller.service.verifyOtp(
    { body: { identifier: "USR-GRH-0031", otp: "123456" } },
    res,
    (error) => {
      thrown = error;
    },
  );
  restoreStubs();

  return { ...captured, thrown };
};

const groupHead = (overrides = {}) => ({
  UserId: 31,
  UserCode: "USR-GRH-0031",
  FullName: "Jose Cruz",
  Role: "GROUP_HEAD",
  Photo: null,
  BranchCode: null,
  GroupCode: 2,
  AOCode: null,
  EmployeeNo: "10031",
  ...overrides,
});

const payloadOf = (cookie) => jwt.verify(cookie.value, process.env.JWT_SECRET);

test("the session is built from GroupCode, the column the procedure returns", async () => {
  const { cookie, thrown } = await login(groupHead());

  assert.equal(thrown, null);
  assert.equal(payloadOf(cookie).GroupCode, 2);
});

test("no AreaCode survives in the token, even when the row still has one", async () => {
  // The mutation guard for this whole branch. The row must carry AreaCode for
  // the guard to bite: jwt.sign drops undefined keys, so a fixture without one
  // lets a revert to user.AreaCode pass while proving nothing.
  const { cookie } = await login(groupHead({ AreaCode: 2 }));

  assert.equal("AreaCode" in payloadOf(cookie), false);
});

test("a row that still carries only AreaCode yields no group rather than a wrong one", async () => {
  // usp_ins_register_user writes Users.AreaCode and not GroupCode, so anyone
  // registered since the column was added arrives here with GroupCode missing.
  // Undefined is the honest answer until the procedure writes both; inventing a
  // group from the stale column would scope them to somebody else's.
  const stale = groupHead({ GroupCode: undefined });
  delete stale.GroupCode;
  stale.AreaCode = 2;

  const { cookie, thrown } = await login(stale);

  assert.equal(thrown, null);
  assert.equal("GroupCode" in payloadOf(cookie), false);
  assert.equal("AreaCode" in payloadOf(cookie), false);
});

test("a null group is carried as null and does not throw", async () => {
  // An Area Sales Head has no group on the user row by design -- the truth is in
  // area_sales_head_areas -- and usp_ValidateUser returns NULL for them.
  const { cookie, body, thrown } = await login(
    groupHead({ Role: "AREA_SALES_HEAD", UserCode: "PHL-ASH-0617", GroupCode: null }),
  );

  assert.equal(thrown, null);
  assert.equal(payloadOf(cookie).GroupCode, null);
  assert.equal(body.user.GroupCode, null);
});

test("the response carries GroupCode alone, with no AreaCode left beside it", async () => {
  // It carried both for one release, while the frontend moved. The transitional
  // alias came out with the rest of the rename on 2026-08-26 -- every other
  // response had moved by then, so leaving this one would have cost the frontend
  // a second pass rather than saving it one.
  const { body } = await login(groupHead({ AreaCode: 2 }));

  assert.equal(body.success, true);
  assert.equal(body.user.GroupCode, 2);
  assert.equal("AreaCode" in body.user, false);
});

test("the rest of the session is unchanged", async () => {
  // Login has the widest blast radius in the application. This asserts the whole
  // token, so a field lost while editing the group out of it cannot pass.
  const { cookie } = await login(groupHead({ BranchCode: 255, AOCode: "PHL-AO-1168" }));
  const payload = payloadOf(cookie);

  assert.deepEqual(
    Object.keys(payload).filter((key) => key !== "iat" && key !== "exp").sort(),
    ["BranchCode", "GroupCode", "Role", "UserCode", "UserId"],
  );
  assert.equal(payload.UserCode, "USR-GRH-0031");
  assert.equal(payload.Role, "GROUP_HEAD");
  assert.equal(payload.BranchCode, 255);
});

test("no AOCode is stamped into the token, even when the row carries one", async () => {
  // AOCode was the last field frozen at login: the token lasts eight hours and a
  // branch reassignment inside that window made the stamped value wrong. Every
  // other field became a live read in PR #119. The fixture must carry an AOCode
  // for this to bite -- jwt.sign drops undefined keys, so a row without one lets
  // a revert to user.AOCode pass while proving nothing.
  const { cookie } = await login(groupHead({ AOCode: "PHL-AO-1168" }));

  assert.equal("AOCode" in payloadOf(cookie), false);
});

test("neither AOCode nor aoFullName survives in the login response", async () => {
  // The value was a snapshot taken at registration, and its failure mode was that
  // it was sometimes right: a Landbank account registered after its Account
  // Officer got the branch carried the correct code, one registered before
  // carried null for ever. GET /referrals/referrer resolves it live instead.
  const { body } = await login(groupHead({ AOCode: "PHL-AO-1168" }));

  assert.equal(body.success, true);
  assert.equal("AOCode" in body.user, false);
  assert.equal("aoFullName" in body.user, false);
});

test("the login response no longer reads the Account Officer's row", async () => {
  // The AOCode lookup was the only caller of userService.findByUserCode. If a
  // revert brings the call back, the stub set no longer defines it and this
  // throws rather than silently costing a query on every login.
  const { body, thrown } = await login(groupHead({ AOCode: "PHL-AO-1168" }));

  assert.equal(thrown, null);
  assert.equal(body.user.UserCode, "USR-GRH-0031");
});
