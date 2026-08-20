import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService } from "./helpers/userService.js";

const USER_MODEL = "../../src/models/userModel.js";

// The branch list is a 567-row, 34 KB dropdown served to an unauthenticated
// caller. banc.usp_sel_branches replaced two inline SELECTs -- one filtered by
// area, one not -- so these assert the collapse landed and that both filters
// still reach SQL as parameters rather than text.
const build = async (areaCode, search) => {
  const { model, queries, inputs } = await captureSql(USER_MODEL);
  await model.getBranches(areaCode, search).run();
  restoreSqlCapture();

  return { query: queries[0], inputs };
};

const valueOf = (inputs, name) => inputs.find((i) => i.name === name)?.value;

test("both shapes go through the one procedure", async () => {
  // There used to be two code paths returning two different queries. A caller
  // passing no area took the second; there is only one now.
  const unfiltered = await build(undefined, undefined);
  const byArea = await build(5, undefined);

  assert.equal(unfiltered.query, "EXEC banc.usp_sel_branches");
  assert.equal(byArea.query, "EXEC banc.usp_sel_branches");
});

test("the model no longer builds SQL against banc.branches", async () => {
  const { query } = await build(5, "dolores");

  assert.doesNotMatch(query, /SELECT/i);
  assert.doesNotMatch(query, /banc\.branches/i);
});

test("both parameters are always bound, present or not", async () => {
  // The procedure reads NULL as "no filter". Binding only the parameters that
  // have values would leave the other undeclared and fail at run time.
  const { inputs } = await build(undefined, undefined);

  assert.deepEqual(inputs.map((i) => i.name).sort(), ["AreaCode", "Search"]);
  assert.equal(valueOf(inputs, "AreaCode"), null);
  assert.equal(valueOf(inputs, "Search"), null);
});

test("a numeric areaCode arrives as a number, not the query string's text", async () => {
  // areaCode reaches the model as a string from the query string, and the
  // procedure declares @AreaCode INT. tedious refuses the mismatch outright.
  const { inputs } = await build("5", undefined);

  assert.equal(valueOf(inputs, "AreaCode"), 5);
  assert.equal(typeof valueOf(inputs, "AreaCode"), "number");
});

test("a non-numeric areaCode reads as absent rather than reaching sql.Int", async () => {
  // This endpoint takes no session, so anyone can send ?areaCode=abc. It used
  // to pass the truthy string straight to sql.Int and 500.
  for (const junk of ["abc", "5; DROP TABLE banc.branches", "NaN"]) {
    const { inputs } = await build(junk, undefined);

    assert.equal(valueOf(inputs, "AreaCode"), null, junk);
  }
});

test("an empty search is absent, not a match on the empty string", async () => {
  for (const blank of ["", null, undefined]) {
    const { inputs } = await build(5, blank);

    assert.equal(valueOf(inputs, "Search"), null, String(blank));
  }
});

test("the search term is bound, never concatenated into the SQL", async () => {
  const injection = "'; DROP TABLE banc.branches; --";

  const { query, inputs } = await build(undefined, injection);

  assert.equal(query, "EXEC banc.usp_sel_branches");
  assert.doesNotMatch(query, /DROP TABLE/i);
  assert.equal(valueOf(inputs, "Search"), injection);
});

test("the two filters are independent", async () => {
  const areaOnly = await build(5, undefined);
  const searchOnly = await build(undefined, "dolores");

  assert.equal(valueOf(areaOnly.inputs, "AreaCode"), 5);
  assert.equal(valueOf(areaOnly.inputs, "Search"), null);

  assert.equal(valueOf(searchOnly.inputs, "AreaCode"), null);
  assert.equal(valueOf(searchOnly.inputs, "Search"), "dolores");
});

test("the service passes both arguments through and returns the recordset bare", async () => {
  // /lookups/branches answers { success, data } with the rows unwrapped. The
  // controller adds the envelope; the service must not.
  const { service, calls } = await withUserService({
    getBranches: rows(
      { BranchCode: 58, BranchName: "San Fernando - Dolores", AreaCode: 5 },
      { BranchCode: 59, BranchName: "San Fernando - Sto Nino", AreaCode: 5 },
    ),
  });

  const data = await service.getBranches("5", "san fernando");

  assert.deepEqual(calls.find((c) => c.name === "getBranches").args, ["5", "san fernando"]);
  assert.equal(Array.isArray(data), true);
  assert.equal(data.length, 2);
  assert.deepEqual(Object.keys(data[0]), ["BranchCode", "BranchName", "AreaCode"]);
});

test("groups still uses its own inline query and was not swept up in the move", async () => {
  const { model, queries } = await captureSql(USER_MODEL);

  await model.getGroups().run();
  restoreSqlCapture();

  assert.doesNotMatch(queries[0], /^EXEC /);
  assert.match(queries[0], /FROM banc\.group_areas/i);
});
