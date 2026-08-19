import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { API_VERSION_PREFIX } from "../src/utils/constant.js";
import { consentFormTemplate } from "../src/templates/consentFormTemplate.js";

test("there is one prefix and it carries a version", () => {
  assert.equal(API_VERSION_PREFIX, "/api/v1");
});

test("the consent form submits to the versioned path, not the legacy one", () => {
  // This form is rendered into the client's own browser and posts back on its
  // own. Nothing else can correct it if the path is wrong.
  const html = consentFormTemplate("3f2504e0-4f89-11d3-9a0c-0305e82c3301", "A", "B", "C");

  assert.match(html, /action="\/api\/v1\/consent\/confirm"/);
  assert.doesNotMatch(html, /action="\/api\/consent\/confirm"/);
});

test("no template hardcodes an unversioned /api path", async () => {
  // Anything the backend generates has to point at the canonical prefix, since
  // the legacy mount is due to be deleted once the underwriting system moves.
  const dir = new URL("../src/templates/", import.meta.url);
  // Modules only. The folder also collects untracked scratch files, and those
  // are not shipped to anyone.
  const files = (await readdir(dir)).filter((name) => name.endsWith(".js"));
  const offenders = [];

  for (const file of files) {
    const body = await readFile(new URL(file, dir), "utf8");
    // A literal /api/ not immediately followed by the version segment.
    if (/["'`]\/api\/(?!v\d)/.test(body)) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});
