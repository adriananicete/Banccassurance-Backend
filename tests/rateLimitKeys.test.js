import test from "node:test";
import assert from "node:assert/strict";
import { keyByIp, keyByUser, keyByIdentifier } from "../src/middleware/rateLimiter.js";

test("an authenticated caller is counted as themselves, not as their address", () => {
  // Every limiter was keyed by IP until 2026-08-25. A Landbank branch behind
  // one NAT shared a single bucket, so "10 consent requests an hour" was ten
  // for the whole branch rather than ten each - and no number would have fixed
  // that, only the key.
  const key = keyByUser({ ip: "10.0.0.5", user: { UserCode: "USR-STF-0616" } });

  assert.equal(key, "user:USR-STF-0616");
});

test("two users behind one address do not share a bucket", () => {
  const shared = "10.0.0.5";

  assert.notEqual(
    keyByUser({ ip: shared, user: { UserCode: "USR-STF-0616" } }),
    keyByUser({ ip: shared, user: { UserCode: "USR-BRH-0300" } }),
  );
});

test("an unauthenticated request falls back to the address rather than one shared bucket", () => {
  // The fallback matters: a key generator returning undefined would put every
  // anonymous caller in the same bucket, which is the worst possible outcome
  // for a public endpoint.
  const key = keyByUser({ ip: "10.0.0.5" });

  assert.equal(key, keyByIp({ ip: "10.0.0.5" }));
  assert.ok(key);
});

test("login is counted per account, so one person cannot lock out another", () => {
  // Keyed by IP, a colleague mistyping their password ate the branch's budget.
  // Keyed by the submitted identifier, an attacker can only exhaust the account
  // they are attacking - and the IP limiter stacked in front of it bounds how
  // many accounts they can try from one place.
  const shared = "10.0.0.5";

  assert.equal(
    keyByIdentifier({ ip: shared, body: { identifier: "USR-STF-0616" } }),
    "id:usr-stf-0616",
  );
  assert.notEqual(
    keyByIdentifier({ ip: shared, body: { identifier: "USR-STF-0616" } }),
    keyByIdentifier({ ip: shared, body: { identifier: "USR-BRH-0300" } }),
  );
});

test("the identifier is normalised the way the login itself resolves it", () => {
  // usp_ValidateUser matches case-insensitively, so " usr-stf-0616 " and
  // "USR-STF-0616" are one account. Two buckets for one account would double
  // the real attempt budget.
  const variants = ["USR-STF-0616", "usr-stf-0616", "  USR-STF-0616  "];
  const keys = new Set(variants.map((identifier) => keyByIdentifier({ ip: "1.2.3.4", body: { identifier } })));

  assert.equal(keys.size, 1);
});

test("a login with no identifier is counted by address, not dropped", () => {
  for (const body of [undefined, {}, { identifier: "" }, { identifier: "   " }, { identifier: 5 }]) {
    const key = keyByIdentifier({ ip: "1.2.3.4", body });

    assert.equal(key, keyByIp({ ip: "1.2.3.4" }), JSON.stringify(body));
  }
});

test("an IPv6 caller is collapsed to a subnet rather than counted per address", () => {
  // A single IPv6 client is routinely handed a /64 and can source requests from
  // any address in it, so keying on the full address is no limit at all.
  const one = keyByIp({ ip: "2001:db8:1234:5678::1" });
  const two = keyByIp({ ip: "2001:db8:1234:5678::99ff" });

  assert.equal(one, two);
  assert.notEqual(one, "2001:db8:1234:5678::1");
});
