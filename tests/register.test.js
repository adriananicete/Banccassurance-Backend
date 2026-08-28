import test from "node:test";
import assert from "node:assert/strict";
import { rows } from "./helpers/stubModel.js";
import { withUserService, noRows, captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  landBankRoles,
  philLifeRoles,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
} from "../src/utils/constant.js";

const fields = (overrides) => ({
  firstName: "Test",
  middleName: "Dela",
  lastName: "Person",
  suffix: null,
  birthday: "1991-08-20",
  email: "candidate@example.com",
  mobileNumber: "09171234570",
  position: "Account Officer",
  role: ACCOUNT_OFFICER,
  groupCode: 5,
  branchCode: null,
  employeeNo: "TEST-AO-01",
  ...overrides,
});

const registered = rows({
  Success: 1,
  Message: "User registered successfully.",
  UserCode: "PHL-AO-1168",
});

const approverFound = rows({ UserCode: "PHL-ASH-1167" });

const happyPath = (overrides) => ({
  getAreaSalesHeadByArea: approverFound,
  getRegionalSalesHeadByRegion: approverFound,
  checkEmployeeNoExists: noRows,
  // No Group Head holds the group yet. The one-per-group guard runs before the
  // approver lookup for GROUP_HEAD only; oneGroupHeadPerGroup.test.js owns it.
  checkGroupHeadExists: noRows,
  checkOrRegisterUser: registered,
  ...overrides,
});

// Send only the codes a role is allowed, or the wrong rule fires first and the
// assertion proves nothing about the one under test.
const codesFor = (role) => ({
  groupCode: contract[role].group === "forbidden" ? null : 5,
  branchCode: contract[role].branch === "forbidden" ? null : 58,
  regionCode: contract[role].region === "forbidden" ? null : 1,
});

test("an unknown role is refused before anything is looked up", async () => {
  const { service, calls } = await withUserService(happyPath());
  const error = await captureThrown(() =>
    service.register(fields({ role: "SUPERADMIN" })),
  );

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /invalid role/i);
  assert.deepEqual(calls, []);
});

// The contract every self-registering role is held to. Each says what the role
// must send and what it must not - "optional" is a deliberate third answer, not
// a gap: a Branch Staff's group is derivable from their branch and nothing
// reads it, so requiring or forbidding it would both be inventions.
//
// ⚠️ region joined the contract on 2026-08-28, and only the Area Sales Head
// sends one. A PhilLife role names the scope of whoever will approve it, never
// its own: the AO names a group because an ASH holds groups, and the ASH names
// a region because an RSH holds a region. The RSH names nothing, because the
// Department Head holds the whole tenant and there is nothing to narrow.
const contract = {
  [BRANCH_STAFF]: { group: "optional", branch: "required", region: "forbidden" },
  [BRANCH_HEAD]: { group: "required", branch: "required", region: "forbidden" },
  [GROUP_HEAD]: { group: "required", branch: "forbidden", region: "forbidden" },
  [SECTOR_HEAD]: { group: "forbidden", branch: "forbidden", region: "forbidden" },
  [ACCOUNT_OFFICER]: { group: "required", branch: "forbidden", region: "forbidden" },
  [AREA_SALES_HEAD]: { group: "forbidden", branch: "forbidden", region: "required" },
  [REGIONAL_SALES_HEAD]: { group: "forbidden", branch: "forbidden", region: "forbidden" },
  [DEPARTMENT_HEAD]: { group: "forbidden", branch: "forbidden", region: "forbidden" },
};

const withRule = (field, value) =>
  Object.entries(contract)
    .filter(([, rule]) => rule[field] === value)
    .map(([role]) => role);

