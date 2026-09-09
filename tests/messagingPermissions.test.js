import test from "node:test";
import assert from "node:assert/strict";
import { withStubbedModules, rows, scopeHit, scopeMiss } from "./helpers/stubModel.js";
import { captureThrown } from "./helpers/userService.js";
import {
  ACCOUNT_OFFICER,
  AREA_SALES_HEAD,
  BRANCH_HEAD,
  BRANCH_STAFF,
  DEPARTMENT_HEAD,
  GROUP_HEAD,
  REGIONAL_SALES_HEAD,
  SECTOR_HEAD,
  SUPERADMIN,
} from "../src/utils/constant.js";
import messagingRoutes from "../src/routes/messagingRoutes.js";

// Who may talk to whom. The rule is one table in messagingService.js and this
// file is the reason it can stay one table -- every pair is asserted here, in
// both directions, and anything absent from the table is refused.
//
// An earlier draft of MESSAGING.md derived the rule from "their scopes
// intersect". That was too loose and it failed on the first case Adrian asked
// about: it let a Branch Staff reach ANY Account Officer in their group, when
// what he asked for is the one officer who holds their branch. The test named
// "any other officer in the group is refused" is that case.

const USER_MODEL = "../../src/models/userModel.js";
const MESSAGING = "../../src/services/messagingService.js";

const who = (Role, overrides = {}) => ({
  UserCode: `${Role}-1`,
  Role,
  IsActive: 1,
  BranchCode: null,
  GroupCode: null,
  ...overrides,
});

const staff = (o) => who(BRANCH_STAFF, { BranchCode: 3, GroupCode: 1, ...o });
const head = (o) => who(BRANCH_HEAD, { BranchCode: 3, GroupCode: 1, ...o });
const groupHead = (o) => who(GROUP_HEAD, { GroupCode: 1, ...o });
const officer = (o) => who(ACCOUNT_OFFICER, { GroupCode: 1, ...o });
const areaHead = (o) => who(AREA_SALES_HEAD, { ...o });
const regionalHead = (o) => who(REGIONAL_SALES_HEAD, { ...o });

const withMessaging = (overrides = {}) =>
  withStubbedModules(
    {
      [USER_MODEL]: {
        isBranchInAccountOfficerScope: scopeHit,
        isAreaInAreaSalesHeadScope: scopeHit,
        shareAGroupAshRsh: scopeHit,
        getUserScopeByCode: rows(officer()),
        ...overrides,
      },
    },
    MESSAGING,
  );

// Every pair is asserted both ways round. The table is keyed on a sorted pair,
// so a one-directional test would pass with the lookup broken.
const both = async (service, a, b) => {
  const forward = await service.canMessage(a, b);
  const backward = await service.canMessage(b, a);

  assert.equal(forward, backward, `${a.Role} -> ${b.Role} is not symmetric`);
  return forward;
};

// ----------------------------------------------------------- the branch

test("staff in the same branch may talk, and staff in another may not", async () => {
  const { service } = await withMessaging();

  assert.equal(await both(service, staff(), staff({ UserCode: "STF-2" })), true);
  assert.equal(
    await both(service, staff(), staff({ UserCode: "STF-2", BranchCode: 5 })),
    false,
  );
});

test("staff and their own Branch Head may talk", async () => {
  const { service } = await withMessaging();

  assert.equal(await both(service, staff(), head()), true);
  assert.equal(await both(service, staff(), head({ BranchCode: 5 })), false);
});

test("a branch with no branch code reaches nobody by branch", async () => {
  // Users.BranchCode is NULL for every Account Officer and for the heads above
  // a branch. Two nulls must not compare equal and read as "same branch".
  const { service } = await withMessaging();

  assert.equal(
    await both(service, staff({ BranchCode: null }), staff({ UserCode: "STF-2", BranchCode: null })),
    false,
  );
});

// --------------------------------------------------- the branch and the AO

test("staff may talk to the Account Officer who holds their branch", async () => {
  const { service, calls } = await withMessaging();

  assert.equal(await both(service, staff(), officer()), true);
  assert.ok(calls.find((c) => c.name === "isBranchInAccountOfficerScope"));
});

test("any other officer in the group is refused", async () => {
  // ⭐ The case the whole rule exists for. Same group, same tenant, and still
  // no -- it is the officer who holds the branch, not an officer nearby.
  const { service } = await withMessaging({
    isBranchInAccountOfficerScope: scopeMiss,
  });

  assert.equal(await both(service, staff(), officer()), false);
});

test("the branch is read from the branch member, never from the officer", async () => {
  // The argument assertion. An Account Officer's Users.BranchCode is NULL, so
  // reading the branch off the wrong side of the pair asks the junction about
  // NULL and answers false for everybody.
  const { service, calls } = await withMessaging();

  await service.canMessage(officer(), staff({ BranchCode: 7 }));

  assert.deepEqual(
    calls.find((c) => c.name === "isBranchInAccountOfficerScope").args,
    [officer().UserCode, 7],
  );
});

test("a Branch Head may talk to the officer holding their branch", async () => {
  const { service } = await withMessaging();

  assert.equal(await both(service, head(), officer()), true);
});

// ------------------------------------------------------------- the tiers

test("a Branch Head and the Group Head of their group may talk", async () => {
  const { service } = await withMessaging();

  assert.equal(await both(service, head(), groupHead()), true);
  assert.equal(await both(service, head(), groupHead({ GroupCode: 2 })), false);
});

