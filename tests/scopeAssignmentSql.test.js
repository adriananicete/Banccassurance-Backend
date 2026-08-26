import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const USER_MODEL = "../../src/models/userModel.js";

const AUDIT = {
  actorUserCode: "PHL-DH-0001",
  action: "GROUPS_ASSIGNED",
  entityType: "SCOPE",
  entityId: "PHL-RSH-0002",
  detail: "4,5,6",
};

// assignScope.test.js stubs both replace* functions wholesale, so nothing there
// can see the SQL they emit. These two writes are the only place the backend
// creates a scope row, and both of them moved on 2026-08-26.
const emitted = async (fn, args) => {
  const { model, transactions } = await captureSql(USER_MODEL);
  await model[fn](...args).run();
  restoreSqlCapture();

  return transactions[0].events.join("\n");
};

const assignAreas = () =>
  emitted("replaceAreaSalesHeadAreas", ["PHL-ASH-0005", "5,6,7", AUDIT]);

const assignGroups = () =>
  emitted("replaceRegionalSalesHeadAreas", ["PHL-RSH-0002", "4,5,6", AUDIT]);

test("the Area Sales Head write names GroupCode, not the dropped column", async () => {
  const sql = await assignAreas();

  assert.match(sql, /INSERT INTO banc\.area_sales_head_areas \(UserCode, GroupCode\)/i);
  assert.doesNotMatch(sql, /AreaCode/i);
});

test("the Regional Sales Head write reaches the region rather than being given it", async () => {
  // regional_sales_head_areas carries RegionCode as well as GroupCode. Supplying
  // it from the application would record the structure in a second place, and
  // the two could then disagree -- so the insert joins group_areas and takes the
  // region from the group. An unknown group falls out of the join instead of
  // being written.
  const sql = await assignGroups();

  assert.match(sql, /INSERT INTO banc\.regional_sales_head_areas \(UserCode, GroupCode, RegionCode\)/i);
  assert.match(sql, /INNER JOIN banc\.group_areas g ON g\.GroupCode = CAST\(s\.value AS INT\)/i);
  assert.match(sql, /SELECT @UserCode, g\.GroupCode, g\.RegionCode/i);
  assert.doesNotMatch(sql, /AreaCode/i);
});

test("RegionCode is never bound as a parameter", async () => {
  // The mutation guard for the line above. If the region ever arrives as an
  // input it is being supplied rather than derived, whatever the SQL says.
  const { model, inputs } = await captureSql(USER_MODEL);
  await model.replaceRegionalSalesHeadAreas("PHL-RSH-0002", "4,5,6", AUDIT).run();
  restoreSqlCapture();

  assert.equal(
    inputs.some((i) => i.name === "RegionCode"),
    false,
  );
});

test("both writes replace the whole set, and do it inside the transaction", async () => {
  // A PUT replaces rather than merges. The DELETE and the INSERT have to be on
  // the same transaction or a failed insert leaves the head with no scope at all.
  for (const [name, run] of [["areas", assignAreas], ["groups", assignGroups]]) {
    const sql = await run();

    assert.match(sql, /^begin/, name);
    assert.match(sql, /commit$/, name);
    assert.match(sql, /DELETE FROM banc\.\w+_sales_head_areas WHERE UserCode = @UserCode/i, name);
  }
});

test("the codes arrive as one delimited string, never concatenated into the SQL", async () => {
  const { model, inputs } = await captureSql(USER_MODEL);
  await model.replaceAreaSalesHeadAreas("PHL-ASH-0005", "5,6,7", AUDIT).run();
  restoreSqlCapture();

  const codes = inputs.find((i) => i.name === "GroupCodes");

  assert.equal(codes?.value, "5,6,7");
});
