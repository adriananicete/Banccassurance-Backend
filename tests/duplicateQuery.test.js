import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, selectedColumns } from "./helpers/captureSql.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";

const runDuplicateQuery = async () => {
  const { model, queries } = await captureSql(REFERRAL_MODEL);
  await model.findActiveDuplicate("client@example.com", "USR", 1).run();
  return selectedColumns(queries[0]);
};

test("the duplicate lookup selects only what the 409 is allowed to show", async () => {
  assert.deepEqual((await runDuplicateQuery()).sort(), [
    "AOName",
    "BranchName",
    "GroupName",
    "ReferralNo",
    "ReferrerName",
    "Status",
    "StatusDate",
  ]);
});

test("the duplicate lookup selects no client PII", async () => {
  const columns = await runDuplicateQuery();

  for (const leaked of ["MobileNumber", "Email", "FirstName", "LastName", "MiddleName", "Suffix"]) {
    assert.equal(columns.includes(leaked), false, `${leaked} must not be selected`);
  }
});

test("the duplicate lookup stays scoped by tenant and excludes settled referrals", async () => {
  const { model, queries, inputs } = await captureSql(REFERRAL_MODEL);
  await model.findActiveDuplicate("client@example.com", "USR", 1).run();

  assert.match(queries[0], /ReferrerCode LIKE @Prefix/i);
  assert.match(queries[0], /Status NOT IN \('Approved', 'Declined'\)/i);
  assert.deepEqual(
    inputs.find((input) => input.name === "Prefix"),
    { name: "Prefix", value: "USR-%" },
  );
});
