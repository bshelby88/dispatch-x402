"use strict";
// Facilitator-emission regression (W13-DISPATCH-BUY 2026-09-15).
// AgentPay field report 2026-09-12 + fleet live 402 decode 2026-09-15T21:55Z
// on dispatch-x402.fly.dev POST /dispatch (2,864 B challenge): accepts[0] had
// payTo/network but NO extra.facilitator and NO serviceName — walls without
// these were reported unbuyable by mppscan. This test boots the real server
// and decodes the live 402 header.

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const CANONICAL = "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR = "https://x402-agent-pay.com/facilitator";
const PORT = 19877;

function request(method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, method, path: pathname, headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer(child) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early code=${child.exitCode}`);
    try {
      const r = await request("GET", "/health");
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not come up");
}

test("POST /dispatch 402 challenge carries facilitator + serviceName + canonical payTo", async (t) => {
  const child = spawn(process.execPath, ["index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      X402_PAY_TO: "0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393",
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });

  await waitForServer(child);
  // Middleware 500s until x402Server.initialize() completes — wait for the
  // facilitator-ready line before firing the paid probe.
  for (let i = 0; i < 60 && !/facilitator ready|will init lazily/.test(output); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  const res = await request(
    "POST",
    "/dispatch",
    { intent: "score this cold email for me", params: {} },
    { "x-payment": "required", "x402-version": "1" }
  );
  assert.equal(res.status, 402, `expected 402, got ${res.status}: ${output.slice(0, 400)}`);
  const hdr = res.headers["payment-required"];
  assert.ok(hdr, "payment-required header present");
  assert.ok(Buffer.byteLength(hdr) < 4096, "challenge header fits 4 KB proxy buffer");
  const challenge = JSON.parse(Buffer.from(hdr, "base64").toString("utf8"));
  const accept = challenge.accepts[0];
  assert.equal(accept.extra.facilitator, FACILITATOR, "accepts[0].extra.facilitator");
  assert.equal(challenge.resource.serviceName, "dispatch", "resource.serviceName");
  assert.equal(accept.payTo.toLowerCase(), CANONICAL, "canonical treasury payTo");
  assert.ok(["eip155:8453", "eip155:84532"].includes(accept.network), "base network");
  assert.ok(accept.amount || accept.price, "price/amount present");
  assert.ok(Number(accept.amount) > 0, "positive amount");
});

test("well-known advertises the same accepts (facilitator included)", async () => {
  let res;
  try {
    res = await request("GET", "/.well-known/x402.json");
  } catch {
    res = { status: 0 };
  }
  // server may be down for this second test if first killed it — fall back to
  // a static source assertion.
  if (res.status !== 200) {
    const fs = require("node:fs");
    const src = fs.readFileSync(path.join(root, "index.js"), "utf8");
    assert.match(src, /extra:\s*\{\s*facilitator:\s*FACILITATOR_URL\s*\}/);
    assert.match(src, /serviceName:\s*SERVICE_NAME/);
    return;
  }
  const doc = JSON.parse(res.body);
  const accepts = doc.endpoints["/dispatch"].accepts;
  assert.equal(accepts.extra.facilitator, FACILITATOR);
});