test("every self-registering role has a field rule, and the rule is complete", () => {
  // GROUP_HEAD had none at all: it matched no branch of the validation, so a
  // registration with no groupCode was accepted and produced a Group Head
  // belonging to no group - an account that can never approve anyone, since its
  // approvals query filters on the column left null. USR-GRH-0030 is that row.
  //
  // BRANCH_HEAD had one that was incomplete: branchCode required, groupCode
  // silently not. That failed loudly but blamed the wrong thing.
  //
  // Neither shape can be caught by exercising the rules that exist. This
  // asserts the set covers every role, and that each rule answers both fields.
  assert.deepEqual(
    Object.keys(contract).sort(),
    [...landBankRoles, ...philLifeRoles].sort(),
  );

  for (const [role, rule] of Object.entries(contract)) {
    for (const field of ["group", "branch", "region"]) {
      assert.ok(
        ["required", "forbidden", "optional"].includes(rule[field]),
        `${role}.${field}`,
      );
    }
  }

  // Exactly one role sends a region, and it is the one whose approver holds one.
  assert.deepEqual(
    Object.entries(contract)
      .filter(([, rule]) => rule.region === "required")
      .map(([role]) => role),
    [AREA_SALES_HEAD],
  );
});

test("the service holds the same contract this file describes", async () => {
  // Two tables that must agree. Asserting the behaviour role by role below
  // proves each rule fires; only this proves the two lists are the same list.
  const { service } = await withUserService(happyPath());

  assert.deepEqual(service.registrationFields, contract);
});

