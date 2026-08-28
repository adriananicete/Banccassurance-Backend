import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows, scopeHit } from "./helpers/stubModel.js";
import { withUserService, target, captureThrown, noRows } from "./helpers/userService.js";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";

const AUDIT_MODEL = "../../src/models/auditModel.js";
const AUDIT_SERVICE = "../../src/services/auditService.js";

const ASH = { UserCode: "PHL-ASH-1167", Role: "AREA_SALES_HEAD" };
const RSH = { UserCode: "PHL-RSH-1164", Role: "REGIONAL_SALES_HEAD" };
const DH = { UserCode: "PHL-DH-0001", Role: "DEPARTMENT_HEAD" };

const logged = (calls) => calls.filter((c) => c.name === "record").map((c) => c.args[0]);

// ------------------------------------------------------------ the helper itself

test("a failing audit write is not swallowed", async () => {
  // The one behaviour that separates record from safeNotify next door. A
  // notification that never arrives is an inconvenience; an administrative action
  // that happened without a record is what this table exists to prevent.
  const { service } = await withStubbedModules(
    {
      [AUDIT_MODEL]: {
        insert: () => ({
          run: async () => {
            throw new Error("AuditLog insert failed");
          },
        }),
      },
    },
    AUDIT_SERVICE,
  );

  await assert.rejects(() =>
    service.record({ actorUserCode: "X", action: "Y", entityType: "USER" }),
  );
});

test("the audit row is written in UTC and names its columns", async () => {
  const { model, queries, inputs } = await captureSql(AUDIT_MODEL);
  model
    .insert({
      actorUserCode: "PHL-ASH-1167",
      action: "USER_APPROVED",
      entityType: "USER",
      entityId: "PHL-AO-1168",
      detail: "ACCOUNT_OFFICER",
    })
    .run();
  restoreSqlCapture();

  assert.match(queries[0], /INSERT INTO \[banc\]\.\[AuditLog\]/);
  assert.match(queries[0], /SYSUTCDATETIME\(\)/);
  assert.doesNotMatch(queries[0], /GETDATE\(\)/);
  assert.deepEqual(
    inputs.map((i) => i.name),
    ["ActorUserCode", "Action", "EntityType", "EntityId", "Detail"],
  );
});

test("a numeric entityId reaches SQL as text", async () => {
  // EntityId is NVARCHAR. A number would repeat the Invalid string failure that
  // broke Account Officer registration and, separately, the referral list.
  const { model, inputs } = await captureSql(AUDIT_MODEL);
  model.insert({ actorUserCode: "X", action: "Y", entityType: "SCOPE", entityId: 1784 }).run();
  restoreSqlCapture();

  const entityId = inputs.find((i) => i.name === "EntityId");
  assert.equal(typeof entityId.value, "string");
  assert.equal(entityId.value, "1784");
});

// --------------------------------------------------------------- approve / reject

const approvalModel = (overrides = {}) => ({
  getUserScopeById: target({ IsActive: 0, Role: "ACCOUNT_OFFICER", GroupCode: 5 }),
  isAreaInAreaSalesHeadScope: scopeHit,
  approveRejectUser: rows({
    Success: 1,
    Message: "User approved successfully.",
    FirstName: "Ana",
    Email: "ana@example.com",
    UserCode: "PHL-AO-1168",
  }),
  ...overrides,
});

test("approving records the approver as the actor, not the approved user", async () => {
  // Getting this backwards produces a log that reads plausibly and is useless.
  const { service, calls } = await withUserService(approvalModel());

  await service.approveRejectUser(ASH, 1784, "APPROVE");

  const [entry] = logged(calls);
  assert.equal(entry.actorUserCode, "PHL-ASH-1167");
  assert.equal(entry.entityId, "PHL-AO-1168");
  assert.equal(entry.action, "USER_APPROVED");
  assert.equal(entry.entityType, "USER");
  assert.equal(entry.detail, "ACCOUNT_OFFICER");
});

test("rejecting is recorded under its own action", async () => {
  const { service, calls } = await withUserService(
    approvalModel({
      approveRejectUser: rows({
        Success: 1,
        Message: "User rejected successfully.",
        FirstName: "Ana",
        Email: "ana@example.com",
        UserCode: "PHL-AO-1168",
      }),
    }),
  );

  await service.approveRejectUser(ASH, 1784, "REJECT");

  assert.equal(logged(calls)[0].action, "USER_REJECTED");
});

test("the log is written before the email, so a failed email leaves a record", async () => {
  const { service, calls } = await withUserService(approvalModel());

  await service.approveRejectUser(ASH, 1784, "APPROVE");

  const order = calls.map((c) => c.name);
  assert.ok(order.indexOf("record") < order.indexOf("sendApprovalEmail"), order.join(" -> "));
});

test("a refused approval writes no audit row", async () => {
  // Actions that did not happen must not appear in the log.
  const alreadyDone = await withUserService(
    approvalModel({ getUserScopeById: target({ IsActive: 1, Role: "ACCOUNT_OFFICER", GroupCode: 5 }) }),
  );
  const stateError = await captureThrown(() =>
    alreadyDone.service.approveRejectUser(ASH, 1784, "APPROVE"),
  );

  assert.equal(stateError?.statusCode, 400);
  assert.equal(logged(alreadyDone.calls).length, 0);

  const outOfScope = await withUserService(
    approvalModel({ isAreaInAreaSalesHeadScope: noRows }),
  );
  const scopeError = await captureThrown(() =>
    outOfScope.service.approveRejectUser(ASH, 1784, "APPROVE"),
  );

  assert.equal(scopeError?.statusCode, 403);
  assert.equal(logged(outOfScope.calls).length, 0);
});

