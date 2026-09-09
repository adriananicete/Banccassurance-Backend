import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";

// GET /consent/check answered PENDING for an email it could not read, which is
// the same answer it gives for "the client has not replied yet" and for "no
// request exists". Three states, one word.
//
// Found 2026-09-09 the long way. A plus-addressed client email in a query string
// arrives with the plus decoded as a space -- ?email=name+3@x.com reaches the
// procedure as "name 3@x.com" -- so the row was never matched and the endpoint
// reported the client had given no consent. It took most of an hour and three
// stored procedure bodies to find, and every one of those was innocent.
//
// Plus-addressing is not a testing trick. juan+insurance@gmail.com is a real
// address a real client will give.
//
// The answer to an unreadable email is to say so, not to guess. Turning the
// space back into a plus would be inventing intent, and an address with a space
// in it is not valid either way.

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const withConsent = (status = "CONFIRMED") =>
  withStubbedModules(
    { [REFERRAL_MODEL]: { checkConsent: rows({ Status: status }) } },
    REFERRAL_SERVICE,
  );

test("an email the query string mangled is a 400, not a PENDING", async () => {
  // The exact shape that caused this: the plus became a space.
  const { service, calls } = await withConsent();

  const error = await captureThrown(() =>
    service.checkConsent("anicete.ian14 3@gmail.com"),
  );

  assert.equal(error?.statusCode, 400);
  assert.equal(calls.length, 0, "an unreadable address must not reach the database");
});

test("a missing email is a 400 rather than a confident PENDING", async () => {
  for (const bad of ["", null, undefined, "  "]) {
    const { service, calls } = await withConsent();

    const error = await captureThrown(() => service.checkConsent(bad));

    assert.equal(error?.statusCode, 400, `email ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0, `email ${JSON.stringify(bad)}`);
  }
});

test("a plus-addressed email is valid and is passed through untouched", async () => {
  // The half that makes the guard non-vacuous. A validator that refused the plus
  // would answer 400 for a real client and would pass every test above.
  const { service, calls } = await withConsent();

  const status = await service.checkConsent("anicete.ian14+3@gmail.com");

  assert.equal(status, "CONFIRMED");
  assert.deepEqual(calls[0].args, ["anicete.ian14+3@gmail.com"]);
});

test("an ordinary address still reports its real status", async () => {
  const { service } = await withConsent("UPLOADED");

  assert.equal(await service.checkConsent("client@example.com"), "UPLOADED");
});

test("PENDING still means no usable consent for an address we could read", async () => {
  // The guard must not swallow the legitimate empty case. A readable address
  // with no rows is a real answer, not an error.
  const { service } = await withStubbedModules(
    { [REFERRAL_MODEL]: { checkConsent: rows() } },
    REFERRAL_SERVICE,
  );

  assert.equal(await service.checkConsent("nobody@example.com"), "PENDING");
});
