import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows } from "./helpers/stubModel.js";
import { ACCOUNT_OFFICER, BRANCH_STAFF } from "../src/utils/constant.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";

const allowedKeys = [
  "ReferralNo",
  "Status",
  "StatusDate",
  "ReferrerName",
  "BranchName",
  "AreaName",
  "AOName",
];

const existingDuplicate = {
  ReferralNo: "REF-20260805-543D78",
  Status: "Referred",
  StatusDate: "2026-08-05",
  ReferrerName: "San Fernando - Dolores Encoder 1",
  BranchName: "San Fernando - Dolores",
  AreaName: "CENTRAL LUZON",
  AOName: "PhilLife Account Officer",
};

const attribution = {
  ReferrerCode: "USR-STF-0115",
  ReferrerName: "San Fernando - Dolores Encoder 1",
  AOCode: "PHL-AO-0001",
  AOName: "PhilLife Account Officer",
  BranchCode: 58,
  BranchName: "San Fernando - Dolores",
  AreaCode: 5,
  AreaName: "CENTRAL LUZON",
};

const stubForDuplicate = () =>
  withStubbedModules({
    [REFERRAL_MODEL]: {
      checkConsent: rows({ Status: "CONFIRMED" }),
      getReferrerAttribution: rows(attribution),
      getAOAttribution: rows({ ReferrerName: "AO", AreaCode: 5, AreaName: "CENTRAL LUZON" }),
      findActiveDuplicate: rows(existingDuplicate),
      createReferral: rows({ Id: "never-reached" }),
    },
  });

const submit = async (service, user) => {
  try {
    await service.createReferral(
      {
        firstName: "Test",
        lastName: "Client",
        email: "testclient@example.com",
        planId: 1,
      },
      user,
    );
    assert.fail("expected a 409");
  } catch (error) {
    return error;
  }
};

test("a duplicate is refused with 409", async () => {
  const { service } = await stubForDuplicate();
  const error = await submit(service, { Role: BRANCH_STAFF, UserCode: "USR-STF-0115" });

  assert.equal(error.statusCode, 409);
  assert.match(error.message, /already exists/i);
});

test("the duplicate payload carries no client PII", async () => {
  const { service } = await stubForDuplicate();
  const error = await submit(service, { Role: BRANCH_STAFF, UserCode: "USR-STF-0115" });

  for (const leaked of ["MobileNumber", "Email", "FirstName", "LastName", "MiddleName", "Suffix"]) {
    assert.equal(leaked in error.data, false, `${leaked} must not be returned`);
  }
});

test("the duplicate payload exposes no identifiers for a record the caller cannot open", async () => {
  const { service } = await stubForDuplicate();
  const error = await submit(service, { Role: BRANCH_STAFF, UserCode: "USR-STF-0115" });

  for (const identifier of ["Id", "ReferrerCode", "AOCode", "BranchCode", "AreaCode"]) {
    assert.equal(identifier in error.data, false, `${identifier} must not be returned`);
  }
});

test("the duplicate payload carries exactly the fields needed to follow it up", async () => {
  const { service } = await stubForDuplicate();
  const error = await submit(service, { Role: BRANCH_STAFF, UserCode: "USR-STF-0115" });

  assert.deepEqual(Object.keys(error.data).sort(), [...allowedKeys].sort());
});

test("an Account Officer hitting the same duplicate gets the same narrowed payload", async () => {
  const { service } = await stubForDuplicate();
  const error = await submit(service, { Role: ACCOUNT_OFFICER, UserCode: "PHL-AO-0002" });

  assert.equal(error.statusCode, 409);
  assert.deepEqual(Object.keys(error.data).sort(), [...allowedKeys].sort());
});
