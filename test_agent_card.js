// AGENSTRY-W1 cycle-7 replication acceptance (recO9y9mCEnExkp3W, 2026-09-28).
// Boots the real dispatch server as a subprocess (same spawn style as this
// repo's tests/facilitator-emission.spec.cjs) and verifies the free A2A v1.0
// surfaces registered ABOVE the payment gate plus the still-gated paid route.
// Wire-format expectations are the exact shapes validated against a2a-python
// 1.1.5 and the Agenstry validator on rae-fleet-router / royal-gateway-x402 /
// raen-portfolio-x402 / sentry-forge-x402 (c6b protocolBinding + c6c
// SendMessageResponse oneof wrapper). No money paths executed — read-only
// probes only; localhost bind, canonical treasury via env, CDP keys blank so
// boot uses the public testnet facilitator (never settle attempts).
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const CANONICAL_TREASURY = "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function main() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: CANONICAL_TREASURY,
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  const boot = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server start timeout log=${out.slice(0, 300)}`)), 30000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.includes(`Dispatch x402 listening on :${port}`)) { clearTimeout(t); resolve(); }
    });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.once("exit", (c) => { clearTimeout(t); reject(new Error(`server exited early code=${c} log=${out.slice(0, 300)}`)); });
  });
  void boot;
  const base = `http://127.0.0.1:${port}`;
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); assert.ok(cond, name); };

  // 1. Agent card (A2A v1.0 discovery)
  const cardRes = await fetch(`${base}/.well-known/agent-card.json`);
  check("agent-card GET 200", cardRes.status === 200);
  const card = await cardRes.json();
  check("protocolVersion 1.0", card.protocolVersion === "1.0");
  check("v1 AgentInterface protocolBinding (REQUIRED for SDK transport matching)", Array.isArray(card.supportedInterfaces) && card.supportedInterfaces[0].protocolBinding === "JSONRPC" && card.supportedInterfaces[0].protocolVersion === "1.0");
  check("preferredTransport JSONRPC", card.preferredTransport === "JSONRPC");
  check("card url is /a2a", typeof card.url === "string" && card.url.endsWith("/a2a"));
  check("3+ skills with id/name/description/tags/examples", Array.isArray(card.skills) && card.skills.length >= 3 && card.skills.every((s) => s.id && s.name && s.description && Array.isArray(s.tags) && Array.isArray(s.examples)));
  check("card advertises price + treasury", JSON.stringify(card).includes("$0.50") && JSON.stringify(card).toUpperCase().includes(CANONICAL_TREASURY.toUpperCase()));
  check("securitySchemes present empty (no hidden auth)", card.securitySchemes && Object.keys(card.securitySchemes).length === 0 && Array.isArray(card.security) && card.security.length === 0);

  // 2. SendMessage v1 → protojson SendMessageResponse wrapper
  const v1b = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "c7-v1", method: "SendMessage", params: { message: { messageId: "m1", role: "ROLE_USER", parts: [{ text: "I need to score a cold email — which fleet service and endpoint should I call?" }] } } }) }).then((r) => r.json());
  check("v1 result.message wrapper ROLE_AGENT + bare parts", v1b.result && v1b.result.message && v1b.result.message.role === "ROLE_AGENT" && v1b.result.kind === undefined && v1b.result.message.parts[0].kind === undefined);
  check("v1 answer carries price/treasury/gate-free metadata", v1b.result.message.parts[0].text.includes("$0.50") && v1b.result.message.parts[0].text.toUpperCase().includes(CANONICAL_TREASURY.toUpperCase()) && v1b.result.message.metadata.x402.payTo.toUpperCase() === CANONICAL_TREASURY.toUpperCase() && v1b.result.message.metadata.free === true);

  // inbound BOTH-shape tolerance + keyword routing
  const v1free = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "c7-free", method: "SendMessage", params: { message: { messageId: "m2", role: "ROLE_USER", parts: [{ kind: "text", text: "can I preview routing confidence before paying" }] } } }) }).then((r) => r.json());
  check("v1 accepts kinded inbound parts + keyword hint /classify", /\/classify/.test(v1free.result.message.parts[0].text));

  // 3. v0.3 message/send → flat kinded Message (back-compat)
  const v03 = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "c7-v03", method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "what is the price?" }] } } }) }).then((r) => r.json());
  check("v0.3 message/send keeps flat kinded agent message", v03.result.kind === "message" && v03.result.role === "agent" && v03.result.parts[0].kind === "text" && /\$0\.50/.test(v03.result.parts[0].text));

  // 4. GetAgentCard + JSON-RPC error edges
  const gac = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "c7-gac", method: "GetAgentCard" }) }).then((r) => r.json());
  check("GetAgentCard returns the card", gac.result && gac.result.protocolVersion === "1.0" && gac.result.supportedInterfaces[0].protocolBinding === "JSONRPC");
  const bad = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "1.0", id: 1, method: "x" }) }).then((r) => r.json());
  check("non-2.0 request → -32600", bad.error && bad.error.code === -32600);
  const unk = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tasks/coffee" }) }).then((r) => r.json());
  check("unknown method → -32601", unk.error && unk.error.code === -32601);

  // 5. Regression: paid flagship stays gated. Middleware 500s until
  // x402Server.initialize() completes (this repo's own spec notes), so wait
  // for readiness — or for the documented lazy-init fallback — before the
  // unpaid probe. Any 2xx would be an entitlement bypass.
  for (let i = 0; i < 60 && !/facilitator ready|will init lazily/.test(out); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  const facilitatorReady = /facilitator ready/.test(out);
  const paid = await fetch(`${base}/dispatch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "score this cold email for me" }) });
  if (facilitatorReady) {
    check("paid POST /dispatch unpaid → 402 challenge (facilitator ready)", paid.status === 402);
    const hdr = paid.headers.get("x-payment") || paid.headers.get("payment-required");
    check("402 carries PAYMENT header challenge", Boolean(hdr));
  } else {
    check("paid POST /dispatch unpaid still gated while facilitator unavailable (402/503/500, never 2xx)", paid.status === 402 || paid.status === 503 || paid.status === 500);
  }

  // 6. existing free routes untouched
  const about = await fetch(`${base}/about`);
  check("GET /about still 200", about.status === 200);
  const svc = await fetch(`${base}/api/services`);
  check("GET /api/services still 200", svc.status === 200);
  const man = await fetch(`${base}/.well-known/x402.json`);
  check("GET /.well-known/x402.json still 200", man.status === 200);

  child.kill();
  const failed = results.filter(([, ok]) => !ok);
  console.log(results.map(([n, ok]) => `${ok ? "PASS" : "FAIL"} — ${n}`).join("\n"));
  if (failed.length) { console.error(`${failed.length} FAILED`); process.exit(1); }
  console.log(`ALL PASS — dispatch agent-card acceptance (${results.length} checks, facilitatorReady=${facilitatorReady})`);
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
