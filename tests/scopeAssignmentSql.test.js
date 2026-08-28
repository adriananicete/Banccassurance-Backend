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
  emitted("replaceRegionalSalesHeadAreas", ["PHL-RSH-0002", 2, AUDIT]);

test("the Area Sales Head write names GroupCode, not the dropped column", async () => {
  const sql = await assignAreas();

  assert.match(sql, /INSERT INTO banc\.area_sales_head_areas \(UserCode, GroupCode\)/i);
  assert.doesNotMatch(sql, /AreaCode/i);
});

test("the Regional Sales Head holds a region by holding its groups", async () => {
  // Changed 2026-08-28. The Department Head now names a region and the insert
  // expands it: one junction row per group in that region. Before, the caller
  // enumerated the groups.
  //
  // The stored shape did not move, and that is the whole point of doing it this
  // way. GroupCode stays the unit of scope, so every check that reads this table
  // is untouched -- isAshInRegionalScope joins a.GroupCode = r.GroupCode, and the
  // RSH block of four procedures filters on GroupCode. Deriving the scope from
  // the region at read time would have meant five stored procedure blocks.
  const sql = await assignGroups();

  assert.match(sql, /INSERT INTO banc\.regional_sales_head_areas \(UserCode, GroupCode, RegionCode\)/i);
  assert.match(sql, /FROM banc\.group_areas g\s+WHERE g\.RegionCode = @RegionCode/i);
  assert.doesNotMatch(sql, /AreaCode/i);
});

test("the stored RegionCode is still the group's own, not the one that was sent", async () => {
  // The guarantee this replaces "RegionCode is never bound as a parameter".
  //
  // That test was right for the old shape: the region arriving as an input meant
  // it was being supplied rather than derived. Now @RegionCode arrives as the
  // filter -- it chooses which groups, and never becomes the value written.
  // Recording it in a second place is what would let the two disagree.
  const sql = await assignGroups();

  assert.match(sql, /SELECT @UserCode, g\.GroupCode, g\.RegionCode/i);
  assert.doesNotMatch(sql, /SELECT @UserCode, g\.GroupCode, @RegionCode/i);
});

test("the region is bound, never written into the SQL", async () => {
  const { model, inputs } = await captureSql(USER_MODEL);
  await model.replaceRegionalSalesHeadAreas("PHL-RSH-0002", 2, AUDIT).run();
  restoreSqlCapture();

  const region = inputs.find((i) => i.name === "RegionCode");

  assert.equal(region.value, 2);
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
