"use strict";
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { create } = require("./trust-pages");

const REPO_TRUST = path.join(__dirname, "trust");
function tmpTrust(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "trust-"));
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(d, k), v);
  return d;
}
const CLEAN = {
  "terms.md": "# T\nSeller {{SELLER_LEGAL_NAME}} {{SUPPORT_EMAIL}}\n", "privacy.md": "# P\n{{SUPPORT_EMAIL}}\n",
  "refunds.md": "# R\n{{SUPPORT_EMAIL}}\n", "contact.md": "# C\n{{SELLER_LEGAL_NAME}} {{SUPPORT_EMAIL}}\n",
  "llms-trust.txt": "## Trust\n- Contact: {{SUPPORT_EMAIL}}\n- Seller: {{SELLER_LEGAL_NAME}}\n",
};
const ENV = { SELLER_LEGAL_NAME: "Acme $& LLC", SUPPORT_EMAIL: "support@example.com" };

// tiny app: trust handler first, then a fake "paid" fallthrough
function serve(handler) {
  const server = http.createServer((req, res) => {
    res.send = (b) => { res.setHeader("Content-Type", "text/plain"); res.end(b); };
    handler(req, res, () => {
      if (req.url.startsWith("/llms.txt")) return res.send("# svc\n");
      if (req.url.startsWith("/paid")) { res.statusCode = 402; return res.end("pay"); }
      res.statusCode = 404; res.end("fallthrough-404");
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}
function get(server, p, method = "GET") {
  return new Promise((resolve, reject) => {
    http.request({ port: server.address().port, host: "127.0.0.1", path: p, method }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    }).on("error", reject).end();
  });
}

test("404 on every page when env vars unset", async () => {
  const s = await serve(create({ dir: tmpTrust(CLEAN), env: {} }));
  for (const p of ["/terms", "/privacy", "/refunds", "/contact"]) assert.strictEqual((await get(s, p)).status, 404);
  s.close();
});

test("404 when only one env var is set, or values invalid", async () => {
  for (const env of [{ SELLER_LEGAL_NAME: "X" }, { SUPPORT_EMAIL: "a@b.co" }, { SELLER_LEGAL_NAME: "X", SUPPORT_EMAIL: "nope" }, { SELLER_LEGAL_NAME: "X\nY", SUPPORT_EMAIL: "a@b.co" }]) {
    const s = await serve(create({ dir: tmpTrust(CLEAN), env }));
    assert.strictEqual((await get(s, "/terms")).status, 404);
    s.close();
  }
});

test("serves rendered text when env set and files clean", async () => {
  const s = await serve(create({ dir: tmpTrust(CLEAN), env: ENV }));
  const r = await get(s, "/terms");
  assert.strictEqual(r.status, 200);
  assert.match(r.headers["content-type"], /text\/plain/);
  assert.ok(r.body.includes("Acme $& LLC") && r.body.includes("support@example.com"));
  assert.strictEqual((await get(s, "/contact/")).status, 200);
  assert.strictEqual((await get(s, "/refunds?x=1")).status, 200);
  assert.strictEqual((await get(s, "/privacy", "HEAD")).status, 200);
  assert.strictEqual((await get(s, "/paid")).status, 402); // other routes untouched
  s.close();
});

test("refuses any file still containing [BRYANT", async () => {
  const files = { ...CLEAN, "terms.md": "# T\n[BRYANT: fill]\n" };
  const s = await serve(create({ dir: tmpTrust(files), env: ENV }));
  assert.strictEqual((await get(s, "/terms")).status, 404);
  assert.strictEqual((await get(s, "/privacy")).status, 200);
  s.close();
});

test("passThrough leaves existing routes reachable when not ready", async () => {
  const s = await serve(create({ dir: tmpTrust(CLEAN), env: {}, passThrough: true }));
  assert.strictEqual((await get(s, "/terms")).body, "fallthrough-404");
  s.close();
});

test("llms.txt gets trust section only when ready", async () => {
  let s = await serve(create({ dir: tmpTrust(CLEAN), env: {} }));
  assert.strictEqual((await get(s, "/llms.txt")).body, "# svc\n");
  s.close();
  s = await serve(create({ dir: tmpTrust(CLEAN), env: ENV }));
  const b = (await get(s, "/llms.txt")).body;
  assert.ok(b.startsWith("# svc\n") && b.includes("## Trust") && b.includes("support@example.com"));
  s.close();
  s = await serve(create({ dir: tmpTrust({ ...CLEAN, "llms-trust.txt": "[BRYANT x]" }), env: ENV }));
  assert.strictEqual((await get(s, "/llms.txt")).body, "# svc\n");
  s.close();
});

test("shipped trust/ text is unapproved: nothing served even with env set", async () => {
  // Guard: merging must never publish placeholder legal text.
  const s = await serve(create({ dir: REPO_TRUST, env: ENV }));
  for (const p of ["/terms", "/privacy", "/refunds"]) assert.strictEqual((await get(s, p)).status, 404, p);
  s.close();
  for (const f of ["terms.md", "privacy.md", "refunds.md", "contact.md", "llms-trust.txt"]) assert.ok(fs.existsSync(path.join(REPO_TRUST, f)), f);
});

test("works mounted in a real express app when express is installed", async (t) => {
  let express; try { express = require("express"); } catch (_) { return t.skip("express not installed"); }
  const app = express();
  app.use(create({ dir: tmpTrust(CLEAN), env: ENV }));
  app.get("/llms.txt", (_q, r) => r.type("text/plain").send("# svc\n"));
  const s = await new Promise((r) => { const x = app.listen(0, "127.0.0.1", () => r(x)); });
  assert.strictEqual((await get(s, "/terms")).status, 200);
  assert.ok((await get(s, "/llms.txt")).body.includes("## Trust"));
  s.close();
});
