import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { rows } from "./helpers/stubModel.js";
import { withUserService } from "./helpers/userService.js";

// usp_ValidateUser gained a fourth answer on 2026-08-28, as A15 asked: a row
// whose IsActive is outside {0, 1, -1} used to fall through all four STEPs and
// return zero rows, and login refused it at the empty recordset. It now comes
// back complete -- PasswordHash included -- carrying StatusCode 'UNKNOWN'.
//
// loginStep1 named NOT_FOUND, PENDING and DEACTIVATED and never named ACTIVE,
// so the new answer passed all three checks and reached the OTP. A15 told the
// DBA the backend renders UNKNOWN as 401; it did the opposite, and the fix is
// ours. Nothing in src/ binds @IsActive -- registration writes 0 and approval
// writes 1 or -1 -- so this was reachable only by a direct edit or a reseed.
// IsActive carries no CHECK constraint, which is what makes that worth closing.

const PASSWORD = "password123";
const HASH = bcrypt.hashSync(PASSWORD, 4);

const account = (statusCode) =>
  rows({
    UserId: 31,
    UserCode: "USR-GRH-0031",
    Email: "jose@example.com",
    Role: "GROUP_HEAD",
    PasswordHash: HASH,
    StatusCode: statusCode,
  });

const login = async (statusCode) => {
  const { service } = await withUserService({ validateUser: account(statusCode) });

  try {
    return { result: await service.loginStep1("USR-GRH-0031", PASSWORD), error: null };
  } catch (error) {
    return { result: null, error };
  }
};

test("an UNKNOWN status code is refused, even with the right password", async () => {
  const { result, error } = await login("UNKNOWN");

  assert.equal(result, null);
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Invalid credentials");
});

test("the guard is a default-deny, not a list of the values known to be bad", async () => {
  // The mutation guard for the whole change. Refusing UNKNOWN by name would
  // pass the test above and admit the next StatusCode the procedure learns to
  // return, which is the shape of the defect being fixed rather than a new one.
  const { result, error } = await login("SUSPENDED");

  assert.equal(result, null);
  assert.equal(error.statusCode, 401);
});

test("an active account still logs in", async () => {
  // Non-vacuous half: a guard that refused everything would pass both tests
  // above and lock out every user in the system.
  const { result, error } = await login("ACTIVE");

  assert.equal(error, null);
  assert.deepEqual(result, { success: true });
});

test("pending and deactivated keep their own messages", async () => {
  // The catch-all sits below them, so it must not swallow the two refusals a
  // user can act on. 'Invalid credentials' would send someone who is merely
  // waiting for approval to reset a password that is already correct.
  const pending = await login("PENDING");
  const deactivated = await login("DEACTIVATED");

  assert.match(pending.error.message, /pending approval/);
  assert.match(deactivated.error.message, /deactivated/);
  assert.equal(pending.error.statusCode, 401);
  assert.equal(deactivated.error.statusCode, 401);
});
