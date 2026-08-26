"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { resolveProductionRecipient } = require("../payment-config.cjs");

test("rejects the live malformed dispatch recipient", () => {
  assert.throws(
    () => resolveProductionRecipient({ X402_PAY_TO: "d9bf805735423140" }),
    /valid EVM address/
  );
});

test("rejects a missing production recipient", () => {
  assert.throws(() => resolveProductionRecipient({}), /valid EVM address/);
});

test("accepts an explicitly configured EVM recipient without guessing", () => {
  const recipient = "0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f";
  assert.equal(resolveProductionRecipient({ X402_PAY_TO: recipient }), recipient);
});

test("server exits before loading payment middleware when recipient is malformed", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env: { ...process.env, X402_PAY_TO: "d9bf805735423140" },
    encoding: "utf8",
    timeout: 5000,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /X402_PAY_TO must be an explicitly configured valid EVM address/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
  assert.doesNotMatch(result.stdout, /facilitator|x402/i);
});

test("server exits before loading payment middleware when recipient is missing", () => {
  const env = { ...process.env };
  delete env.X402_PAY_TO;
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env,
    encoding: "utf8",
    timeout: 5000,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /X402_PAY_TO must be an explicitly configured valid EVM address/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
  assert.doesNotMatch(result.stdout, /facilitator|x402/i);
});