test("a role that needs a group is refused without one", async () => {
  for (const role of withRule("group", "required")) {
    const { service } = await withUserService(happyPath());
    const error = await captureThrown(() =>
      service.register(fields({ ...codesFor(role), role, groupCode: null })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /group is required/i, role);
  }
});

test("a role that needs a region is refused without one", async () => {
  for (const role of withRule("region", "required")) {
    const { service } = await withUserService(happyPath());
    const error = await captureThrown(() =>
      service.register(fields({ ...codesFor(role), role, regionCode: null })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /region is required/i, role);
  }
});

test("a role that must not send a branch is refused one", async () => {
  for (const role of withRule("branch", "forbidden")) {
    const { service } = await withUserService(happyPath());

    const error = await captureThrown(() =>
      service.register(fields({ ...codesFor(role), role, branchCode: 58 })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /branch is not selected/i, role);
  }
});

test("a role that must not send a region is refused one", async () => {
  // Seven of the eight. Only the Area Sales Head names a region, so this is the
  // guard against the field spreading to roles it means nothing for.
  for (const role of withRule("region", "forbidden")) {
    const { service } = await withUserService(happyPath());

    const error = await captureThrown(() =>
      service.register(fields({ ...codesFor(role), role, regionCode: 1 })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /region is not selected/i, role);
  }
});

test("a role that needs a branch is refused without one", async () => {
  for (const role of withRule("branch", "required")) {
    const { service } = await withUserService(happyPath());

    const error = await captureThrown(() =>
      service.register(fields({ ...codesFor(role), role, branchCode: null })),
    );

    assert.equal(error?.statusCode, 400, role);
    assert.match(error.message, /branch is required/i, role);
  }
});

test("a Branch Head must send both, and is told which one is missing", async () => {
  // The whole point of the fix. Without the group the approver lookup found no
  // Group Head and answered "No Group Head is assigned to this group yet" -
  // which is false. There is one for every group; none had been named.
  const noGroup = await withUserService(happyPath());
  const groupError = await captureThrown(() =>
    noGroup.service.register(fields({ role: BRANCH_HEAD, groupCode: null, branchCode: 58 })),
  );

  assert.equal(groupError?.statusCode, 400);
  assert.match(groupError.message, /group is required/i);
  assert.doesNotMatch(groupError.message, /no group head is assigned/i);

  const noBranch = await withUserService(happyPath());
  const branchError = await captureThrown(() =>
    noBranch.service.register(fields({ role: BRANCH_HEAD, groupCode: 5, branchCode: null })),
  );

  assert.equal(branchError?.statusCode, 400);
  assert.match(branchError.message, /branch is required/i);
});

test("no field rule runs before the role itself is checked", async () => {
  // An unknown role must be refused as an unknown role, not as a missing group.
  const { service } = await withUserService(happyPath());
  const error = await captureThrown(() =>
    service.register(fields({ role: "CLUSTER_HEAD", groupCode: null, branchCode: null })),
  );

  assert.match(error.message, /invalid role/i);
});

test("a Regional Sales Head registers with neither a group nor a branch", async () => {
  const model = happyPath({ getDepartmentHead: rows({ UserCode: "PHL-DH-0001" }) });

  for (const extra of [{ groupCode: 5 }, { branchCode: 58 }]) {
    const { service } = await withUserService(model);
    const error = await captureThrown(() =>
      service.register(fields({ role: REGIONAL_SALES_HEAD, groupCode: null, branchCode: null, ...extra })),
    );
    assert.equal(error?.statusCode, 400, JSON.stringify(extra));
  }

  const { service } = await withUserService(model);
  const result = await service.register(
    fields({ role: REGIONAL_SALES_HEAD, groupCode: null, branchCode: null }),
  );
  assert.equal(result.success, true);
});


test("each role is routed to its own approver lookup", async () => {
  // Each PhilLife role is looked up by the scope its approver holds: an AO by
  // group because an ASH holds groups, an ASH by region because an RSH holds a
  // region. The ASH moved from getRegionalSalesHeadByArea on 2026-08-28.
  const routes = [
    [BRANCH_STAFF, { branchCode: 58 }, "getBranchHeadByBranch"],
    [BRANCH_HEAD, { branchCode: 58, groupCode: 5 }, "getGroupHeadByArea"],
    [GROUP_HEAD, { groupCode: 5 }, "getSectorHead"],
    [ACCOUNT_OFFICER, { groupCode: 5 }, "getAreaSalesHeadByArea"],
    [AREA_SALES_HEAD, { regionCode: 1 }, "getRegionalSalesHeadByRegion"],
    [REGIONAL_SALES_HEAD, {}, "getDepartmentHead"],
  ];

  for (const [role, extra, expected] of routes) {
    const model = happyPath({
      getBranchHeadByBranch: approverFound,
      getGroupHeadByArea: approverFound,
      getSectorHead: approverFound,
      getAreaSalesHeadByArea: approverFound,
      getRegionalSalesHeadByRegion: approverFound,
      getDepartmentHead: approverFound,
    });

    const { service, calls } = await withUserService(model);
    await service.register(
      fields({ role, groupCode: null, branchCode: null, regionCode: null, ...extra }),
    );

    const lookups = calls
      .map((call) => call.name)
      .filter((name) => name.startsWith("get") && name !== "getUserScopeById");

    assert.deepEqual(lookups, [expected], role);
  }
});

test("no approver means no user row, and the message names the missing role", async () => {
  const { service, calls } = await withUserService(
    happyPath({ getAreaSalesHeadByArea: noRows }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 400);
  assert.match(error.message, /no area sales head/i);
  assert.equal(
    calls.some((call) => call.name === "checkOrRegisterUser"),
    false,
    "the insert must not run when there is no approver",
  );
});

test("every approver is notified, not only the first", async () => {
  const { service, calls } = await withUserService(
    happyPath({
      getAreaSalesHeadByArea: rows(
        { UserCode: "PHL-ASH-1167" },
        { UserCode: "PHL-ASH-0001" },
      ),
    }),
  );

  await service.register(fields());

  const notified = calls
    .filter((call) => call.name === "safeNotify")
    .map((call) => call.args[0]);

  assert.deepEqual(notified, ["PHL-ASH-1167", "PHL-ASH-0001"]);
});

test("an Area Sales Head claims no scope at registration", async () => {
  // Changed 2026-08-28, and this is the whole pattern in one test. A code sent
  // at registration finds the approver; it never becomes scope. The ASH was the
  // only exception -- it sent a groupCode and assignAreaSalesHeadArea wrote the
  // junction row on the spot, so the head held a group before anybody approved
  // them. Now it sends a region, which is what its approver holds, and the RSH
  // assigns the groups afterwards through PUT /users/:userId/groups.
  const { service, calls } = await withUserService(happyPath());

  await service.register(fields({
    role: AREA_SALES_HEAD, groupCode: null, branchCode: null, regionCode: 1,
  }));

  // Nothing on the user row: Users.GroupCode stays null for this role.
  const insert = calls.find((call) => call.name === "checkOrRegisterUser");
  assert.equal(insert.args[0].groupCode ?? null, null);

  // And nothing in the junction either -- that write is gone from registration.
  assert.equal(calls.some((c) => c.name === "assignAreaSalesHeadArea"), false);

  // The region reached the approver lookup and nowhere else.
  assert.deepEqual(
    calls.find((c) => c.name === "getRegionalSalesHeadByRegion").args,
    [1],
  );
});

test("an Account Officer does store its AreaCode on the user row", async () => {
  const { service, calls } = await withUserService(happyPath());
  await service.register(fields({ role: ACCOUNT_OFFICER, groupCode: 5 }));

  const insert = calls.find((call) => call.name === "checkOrRegisterUser");
  assert.equal(insert.args[0].groupCode, 5);
});

test("a taken employee number is a 409, and nothing is written", async () => {
  // This answered success:false with HTTP 200 until 2026-08-25. The body was
  // right and the status said the registration had worked, so a client reading
  // res.ok showed a confirmation for an account that does not exist.
  const { service, calls } = await withUserService(
    happyPath({ checkEmployeeNoExists: rows({ EmployeeNo: "TEST-AO-01" }) }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.match(error.message, /already registered/i);
  assert.equal(
    calls.some((call) => call.name === "checkOrRegisterUser"),
    false,
  );
});

test("a failing welcome email does not fail the registration", async () => {
  const { service } = await withUserService(happyPath(), {
    email: {
      sendWelcomeEmail: async () => {
        throw new Error("mailbox unavailable");
      },
    },
  });

  const result = await service.register(fields());
  assert.equal(result.success, true);
});

test("a failing notification does not fail the registration", async () => {
  const { service } = await withUserService(happyPath(), {
    notifications: {
      safeNotify: async () => {
        throw new Error("notification insert failed");
      },
    },
  });

  const result = await service.register(fields());
  assert.equal(result.success, true);
});

test("a refusal from the procedure is a 409 carrying its own message", async () => {
  // The procedure's own wording reaches the caller unchanged - it is the only
  // thing that says which of the two duplicates was hit. Only the status is
  // ours, and 409 matches what a duplicate referral and an already-assigned
  // branch already answer.
  const { service } = await withUserService(
    happyPath({
      checkOrRegisterUser: rows({ Success: 0, Message: "Email is already registered." }),
    }),
  );

  const error = await captureThrown(() => service.register(fields()));

  assert.equal(error?.statusCode, 409);
  assert.equal(error.message, "Email is already registered.");
});

test("no refusal path returns a body instead of throwing", async () => {
  // Both duplicates used to return { success: false } and reach the client as
  // HTTP 200, which no other refusal on this endpoint did. Asserting the shape
  // rather than one case is what stops a third one being added the old way.
  const refusals = [
    happyPath({ checkEmployeeNoExists: rows({ EmployeeNo: "TEST-AO-01" }) }),
    happyPath({ checkOrRegisterUser: rows({ Success: 0, Message: "Refused." }) }),
  ];

  for (const model of refusals) {
    const { service } = await withUserService(model);

    const error = await captureThrown(() => service.register(fields()));

    assert.ok(error, "a refusal returned instead of throwing");
    assert.ok(error.statusCode >= 400, String(error.statusCode));
  }
});
