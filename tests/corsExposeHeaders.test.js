import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import { corsOptions } from "../src/config/cors.js";

const origin = corsOptions.origin[0];

const listen = async (t) => {
  const app = express();
  app.use(cors(corsOptions));
  app.get("/export", (req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="referrals-all-time.xlsx"');
    res.send("file");
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
};

test("a cross-origin caller can read the export's filename", async (t) => {
  const base = await listen(t);

  const res = await fetch(`${base}/export`, { headers: { Origin: origin } });

  assert.equal(res.headers.get("access-control-allow-origin"), origin);
  assert.match(res.headers.get("access-control-expose-headers") ?? "", /Content-Disposition/);
});

test("credentials are still allowed alongside the exposed header", async (t) => {
  const base = await listen(t);

  const res = await fetch(`${base}/export`, { headers: { Origin: origin } });

  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});
