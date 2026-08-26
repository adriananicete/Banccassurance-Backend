import test from "node:test";
import assert from "node:assert/strict";
import { paging, MAX_PAGE_SIZE } from "../src/utils/paging.js";

// One helper replacing four byte-identical copies in auditController,
// notificationController, userController and lookupController. The copies had
// not drifted yet; they were four chances to.
test("the keys are the ones the procedures declare", async () => {
  // Every paged procedure takes @PageNumber and @PageSize. Returning page /
  // pageSize here would bind parameters no procedure declares -- error 8145,
  // which is a 500 rather than a bad page.
  assert.deepEqual(Object.keys(paging({})).sort(), ["PageNumber", "PageSize"]);
});

test("nothing supplied is page 1 of the caller's default", async () => {
  assert.deepEqual(paging({}), { PageNumber: 1, PageSize: 20 });
  assert.deepEqual(paging({}, 100), { PageNumber: 1, PageSize: 100 });
});

test("the query string's text arrives as numbers", async () => {
  // req.query is always text. The procedures declare both as INT and tedious
  // refuses the mismatch before the query is sent.
  const { PageNumber, PageSize } = paging({ page: "3", pageSize: "50" });

  assert.equal(PageNumber, 3);
  assert.equal(PageSize, 50);
  assert.equal(typeof PageNumber, "number");
  assert.equal(typeof PageSize, "number");
});

test("a page size above the cap is clamped, not passed on", async () => {
  // usp_sel_branches clamps to 100 itself, so an unclamped 9999 would come back
  // as 100 rows while the pagination block claimed 9999 -- the block would be
  // lying about the page it just returned.
  for (const requested of ["9999", 101, MAX_PAGE_SIZE + 1]) {
    assert.equal(paging({ pageSize: requested }).PageSize, MAX_PAGE_SIZE, String(requested));
    assert.equal(paging({ pageSize: requested }, 100).PageSize, MAX_PAGE_SIZE, String(requested));
  }
});

test("junk and out-of-range values fall back rather than reaching SQL", async () => {
  // These endpoints take a query string from anyone; /lookups/branches does not
  // even take a session.
  for (const junk of ["abc", "", "0", "-1", null, undefined, "NaN"]) {
    assert.equal(paging({ page: junk }).PageNumber, 1, String(junk));
    assert.equal(paging({ page: junk, pageSize: junk }).PageSize, 20, String(junk));
  }
});

test("text with a leading number keeps the number and drops the rest", async () => {
  // parseInt stops at the first non-digit, so "1; DROP TABLE" is 1 -- a number,
  // and a valid one. Worth asserting rather than assuming it becomes NaN: what
  // matters is that nothing textual survives to be bound, and it does not.
  const { PageNumber, PageSize } = paging({ page: "2; DROP TABLE", pageSize: "5 rows" });

  assert.equal(PageNumber, 2);
  assert.equal(PageSize, 5);
  assert.equal(typeof PageSize, "number");
});

test("a fractional page size takes its integer part rather than reaching sql.Int", async () => {
  // parseInt, not Number: OFFSET/FETCH refuses a decimal.
  assert.equal(paging({ pageSize: "20.9" }).PageSize, 20);
  assert.equal(paging({ page: "2.7" }).PageNumber, 2);
});

test("the default only fills a missing size, it never overrides a given one", async () => {
  assert.equal(paging({ pageSize: "5" }, 100).PageSize, 5);
  assert.equal(paging({ pageSize: "5" }).PageSize, 5);
});
