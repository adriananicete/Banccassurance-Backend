import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";
import { directKeyFor } from "../src/services/messagingService.js";
import messagingRoutes from "../src/routes/messagingRoutes.js";
import { ACCOUNT_OFFICER, BRANCH_STAFF } from "../src/utils/constant.js";

// Opening a 1:1 and listing what is mine. No branch room yet -- the schema
// carries Kind = 'BRANCH' and nothing creates one, because membership is an
// unanswered question and MESSAGING.md §3a records why.

const USER_MODEL = "../../src/models/userModel.js";
const MESSAGING_MODEL = "../../src/models/messagingModel.js";
const MESSAGING = "../../src/services/messagingService.js";

const STAFF = {
  UserCode: "USR-STF-00001",
  Role: BRANCH_STAFF,
  BranchCode: 3,
  GroupCode: 1,
  IsActive: 1,
};

const OFFICER = {
  UserCode: "PHL-AO-00001",
  Role: ACCOUNT_OFFICER,
  BranchCode: null,
  GroupCode: 1,
  IsActive: 1,
};

const conversation = (o = {}) => ({
  Id: 12,
  Kind: "DIRECT",
  BranchCode: null,
  DirectKey: "PHL-AO-00001|USR-STF-00001",
  CreatedByUserCode: STAFF.UserCode,
  CreatedAt: new Date("2026-09-09T02:00:00.000Z"),
  ...o,
});

const withConversations = (overrides = {}, userOverrides = {}) =>
  withStubbedModules(
    {
      [USER_MODEL]: {
        getUserScopeByCode: rows(OFFICER),
        isBranchInAccountOfficerScope: scopeHit,
        ...userOverrides,
      },
      [MESSAGING_MODEL]: {
        findDirectConversation: rows(),
        createDirectConversation: () => ({
          run: async () => ({ recordset: [conversation()] }),
        }),
        listForUser: rows(),
        ...overrides,
      },
    },
    MESSAGING,
  );

// ------------------------------------------------------------- the key

test("the direct key is the two codes sorted, so a pair has one spelling", async () => {
  // ⭐ UX_conversations_Direct is a unique index on this string. Unsorted,
  // 'A|B' and 'B|A' are different values and the index permits exactly the
  // duplicate it exists to prevent. The database cannot check this.
  assert.equal(directKeyFor("USR-STF-00001", "PHL-AO-00001"), "PHL-AO-00001|USR-STF-00001");
  assert.equal(directKeyFor("PHL-AO-00001", "USR-STF-00001"), "PHL-AO-00001|USR-STF-00001");

  assert.equal(
    directKeyFor("USR-STF-00001", "PHL-AO-00001"),
    directKeyFor("PHL-AO-00001", "USR-STF-00001"),
  );
});

// ------------------------------------------------------- opening a 1:1

test("opening a conversation checks permission before it writes anything", async () => {
  // The refusal has to come first. A conversation row created and then refused
  // would leave a pair joined in the table with no way to reach it.
  const { service, calls } = await withConversations({}, { isBranchInAccountOfficerScope: scopeMiss });

  const error = await captureThrown(() =>
    service.openDirectConversation(STAFF, OFFICER.UserCode),
  );

  assert.equal(error?.statusCode, 403);
  assert.equal(calls.some((c) => c.name === "createDirectConversation"), false);
  assert.equal(calls.some((c) => c.name === "findDirectConversation"), false);
});

test("opening twice returns the same conversation and writes once", async () => {
  // ⭐ The case a chat gets wrong and nobody notices until two people are in
  // two different threads with each other.
  const { service, calls } = await withConversations({
    findDirectConversation: rows(conversation()),
  });

  const { conversation: found, created } = await service.openDirectConversation(
    STAFF,
    OFFICER.UserCode,
  );

  assert.equal(created, false);
  assert.equal(found.Id, 12);
  assert.equal(calls.some((c) => c.name === "createDirectConversation"), false);
});

test("a first open creates it, and looks it up by the sorted key", async () => {
  const { service, calls } = await withConversations();

  const { created } = await service.openDirectConversation(STAFF, OFFICER.UserCode);

  assert.equal(created, true);

  const looked = calls.find((c) => c.name === "findDirectConversation").args;
  const made = calls.find((c) => c.name === "createDirectConversation").args;

  assert.equal(looked[0], "PHL-AO-00001|USR-STF-00001");
  assert.equal(made[0], "PHL-AO-00001|USR-STF-00001");
  assert.equal(made[1], STAFF.UserCode, "the creator is recorded");
  assert.equal(made[2], OFFICER.UserCode, "the other participant is passed");
});

test("a role with no messaging never reaches the conversation table", async () => {
  const { service, calls } = await withConversations();

  await captureThrown(() =>
    service.openDirectConversation({ ...STAFF, Role: "DEPARTMENT_HEAD" }, OFFICER.UserCode),
  );

  assert.equal(calls.length, 0, "a refused role must not read or write anything");
});

// ------------------------------------------------------------ the list

test("the list strips TotalCount and reports it in pagination", async () => {
  // The same shape as every other list in this API, and the same reason: the
  // total rides on the rows and must not be handed to the client on each one.
  const { service } = await withConversations({
    listForUser: rows(
      { Id: 12, OtherUserCode: "PHL-AO-00001", UnreadCount: 3, TotalCount: 7 },
      { Id: 13, OtherUserCode: "USR-BRH-00001", UnreadCount: 0, TotalCount: 7 },
    ),
  });

  const result = await service.listConversations(STAFF, { PageNumber: 1, PageSize: 20 });

  assert.equal(result.pagination.totalCount, 7);
  assert.equal(result.pagination.totalPages, 1);
  assert.equal("TotalCount" in result.data[0], false);
  assert.equal("TotalCount" in result.data[1], false);
  assert.equal(result.data[0].UnreadCount, 3);
});

test("no conversations is an empty page, not a failure", async () => {
  const { service } = await withConversations();

  const result = await service.listConversations(STAFF, { PageNumber: 1, PageSize: 20 });

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.totalPages, 0);
});

test("the list reads the caller's own code and nobody else's", async () => {
  const { service, calls } = await withConversations();

  await service.listConversations(STAFF, { PageNumber: 2, PageSize: 50 });

  const args = calls.find((c) => c.name === "listForUser").args;

  assert.equal(args[0], STAFF.UserCode);
  assert.deepEqual(args[1], { PageNumber: 2, PageSize: 50 });
});

// ----------------------------------------------------------- the routes

test("both conversation routes carry requireAuth and the role guard", async () => {
  for (const method of ["get", "post"]) {
    const layer = messagingRoutes.stack.find(
      (l) => l.route?.path === "/conversations" && l.route?.methods?.[method],
    );

    assert.ok(layer, `${method.toUpperCase()} /conversations is not mounted`);
    assert.equal(layer.route.stack.length, 3, method);
  }
});
