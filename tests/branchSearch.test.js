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
const build = async (groupCode, search, options) => {
  const { model, queries, inputs } = await captureSql(USER_MODEL);
  await model.getBranches(groupCode, search, options).run();
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

test("all four parameters are always bound, present or not", async () => {
  // The procedure reads NULL as "no filter". Binding only the parameters that
  // have values would leave the other undeclared and fail at run time.
  //
  // @PageNumber and @PageSize arrived with item 21b and went unbound for days:
  // no error, no warning, twenty rows of 567. The parameter name is still
  // @GroupCode since the parameter rename landed on 2026-08-26; before that it
  // was @AreaCode, and binding the old name is error 8145 rather than a bad page.
  const { inputs } = await build(undefined, undefined);

  assert.deepEqual(inputs.map((i) => i.name).sort(), [
    "GroupCode",
    "PageNumber",
    "PageSize",
    "Search",
  ]);
  assert.equal(valueOf(inputs, "GroupCode"), null);
  assert.equal(valueOf(inputs, "Search"), null);
});

test("the default page size is 100, not the procedure's 20", async () => {
  // The whole defect in one assertion. usp_sel_branches defaults @PageSize to
  // 20, so an unbound call silently truncates. The largest group holds 52
  // branches, so 100 is what makes every ?groupCode= call fit in one page --
  // which is the real registration flow, pick a group then a branch.
  const { inputs } = await build(undefined, undefined);

  assert.equal(valueOf(inputs, "PageSize"), 100);
  assert.equal(valueOf(inputs, "PageNumber"), 1);
});

test("paging options are bound as numbers, whatever the query string held", async () => {
  const { inputs } = await build(1, undefined, { PageNumber: "3", PageSize: "50" });

  assert.equal(valueOf(inputs, "PageNumber"), 3);
  assert.equal(typeof valueOf(inputs, "PageNumber"), "number");
  assert.equal(valueOf(inputs, "PageSize"), 50);
});

test("junk paging falls back rather than reaching sql.Int", async () => {
  // asInt answers null for junk since 2026-08-27, so `asInt(x) ?? 1` is enough
  // on its own now. The Number.isFinite guards here are what this function had
  // to do while asInt still returned NaN; they are belt and braces today and
  // are left because they cost nothing and this is the path that found it.
  for (const junk of ["abc", "", null, undefined, "NaN"]) {
    const { inputs } = await build(1, undefined, { PageNumber: junk, PageSize: junk });

    assert.equal(valueOf(inputs, "PageNumber"), 1, String(junk));
    assert.equal(valueOf(inputs, "PageSize"), 100, String(junk));
  }
});

test("a numeric groupCode arrives as a number, not the query string's text", async () => {
  // groupCode reaches the model as a string from the query string, and the
  // procedure declares @GroupCode INT. tedious refuses the mismatch outright.
  const { inputs } = await build("5", undefined);

  assert.equal(valueOf(inputs, "GroupCode"), 5);
  assert.equal(typeof valueOf(inputs, "GroupCode"), "number");
});

test("a non-numeric groupCode reads as absent rather than reaching sql.Int", async () => {
  // This endpoint takes no session, so anyone can send ?groupCode=abc. It used
  // to pass the truthy string straight to sql.Int and 500.
  for (const junk of ["abc", "5; DROP TABLE banc.branches", "NaN"]) {
    const { inputs } = await build(junk, undefined);

    assert.equal(valueOf(inputs, "GroupCode"), null, junk);
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

  assert.equal(valueOf(areaOnly.inputs, "GroupCode"), 5);
  assert.equal(valueOf(areaOnly.inputs, "Search"), null);

  assert.equal(valueOf(searchOnly.inputs, "GroupCode"), null);
  assert.equal(valueOf(searchOnly.inputs, "Search"), "dolores");
});

const branchRows = (...records) =>
  withUserService({ getBranches: rows(...records) });

test("the service strips TotalCount and reports it in pagination instead", async () => {
  // COUNT(*) OVER() rides on every row. It is the total for the whole set, so it
  // has to be read before the strip and reported beside the rows rather than on
  // them -- a page of 20 must not hand back a row saying 52.
  const { service } = await branchRows(
    { BranchCode: 58, BranchName: "San Fernando - Dolores", ClusterCode: null, GroupCode: 5, TotalCount: 52 },
    { BranchCode: 59, BranchName: "San Fernando - Sto Nino", ClusterCode: 11, GroupCode: 5, TotalCount: 52 },
  );

  const result = await service.getBranches("5", "san fernando", { PageNumber: 1, PageSize: 100 });

  assert.deepEqual(Object.keys(result.data[0]), [
    "BranchCode",
    "BranchName",
    "ClusterCode",
    "GroupCode",
  ]);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 100,
    totalCount: 52,
    totalPages: 1,
  });
});

test("the service passes the paging options through to the model", async () => {
  const { service, calls } = await branchRows();

  await service.getBranches("5", "san fernando", { PageNumber: 2, PageSize: 100 });

  assert.deepEqual(calls.find((c) => c.name === "getBranches").args, [
    "5",
    "san fernando",
    { PageNumber: 2, PageSize: 100 },
  ]);
});

test("an empty page reports a zero total rather than throwing on the missing row", async () => {
  // recordset[0] does not exist when nothing matches, and TotalCount is read
  // from it. ?groupCode=99 is reachable by anyone -- the endpoint takes no
  // session.
  const { service } = await branchRows();

  const result = await service.getBranches("99", null, { PageNumber: 1, PageSize: 100 });

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
});

test("groups still uses its own inline query, and now names the group columns", async () => {
  // group_areas dropped AreaCode/AreaName on 2026-08-26; GroupCode/GroupName is
  // all that is left. Asserting the absence keeps a revert from passing here.
  const { model, queries } = await captureSql(USER_MODEL);

  await model.getGroups().run();
  restoreSqlCapture();

  assert.doesNotMatch(queries[0], /^EXEC /);
  assert.match(queries[0], /FROM banc\.group_areas/i);
  assert.match(queries[0], /SELECT\s+GroupCode,\s*GroupName/i);
  assert.doesNotMatch(queries[0], /AreaCode|AreaName/i);
});
