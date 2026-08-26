import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture, selectedColumns } from "./helpers/captureSql.js";

const UNDERWRITING_MODEL = "../../src/models/underwritingModel.js";

// underwritingModel is the one model that builds its WHERE by string
// concatenation. The fragments are hardcoded today, so it is safe -- these tests
// exist so it stays that way when somebody adds the next filter.
const build = async (filters) => {
  const { model, queries, inputs } = await captureSql(UNDERWRITING_MODEL);
  await model.default.getUnderwritingReferrals(filters).run();
  restoreSqlCapture();

  return { sql: queries[0], inputs };
};

test("filter values are bound as parameters, never written into the SQL", async () => {
  const injection = "'; DROP TABLE banc.Referrals; --";

  const { sql, inputs } = await build({ areaCode: injection, aoCode: injection });

  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.match(sql, /@AOCode/);

  // A non-numeric areaCode is dropped rather than bound. Referrals.GroupCode is
  // INT, so a string reached the driver and surfaced as a 500 - the same defect
  // already guarded in userModel.getBranches, where ?areaCode=abc now means
  // "no filter" rather than an error.
  assert.doesNotMatch(sql, /@GroupCode/);

  assert.deepEqual(
    inputs.map((i) => i.value),
    [injection],
  );
});

test("an absent filter adds neither a parameter nor a clause", async () => {
  const { sql, inputs } = await build({});

  assert.equal(inputs.length, 0);
  assert.doesNotMatch(sql, /@GroupCode/);
  assert.doesNotMatch(sql, /@AOCode/);
});

test("each filter is added independently", async () => {
  const areaOnly = await build({ areaCode: "5" });
  assert.match(areaOnly.sql, /@GroupCode/);
  assert.doesNotMatch(areaOnly.sql, /@AOCode/);

  const aoOnly = await build({ aoCode: "PHL-AO-0001" });
  assert.match(aoOnly.sql, /@AOCode/);
  assert.doesNotMatch(aoOnly.sql, /@GroupCode/);
});

test("underwriting only ever sees the three statuses it can act on", async () => {
  // Deferred is AO-side only and must never appear here, whatever filters are
  // passed. A filter appended in the wrong place could widen this clause.
  for (const filters of [{}, { areaCode: "5" }, { aoCode: "X" }, { areaCode: "5", aoCode: "X" }]) {
    const { sql } = await build(filters);

    assert.match(sql, /Status IN \('Presented', 'Closed Pending', 'Postponed'\)/);
    assert.doesNotMatch(sql, /Deferred/);
  }
});

test("the filters extend the status clause rather than replacing it", async () => {
  // Every appended fragment starts with AND. One written without it would turn
  // the whole WHERE into something else entirely.
  const { sql } = await build({ areaCode: "5", aoCode: "PHL-AO-0001" });

  const where = sql.slice(sql.indexOf("WHERE"));
  assert.match(where, /Status IN[\s\S]*AND GroupCode = @GroupCode[\s\S]*AND AOCode = @AOCode/);
  assert.doesNotMatch(where, /\bOR\b/);
});

test("the column list is explicit and carries no consent token", async () => {
  // The external system reads this. A SELECT * here would hand ConsentToken to
  // a consumer outside the organisation, which is item 8 with worse reach.
  const { sql } = await build({});

  assert.doesNotMatch(sql, /SELECT\s+\*/i);
  assert.doesNotMatch(sql, /ConsentToken/);

  const columns = selectedColumns(sql);
  assert.ok(columns.includes("ReferralNo"), columns.join(", "));
  assert.ok(columns.includes("Status"), columns.join(", "));
});

test("results come back oldest first, so the queue is worked in order", async () => {
  const { sql } = await build({});

  assert.match(sql, /ORDER BY StatusDate ASC/);
});