// ------------------------------------------------------------- scope assignment

const assignModel = (role) => ({
  getUserScopeById: target({ IsActive: 1, Role: role, GroupCode: 5, UserCode: "PHL-TGT-0001" }),
  isAreaInAreaSalesHeadScope: scopeHit,
  isAshInRegionalScope: scopeHit,
  getBranchesOutsideAreaSalesHeadScope: noRows,
  getBranchesAssignedToOtherAO: noRows,
  getAreasOutsideRegionalSalesHeadScope: noRows,
  getGroupsAssignedToOtherASH: noRows,
  getUnknownAreas: noRows,
  getGroupsInRegion: rows(
    { GroupCode: 1, GroupName: "CENTRAL NCR", RegionCode: 1, RegionName: "NCR" },
    { GroupCode: 2, GroupName: "NORTH NCR", RegionCode: 1, RegionName: "NCR" },
  ),
  replaceAccountOfficerBranches: () => ({ run: async () => ({}) }),
  replaceAreaSalesHeadAreas: () => ({ run: async () => ({}) }),
  replaceRegionalSalesHeadAreas: () => ({ run: async () => ({}) }),
});

// A scope assignment no longer calls auditService.record. The entry travels as
// the third argument to the replace* model function, which writes it on the same
// transaction as the DELETE and INSERT -- so the change and its log commit
// together or not at all. These read the entry from where it now goes.
const assigned = (calls, name) => calls.find((c) => c.name === name)?.args[2];

test("each scope assignment carries its own action with the codes it applied", async () => {
  const cases = [
    ["ACCOUNT_OFFICER", (s) => s.replaceAccountOfficerBranches(ASH, 1, [40, 41]), "replaceAccountOfficerBranches", "BRANCHES_ASSIGNED", "40,41"],
    ["AREA_SALES_HEAD", (s) => s.replaceAreaSalesHeadAreas(RSH, 1, [5, 6]), "replaceAreaSalesHeadAreas", "AREAS_ASSIGNED", "5,6"],
    // The Regional Sales Head is assigned a region, so the log records the
    // region and what it expanded to. "region 1" alone would not say which
    // groups the head actually held that day, and group_areas can change.
    ["REGIONAL_SALES_HEAD", (s) => s.replaceRegionalSalesHeadAreas(DH, 1, 1), "replaceRegionalSalesHeadAreas", "GROUPS_ASSIGNED", "region 1: 1,2"],
  ];

  for (const [role, call, modelFn, action, detail] of cases) {
    const { service, calls } = await withUserService(assignModel(role));
    await call(service);

    const entry = assigned(calls, modelFn);
    assert.ok(entry, `${role} passed no audit entry`);
    assert.equal(entry.action, action, role);
    assert.equal(entry.entityType, "SCOPE", role);
    assert.equal(entry.entityId, "PHL-TGT-0001", role);
    assert.equal(entry.detail, detail, role);

    // The separate write is gone; if both fire the row lands twice.
    assert.equal(logged(calls).length, 0, `${role} also called record`);
  }
});

test("the actor is the caller, never the target, on every assignment", async () => {
  const { service, calls } = await withUserService(assignModel("AREA_SALES_HEAD"));
  await service.replaceAreaSalesHeadAreas(RSH, 1, [5]);

  const entry = assigned(calls, "replaceAreaSalesHeadAreas");
  assert.equal(entry.actorUserCode, "PHL-RSH-1164");
  assert.notEqual(entry.actorUserCode, entry.entityId);
});

test("the log records the new set, not the previous one", async () => {
  // These are replace operations. The prior state is the previous log row for
  // that entity, so reading the old set first would double the queries for
  // something the log already holds.
  const { service, calls } = await withUserService(assignModel("AREA_SALES_HEAD"));
  await service.replaceAreaSalesHeadAreas(RSH, 1, [7]);

  assert.equal(assigned(calls, "replaceAreaSalesHeadAreas").detail, "7");
});

test("an empty branch set is still recorded, since removing scope is an action", async () => {
  const { service, calls } = await withUserService(assignModel("ACCOUNT_OFFICER"));
  await service.replaceAccountOfficerBranches(ASH, 1, []);

  const entry = assigned(calls, "replaceAccountOfficerBranches");
  assert.equal(entry.action, "BRANCHES_ASSIGNED");
  assert.equal(entry.detail, "");
});

test("a refused assignment never reaches the model, so nothing is written or logged", async () => {
  const { service, calls } = await withUserService({
    ...assignModel("ACCOUNT_OFFICER"),
    getBranchesAssignedToOtherAO: rows({ BranchCode: 58 }),
  });

  const error = await captureThrown(() => service.replaceAccountOfficerBranches(ASH, 1, [58]));

  assert.equal(error?.statusCode, 409);
  assert.equal(calls.some((c) => c.name === "replaceAccountOfficerBranches"), false);
  assert.equal(logged(calls).length, 0);
});
