import test from "node:test";
import assert from "node:assert/strict";
import { captureSql, restoreSqlCapture } from "./helpers/captureSql.js";
import { rows } from "./helpers/stubModel.js";
import { withUserService } from "./helpers/userService.js";
import lookupRoutes from "../src/routes/lookupRoutes.js";

const USER_MODEL = "../../src/models/userModel.js";

// GET /lookups/regions was cancelled on 2026-08-28 as `backend/cluster-region-lookups`,
// on the grounds that it "had one consumer, ASH registration, which does not take a
// region". That stopped being true the same day: PR #123 made regionCode required for
// an Area Sales Head, and PUT /users/:userId/region gave it a second consumer. The two
// decisions crossed and nobody noticed for four days.

test("the query names only the two region columns", async () => {
  // banc.regions is RegionCode, RegionName and nothing else. Naming them rather
  // than SELECT * is what keeps a widened table out of an unauthenticated response.
  const { model, queries } = await captureSql(USER_MODEL);

  await model.getRegions().run();
  restoreSqlCapture();

  assert.match(queries[0], /FROM banc\.regions/i);
  assert.match(queries[0], /SELECT\s+RegionCode,\s*RegionName/i);
  assert.doesNotMatch(queries[0], /SELECT\s+\*/i);
});

test("it is an inline query, not a procedure", async () => {
  // Deliberate, and the same choice getGroups made. Three rows off a two-column
  // reference table does not need an SP, and asking for one would be the
  // near-identical-procedures trap this project has hit three times.
  const { model, queries } = await captureSql(USER_MODEL);

  await model.getRegions().run();
  restoreSqlCapture();

  assert.doesNotMatch(queries[0], /^EXEC /);
});

test("it binds no parameters, because it takes no filter", async () => {
  const { model, inputs } = await captureSql(USER_MODEL);

  await model.getRegions().run();
  restoreSqlCapture();

  assert.deepEqual(inputs, []);
});

test("the service returns the recordset unchanged", async () => {
  const { service } = await withUserService({
    getRegions: rows({ RegionCode: 1, RegionName: "NCR" }),
  });

  const result = await service.getRegions();

  assert.deepEqual(result, [{ RegionCode: 1, RegionName: "NCR" }]);
});

test("an empty regions table answers with an empty list, not a throw", async () => {
  // Only NCR is seeded. A caller reaching this before the seed lands must get a
  // dropdown with no options rather than a 500.
  const { service } = await withUserService({ getRegions: rows() });

  assert.deepEqual(await service.getRegions(), []);
});

const layerFor = (path) =>
  lookupRoutes.stack.find((layer) => layer.route?.path === path);

test("/regions takes no session, like /groups and /branches", async () => {
  // This is the assertion that matters. An Area Sales Head picks their region on
  // the registration screen, and POST /users/register takes no session -- so a
  // requireAuth here would make the role unregisterable, and the failure would
  // surface on a screen rather than in a test.
  const regions = layerFor("/regions");
  const groups = layerFor("/groups");
  const plans = layerFor("/plans");

  assert.ok(regions, "/lookups/regions is not mounted");
  assert.equal(regions.route.stack.length, 1);
  assert.equal(regions.route.stack.length, groups.route.stack.length);

  // /plans is the contrast: it carries requireAuth and so has two handlers.
  assert.equal(plans.route.stack.length, 2);
});

test("the three tiers are mounted in tier order", async () => {
  // Region, then group, then branch -- the order the registration screens ask
  // in. Nothing depends on it; a reader does.
  const paths = lookupRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.deepEqual(paths, ["/regions", "/groups", "/branches", "/plans"]);
});
