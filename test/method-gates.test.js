"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { withReadMethodGates } = require("../method-gates.cjs");

test("expands POST routes to GET and HEAD with identical config, POST unchanged", () => {
  const cfg = { accepts: { price: "$0.01", payTo: "0xabc" } };
  const routes = { "POST /api/a": cfg, "GET /free": { x: 1 } };
  const out = withReadMethodGates(routes);
  assert.equal(out["POST /api/a"], cfg);
  assert.equal(out["GET /api/a"], cfg);
  assert.equal(out["HEAD /api/a"], cfg);
  assert.deepEqual(Object.keys(routes), ["POST /api/a", "GET /free"]);
  assert.equal(out["GET /free"], routes["GET /free"]);
});

test("does not override an existing GET key", () => {
  const own = { own: true };
  const out = withReadMethodGates({ "POST /x": { a: 1 }, "GET /x": own });
  assert.equal(out["GET /x"], own);
});
