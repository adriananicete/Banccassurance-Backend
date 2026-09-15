import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules } from "./helpers/stubModel.js";

const REFERRAL_MODEL = "../../src/models/referralModel.js";
const REFERRAL_SERVICE = "../../src/services/referralService.js";

const USER = { Role: "ACCOUNT_OFFICER", UserCode: "PHL-AO-1168", BranchCode: null, GroupCode: "5" };
const PAGE = { PageNumber: 2, PageSize: 20 };

const listing = (...records) =>
  withStubbedModules(
    {
      [REFERRAL_MODEL]: {
        getReferralsByRole: () => ({ run: async () => ({ recordset: records }) }),
        getReferralCountsByRole: () => ({ run: async () => ({ recordset: records }) }),
      },
    },
    REFERRAL_SERVICE,
  );

const referralRow = (overrides = {}) => ({
  Id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  ReferralNo: "REF-20260819-ABC123",
  FirstName: "Juan",
  Status: "Referred",
  ConsentToken: "9a0c0305-e82c-3301-4f89-11d33f2504e0",
  TotalCount: 57,
  ...overrides,
});

test("the consent token never reaches the response", async () => {
  // The procedure names its columns now and no longer returns ConsentToken, so
  // this destructure is defence in depth rather than the only protection. It
  // stays because the column list is the DBA's and can widen without notice.
  const { service } = await listing(referralRow(), referralRow({ FirstName: "Maria" }));

  const result = await service.getReferralsByRole(USER, PAGE);

  for (const row of result.data) {
    assert.equal("ConsentToken" in row, false);
  }
  assert.doesNotMatch(JSON.stringify(result), /ConsentToken/);
});

test("TotalCount is read once and then stripped from every row", async () => {
  // It rides along on each row from COUNT(*) OVER(). Leaving it in would put a
  // paging artefact into every referral object the frontend renders.
  const { service } = await listing(referralRow(), referralRow());

  const result = await service.getReferralsByRole(USER, PAGE);

  assert.equal(result.pagination.totalCount, 57);
  for (const row of result.data) {
    assert.equal("TotalCount" in row, false);
  }
});

test("the real columns survive the stripping", async () => {
  // The destructure removes two named keys and spreads the rest. A rewrite that
  // whitelisted instead would silently drop columns as they are added.
  const { service } = await listing(referralRow());

  const [row] = (await service.getReferralsByRole(USER, PAGE)).data;

  assert.equal(row.ReferralNo, "REF-20260819-ABC123");
  assert.equal(row.FirstName, "Juan");
  assert.equal(row.Status, "Referred");
});

test("pagination is echoed back and the page count is rounded up", async () => {
  const { service } = await listing(referralRow({ TotalCount: 57 }));

  const { pagination } = await service.getReferralsByRole(USER, PAGE);

  assert.deepEqual(pagination, { page: 2, pageSize: 20, totalCount: 57, totalPages: 3 });
});

test("an empty page answers zero rather than throwing on recordset[0]", async () => {
  // A page past the end returns no rows at all, so there is no row to read
  // TotalCount from. The optional chain and the ?? 0 are what stop that being
  // a 500 on an ordinary out-of-range page.
  const { service } = await listing();

  const result = await service.getReferralsByRole(USER, PAGE);

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
});

const overseers = [
  { Role: "SECTOR_HEAD", UserCode: "USR-SEC-0001" },
  { Role: "DEPARTMENT_HEAD", UserCode: "PHL-DH-0001" },
];

test("an overseer's list is the same shape as every other role's", async () => {
  // These two once took a different query, and it returned a bare array while
  // every other role got { data, pagination }. The controller then spread it
  // into an object literal, so the caller received { success, 0: {…}, 1: {…} } —
  // numeric keys, no data, no pagination.
  for (const user of overseers) {
    const { service } = await listing(referralRow(), referralRow());

    const result = await service.getReferralsByRole(user, PAGE);

    assert.equal(Array.isArray(result), false, user.Role);
    assert.ok(Array.isArray(result.data), user.Role);
    assert.equal(result.data.length, 2, user.Role);
    assert.deepEqual(
      result.pagination,
      { page: 2, pageSize: 20, totalCount: 57, totalPages: 3 },
      user.Role,
    );
  }
});

test("an overseer's filters reach the list procedure, the same as every other role's", async () => {
  // R11. These two had their own hand-written query, which bound only paging, so
  // search, status, verified, the dates and the sort were parsed and dropped —
  // a "Declined, last 3 months" preview listed the whole tenant. The procedure
  // has scoped them correctly since A1 and A3 (2026-08-28) and applies every
  // filter, so they go through it and the export's filters match the list's.
  const filters = {
    ...PAGE,
    Search: "Juan",
    Status: "Declined",
    Verified: 1,
    DateFrom: "2026-07-01",
    DateTo: "2026-09-30",
    SortBy: "StatusDate",
    SortDir: "ASC",
  };

  for (const user of overseers) {
    const { service, calls } = await listing(referralRow());

    await service.getReferralsByRole(user, filters);

    const listCalls = calls.filter((entry) => entry.name === "getReferralsByRole");
    assert.equal(listCalls.length, 1, user.Role);
    assert.equal(listCalls[0].args[0], user, user.Role);
    assert.deepEqual(listCalls[0].args[1], filters, user.Role);
  }
});

test("the counts total is the sum of the per-status rows", async () => {
  const { service } = await listing(
    { Status: "Referred", Total: 12 },
    { Status: "Presented", Total: 5 },
    { Status: "Approved", Total: 3 },
  );

  const result = await service.getReferralCounts(USER);

  assert.equal(result.total, 20);
  assert.equal(result.data.length, 3);
});

test("counts with no rows total zero instead of NaN", async () => {
  const { service } = await listing();

  const result = await service.getReferralCounts(USER);

  assert.equal(result.total, 0);
  assert.deepEqual(result.data, []);
});
