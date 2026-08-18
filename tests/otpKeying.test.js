import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { withUserService, captureThrown } from "./helpers/userService.js";

const PASSWORD = "correct horse battery";
const SHARED_EMAIL = "phillifedevops@gmail.com";

const hash = await bcrypt.hash(PASSWORD, 10);

const accounts = {
  "USR-STF-0001": { UserId: 1, UserCode: "USR-STF-0001", Email: SHARED_EMAIL, PasswordHash: hash, StatusCode: "ACTIVE" },
  "USR-STF-0002": { UserId: 2, UserCode: "USR-STF-0002", Email: SHARED_EMAIL, PasswordHash: hash, StatusCode: "ACTIVE" },
};

const twoAccountsOneMailbox = () => ({
  validateUser: (identifier) => ({
    run: async () => ({ recordset: accounts[identifier] ? [accounts[identifier]] : [] }),
  }),
});

const otpSentTo = (calls, index) =>
  calls.filter((call) => call.name === "sendOtpEmail")[index].args[1];

test("one account's OTP cannot mint a session for another sharing the mailbox", async () => {
  const { service, calls } = await withUserService(twoAccountsOneMailbox());

  await service.loginStep1("USR-STF-0001", PASSWORD);
  const otpForFirst = otpSentTo(calls, 0);

  const crossed = await captureThrown(() =>
    service.verifyOtp("USR-STF-0002", otpForFirst),
  );
  assert.equal(crossed?.statusCode, 401);
  assert.match(crossed.message, /no otp found/i);

  const own = await service.verifyOtp("USR-STF-0001", otpForFirst);
  assert.equal(own.success, true);
  assert.equal(own.user.UserCode, "USR-STF-0001");
});

test("a second account signing in does not invalidate the first account's OTP", async () => {
  const { service, calls } = await withUserService(twoAccountsOneMailbox());

  await service.loginStep1("USR-STF-0001", PASSWORD);
  await service.loginStep1("USR-STF-0002", PASSWORD);

  const otpForFirst = otpSentTo(calls, 0);
  const otpForSecond = otpSentTo(calls, 1);
  assert.notEqual(otpForFirst, otpForSecond);

  const first = await service.verifyOtp("USR-STF-0001", otpForFirst);
  assert.equal(first.user.UserCode, "USR-STF-0001");

  const second = await service.verifyOtp("USR-STF-0002", otpForSecond);
  assert.equal(second.user.UserCode, "USR-STF-0002");
});

test("an OTP is single use", async () => {
  const { service, calls } = await withUserService(twoAccountsOneMailbox());
  await service.loginStep1("USR-STF-0001", PASSWORD);

  const otp = otpSentTo(calls, 0);
  await service.verifyOtp("USR-STF-0001", otp);

  const reused = await captureThrown(() => service.verifyOtp("USR-STF-0001", otp));
  assert.equal(reused?.statusCode, 401);
  assert.match(reused.message, /no otp found/i);
});

test("five wrong attempts discard the OTP, so the correct one no longer works", async () => {
  const { service, calls } = await withUserService(twoAccountsOneMailbox());
  await service.loginStep1("USR-STF-0001", PASSWORD);
  const otp = otpSentTo(calls, 0);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const error = await captureThrown(() => service.verifyOtp("USR-STF-0001", "000000"));
    assert.equal(error?.statusCode, 401);
  }

  const afterLockout = await captureThrown(() => service.verifyOtp("USR-STF-0001", otp));
  assert.equal(afterLockout?.statusCode, 401);
  assert.match(afterLockout.message, /no otp found/i);
});

test("a wrong password issues no OTP at all", async () => {
  const { service, calls } = await withUserService(twoAccountsOneMailbox());

  const error = await captureThrown(() => service.loginStep1("USR-STF-0001", "wrong"));

  assert.equal(error?.statusCode, 401);
  assert.equal(calls.some((call) => call.name === "sendOtpEmail"), false);
});

test("an unknown identifier is refused without revealing anything", async () => {
  const { service } = await withUserService(twoAccountsOneMailbox());

  const error = await captureThrown(() => service.loginStep1("USR-STF-9999", PASSWORD));

  assert.equal(error?.statusCode, 401);
  assert.match(error.message, /invalid credentials/i);
});

test("a pending or deactivated account is turned away after the password is checked", async () => {
  for (const [statusCode, expected] of [
    ["PENDING", /pending approval/i],
    ["DEACTIVATED", /deactivated/i],
  ]) {
    const { service, calls } = await withUserService({
      validateUser: () => ({
        run: async () => ({
          recordset: [{ ...accounts["USR-STF-0001"], StatusCode: statusCode }],
        }),
      }),
    });

    const error = await captureThrown(() => service.loginStep1("USR-STF-0001", PASSWORD));

    assert.equal(error?.statusCode, 401, statusCode);
    assert.match(error.message, expected);
    assert.equal(calls.some((call) => call.name === "sendOtpEmail"), false);
  }
});
