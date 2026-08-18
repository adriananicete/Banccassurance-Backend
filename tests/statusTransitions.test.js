import test from "node:test";
import assert from "node:assert/strict";
import {
  statusTransitions,
  underwritingTransitions,
  validStatus,
  referralCreatorRoles,
  landBankRoles,
  philLifeRoles,
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
} from "../src/utils/constant.js";

const allStatuses = Object.keys(statusTransitions);

test("every status in the AO map is a valid status, and every valid status appears", () => {
  for (const status of allStatuses) assert.ok(validStatus.includes(status));
  for (const status of validStatus) assert.ok(status in statusTransitions);
});

test("every AO destination is itself a known status", () => {
  for (const [from, destinations] of Object.entries(statusTransitions)) {
    for (const to of destinations) {
      assert.ok(validStatus.includes(to), `${from} -> ${to}`);
    }
  }
});

test("every underwriting source and destination is a known status", () => {
  for (const [from, destinations] of Object.entries(underwritingTransitions)) {
    assert.ok(validStatus.includes(from));
    for (const to of destinations) assert.ok(validStatus.includes(to));
  }
});

test("terminal statuses stay terminal on the AO side", () => {
  for (const status of ["Lost", "Approved", "Declined", "Closed Pending", "Postponed"]) {
    assert.deepEqual(statusTransitions[status], []);
  }
});

test("Deferred is AO-only and absent from the underwriting map", () => {
  assert.ok("Deferred" in statusTransitions);
  assert.equal("Deferred" in underwritingTransitions, false);
  for (const destinations of Object.values(underwritingTransitions)) {
    assert.equal(destinations.includes("Deferred"), false);
  }
});

test("Presented is the only status both sides can move, so it is the only race", () => {
  const bothCanMove = Object.keys(statusTransitions).filter(
    (status) =>
      statusTransitions[status].length > 0 &&
      (underwritingTransitions[status]?.length ?? 0) > 0,
  );
  assert.deepEqual(bothCanMove, ["Presented"]);
});

test("Closed Pending and Postponed belong to underwriting alone", () => {
  for (const status of ["Closed Pending", "Postponed"]) {
    assert.deepEqual(statusTransitions[status], []);
    assert.ok(underwritingTransitions[status].length > 0);
  }
});

test("no status can transition to itself", () => {
  for (const [from, destinations] of Object.entries(statusTransitions)) {
    assert.equal(destinations.includes(from), false, from);
  }
  for (const [from, destinations] of Object.entries(underwritingTransitions)) {
    assert.equal(destinations.includes(from), false, from);
  }
});

test("only Branch Staff, Branch Head and Account Officer may create referrals", () => {
  assert.deepEqual([...referralCreatorRoles].sort(), [
    ACCOUNT_OFFICER,
    BRANCH_HEAD,
    BRANCH_STAFF,
  ].sort());

  for (const role of [GROUP_HEAD, SECTOR_HEAD, AREA_SALES_HEAD, REGIONAL_SALES_HEAD, DEPARTMENT_HEAD]) {
    assert.equal(referralCreatorRoles.includes(role), false, role);
  }
});

test("the self-registerable role lists do not overlap", () => {
  for (const role of landBankRoles) {
    assert.equal(philLifeRoles.includes(role), false, role);
  }
});