test("two Account Officers in one group may talk, in two groups may not", async () => {
  // ⭐ Adrian named this one: an AO in group 1 and an AO in group 2 do not
  // reach each other.
  const { service } = await withMessaging();

  assert.equal(await both(service, officer(), officer({ UserCode: "AO-2" })), true);
  assert.equal(
    await both(service, officer(), officer({ UserCode: "AO-2", GroupCode: 2 })),
    false,
  );
});

test("an officer and the Area Sales Head holding their group may talk", async () => {
  const { service, calls } = await withMessaging();

  assert.equal(await both(service, officer(), areaHead()), true);
  assert.ok(calls.find((c) => c.name === "isAreaInAreaSalesHeadScope"));
});

test("an Area Sales Head outside the officer's group is refused", async () => {
  const { service } = await withMessaging({ isAreaInAreaSalesHeadScope: scopeMiss });

  assert.equal(await both(service, officer(), areaHead()), false);
});

test("an Area Sales Head and a Regional Sales Head sharing a group may talk", async () => {
  const { service, calls } = await withMessaging();

  assert.equal(await both(service, areaHead(), regionalHead()), true);

  // ⚠️ Read through the group junctions, never through Users.RegionCode.
  // isAshInRegionalScope already exists and joins on RegionCode -- CONTEXT.md
  // §4 forbids scoping by it, because it is an approval-routing column and the
  // two disagree the first time a superadmin assigns across regions.
  assert.ok(calls.find((c) => c.name === "shareAGroupAshRsh"));
  assert.equal(calls.some((c) => c.name === "isAshInRegionalScope"), false);
});

// --------------------------------------------------------- who is refused

test("the three roles with no messaging reach nobody, in either direction", async () => {
  // Assert the set. A role quietly gaining an edge throws nothing and cannot be
  // caught by exercising the roles that are correctly present.
  const { service } = await withMessaging();

  const everyone = [staff(), head(), groupHead(), officer(), areaHead(), regionalHead()];

  for (const Role of [SECTOR_HEAD, DEPARTMENT_HEAD, SUPERADMIN]) {
    const excluded = who(Role, { BranchCode: 3, GroupCode: 1 });

    for (const other of everyone) {
      assert.equal(await both(service, excluded, other), false, `${Role} vs ${other.Role}`);
    }
  }
});

test("every pair the table does not name is refused", async () => {
  // The pairs deliberately left out: a jump of more than one tier, and peers
  // who do not share a scope unit. Each is easy to add if it is ever asked for,
  // and none of them is in today.
  const { service } = await withMessaging();

  const refused = [
    [staff(), groupHead()],
    [staff(), areaHead()],
    [staff(), regionalHead()],
    [head(), areaHead()],
    [head(), regionalHead()],
    [groupHead(), officer()],
    [groupHead(), areaHead()],
    [groupHead(), regionalHead()],
    [officer(), regionalHead()],
    [areaHead(), areaHead({ UserCode: "ASH-2" })],
    [regionalHead(), regionalHead({ UserCode: "RSH-2" })],
  ];

  for (const [a, b] of refused) {
    assert.equal(await both(service, a, b), false, `${a.Role} vs ${b.Role}`);
  }
});

test("nobody may message themselves", async () => {
  const { service } = await withMessaging();

  assert.equal(await service.canMessage(staff(), staff()), false);
});

// ------------------------------------------------------- assertCanMessage

test("a role with no messaging is refused before any lookup", async () => {
  const { service, calls } = await withMessaging();

  const error = await captureThrown(() =>
    service.assertCanMessage(who(DEPARTMENT_HEAD), "USR-STF-00001"),
  );

  assert.equal(error?.statusCode, 403);
  assert.match(error.message, /role cannot use messaging/i);
  assert.equal(calls.length, 0, "a refused role must not read anybody's row");
});

test("an unknown account is a 404, not a 403", async () => {
  // ⚠️ Deliberate. "You may not talk to them" would confirm the account exists
  // to anybody who guessed a user code.
  const { service } = await withMessaging({ getUserScopeByCode: rows() });

  const error = await captureThrown(() =>
    service.assertCanMessage(staff(), "USR-STF-99999"),
  );

  assert.equal(error?.statusCode, 404);
});

test("a deactivated account is unreachable and reads as unknown", async () => {
  const { service } = await withMessaging({
    getUserScopeByCode: rows(officer({ IsActive: -1 })),
  });

  const error = await captureThrown(() => service.assertCanMessage(staff(), "PHL-AO-00001"));

  assert.equal(error?.statusCode, 404);
});

test("a permitted target comes back so the caller does not read it twice", async () => {
  const { service } = await withMessaging();

  const target = await service.assertCanMessage(staff(), "ACCOUNT_OFFICER-1");

  assert.equal(target.UserCode, "ACCOUNT_OFFICER-1");
  assert.equal(target.Role, ACCOUNT_OFFICER);
});

test("the route refuses the three excluded roles before the service is reached", async () => {
  // Guarded twice on purpose. The route cannot see who the target is, so the
  // rule has to live in the service -- but a role with no messaging at all
  // should be told so rather than handed an empty answer.
  const layer = messagingRoutes.stack.find((l) => l.route?.path === "/can/:userCode");

  assert.ok(layer, "GET /messages/can/:userCode is not mounted");
  assert.equal(layer.route.stack.length, 3, "expected requireAuth, requireRole, handler");

  for (const Role of [SECTOR_HEAD, DEPARTMENT_HEAD, SUPERADMIN]) {
    const captured = {};
    const res = {
      status(code) {
        captured.status = code;
        return this;
      },
      json() {},
    };

    layer.route.stack[1].handle({ user: { Role } }, res, () => {
      captured.passed = true;
    });

    assert.equal(captured.status, 403, Role);
    assert.equal(captured.passed, undefined, Role);
  }
});
