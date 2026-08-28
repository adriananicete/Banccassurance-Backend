import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules } from "./helpers/stubModel.js";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { captureThrown } from "./helpers/userService.js";
import {
  AREA_SALES_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";

const AUDIT_MODEL = "../../src/models/auditModel.js";
const AUDIT_SERVICE = "../../src/services/auditService.js";

const row = (overrides = {}) => ({
  Id: 5,
  ActorUserCode: "SYS-ADM-0001",
  Action: "BRANCHES_ASSIGNED",
  EntityType: "SCOPE",
  EntityId: "PHL-AO-0014",
  Detail: "71,255",
  CreatedAt: "2026-08-24T08:40:39.158Z",
  TotalCount: 4,
  ...overrides,
});

const withAudit = (...records) =>
  withStubbedModules(
    { [AUDIT_MODEL]: { list: () => ({ run: async () => ({ recordset: records }) }) } },
    AUDIT_SERVICE,
  );

const OPTIONS = { PageNumber: 1, PageSize: 20 };

test("a superadmin reads the log", async () => {
  const { service } = await withAudit(row(), row({ Id: 4 }));

  const result = await service.list({ Role: SUPERADMIN, UserCode: "SYS-ADM-0001" }, OPTIONS);

  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].ActorUserCode, "SYS-ADM-0001");
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 20,
    totalCount: 4,
    totalPages: 1,
  });
});

test("every other role is refused, including the ones that write to the log", async () => {
  // The three overseer roles and an Area Sales Head all *create* audit rows by
  // approving and assigning. Writing to a log is not permission to read it -
  // the log names who acted on whom, across the whole tenant.
  for (const Role of [SECTOR_HEAD, DEPARTMENT_HEAD, AREA_SALES_HEAD, BRANCH_STAFF]) {
    const { service } = await withAudit(row());

    const error = await captureThrown(() =>
      service.list({ Role, UserCode: "USR-SEC-0029" }, OPTIONS),
    );

    assert.equal(error?.statusCode, 403, Role);
  }
});

test("TotalCount is read once and stripped from every row", async () => {
  const { service } = await withAudit(row(), row({ Id: 4 }));

  const result = await service.list({ Role: SUPERADMIN }, OPTIONS);

  assert.equal(result.pagination.totalCount, 4);
  for (const entry of result.data) {
    assert.equal("TotalCount" in entry, false);
  }
});

test("an empty page answers zero rather than throwing", async () => {
  const { service } = await withAudit();

  const result = await service.list({ Role: SUPERADMIN }, OPTIONS);

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
});

test("the query orders by a pair that cannot tie", async () => {
  // CreatedAt alone is what item 20a exists for: with a tie a row can appear on
  // two pages or none. Id is a bigint identity, so the pair is total.
  const { model, queries } = await captureSql(AUDIT_MODEL);
  await model.list(OPTIONS).run();
  restoreSqlCapture();

  assert.match(queries[0], /ORDER BY \[CreatedAt\] DESC, \[Id\] DESC/i);
  assert.match(queries[0], /OFFSET \(@PageNumber - 1\) \* @PageSize ROWS/i);
  assert.match(queries[0], /COUNT\(\*\) OVER\(\) AS TotalCount/i);
});

test("every filter is bound, never written into the SQL", async () => {
  const injection = "'; DROP TABLE banc.AuditLog; --";

  const { model, queries, inputs } = await captureSql(AUDIT_MODEL);
  await model
    .list({ ...OPTIONS, Action: injection, EntityId: injection, ActorUserCode: injection })
    .run();
  restoreSqlCapture();

  assert.doesNotMatch(queries[0], /DROP TABLE/i);

  const bound = Object.fromEntries(inputs.map(({ name, value }) => [name, value]));
  assert.equal(bound.Action, injection);
  assert.equal(bound.EntityId, injection);
  assert.equal(bound.ActorUserCode, injection);
});

test("an omitted filter is null rather than an empty string", async () => {
  // Every filter arm reads `@X IS NULL OR ...`. An empty string would fall
  // through to the comparison and match nothing, so the list would come back
  // empty for a caller who passed no filter at all.
  const { model, inputs } = await captureSql(AUDIT_MODEL);
  await model.list({ ...OPTIONS, Action: "", EntityId: undefined }).run();
  restoreSqlCapture();

  const bound = Object.fromEntries(inputs.map(({ name, value }) => [name, value]));
  assert.equal(bound.Action, null);
  assert.equal(bound.EntityId, null);
  assert.equal(bound.DateFrom, null);
  assert.equal(bound.DateTo, null);
});
