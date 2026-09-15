"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "deploy.yml");
const dockerfilePath = path.join(root, "Dockerfile");

function dockerCopyFiles(source) {
  const files = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^COPY\s+(.+)$/);
    if (!match) continue;
    const parts = match[1].trim().split(/\s+/);
    for (const file of parts.slice(0, -1)) files.add(file);
  }
  return files;
}

function resolveLocalModule(fromFile, request) {
  const unresolved = path.resolve(path.dirname(fromFile), request);
  for (const candidate of [unresolved, `${unresolved}.js`, `${unresolved}.cjs`, path.join(unresolved, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve local require ${request} from ${path.relative(root, fromFile)}`);
}

function recursiveLocalRequireClosure(entryFile) {
  const pending = [entryFile];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
      pending.push(resolveLocalModule(file, match[1]));
    }
  }
  return new Set([...visited].map((file) => path.relative(root, file).replaceAll(path.sep, "/")));
}

function request(port, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`runtime exited before listening with status ${child.exitCode}`);
    try {
      if (await request(port, "GET", "/health") === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("runtime did not listen within 5 seconds");
}

async function waitForStatus(port, method, requestPath, body, expected) {
  let actual;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    actual = await request(port, method, requestPath, body);
    if (actual === expected) return actual;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return actual;
}

function validateWorkflow(source) {
  assert.doesNotMatch(source, /^\s*workflow_dispatch\s*:/m, "manual deployment must not be enabled");
  assert.match(source, /^\s{2}pull_request:\s*$/m, "pull requests must run verification");
  assert.match(source, /^\s{2}push:\s*$/m, "pushes must trigger the workflow");
  assert.match(source, /push:\s*\n\s+branches:\s*\[main\]/, "push must be restricted to main");
  assert.match(source, /^permissions:\s*\n\s+contents:\s*read\s*$/m, "workflow permissions must be read-only");

  const actionUses = [...source.matchAll(/^\s*- uses:\s*([^\s#]+).*$/gm)].map((match) => match[1]);
  assert.ok(actionUses.length >= 3, "expected checkout, setup-node, and setup-flyctl actions");
  for (const use of actionUses) {
    assert.match(use, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `action must use an immutable SHA: ${use}`);
  }
  assert.deepEqual(actionUses, [
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1",
  ], "workflow actions must match the reviewed commits");
  assert.match(
    source,
    /superfly\/flyctl-actions\/setup-flyctl@[0-9a-f]{40}[^\n]*\n\s+with:\s*\n\s+version:\s*0\.4\.93\s*$/m,
    "Fly CLI must be pinned to version 0.4.93"
  );

  assert.match(source, /^\s*- run:\s*npm ci\s*$/m, "tests must use npm ci");
  assert.match(source, /^\s*- run:\s*npm test\s*$/m, "tests must run before deploy");
  assert.match(source, /^\s*- run:\s*npm audit --audit-level=low\s*$/m, "low-severity audit must gate deploy");
  assert.match(source, /^\s{4}needs:\s*test\s*$/m, "deploy must depend on the test job");
  assert.match(
    source,
    /^\s{4}if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\s*$/m,
    "deploy must require both a push event and the exact main ref"
  );
}

function validateDockerfile(source) {
  assert.match(source, /^RUN npm ci --omit=dev\s*$/m, "image install must be lockfile-backed");
  assert.doesNotMatch(source, /^COPY .*\*.*$/m, "runtime files must not be selected by a wildcard");
  for (const file of ["index.js", "registry.js", "toon_middleware.js", "payment-config.cjs"]) {
    assert.match(source, new RegExp(`^COPY .*\\b${file.replace(".", "\\.")}\\b.*$`, "m"), `${file} must be copied explicitly`);
  }
}

test("deployment workflow is immutable, least-privilege, and test-gated", () => {
  validateWorkflow(fs.readFileSync(workflowPath, "utf8"));
});

test("workflow validation rejects a mutable action ref", () => {
  const source = fs.readFileSync(workflowPath, "utf8").replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4");
  assert.throws(() => validateWorkflow(source), /immutable SHA/);
});

test("workflow validation rejects a deploy gate without the exact main ref", () => {
  const source = fs
    .readFileSync(workflowPath, "utf8")
    .replace("github.event_name == 'push' && github.ref == 'refs/heads/main'", "github.event_name != 'pull_request'");
  assert.throws(() => validateWorkflow(source), /exact main ref/);
});

test("workflow validation rejects an absent or latest Fly CLI version", () => {
  const source = fs.readFileSync(workflowPath, "utf8");
  assert.throws(() => validateWorkflow(source.replace(/\n\s+with:\s*\n\s+version:\s*0\.4\.93/, "")), /pinned/);
  assert.throws(() => validateWorkflow(source.replace("version: 0.4.93", "version: latest")), /pinned/);
});

test("Docker production install is reproducible and copies required files explicitly", () => {
  validateDockerfile(fs.readFileSync(dockerfilePath, "utf8"));
});

test("Docker COPY files contain the recursive local-require closure of index.js", () => {
  const copied = dockerCopyFiles(fs.readFileSync(dockerfilePath, "utf8"));
  const closure = recursiveLocalRequireClosure(path.join(root, "index.js"));
  const missing = [...closure].filter((file) => !copied.has(file)).sort();
  assert.deepEqual(missing, [], `Docker COPY is missing runtime modules: ${missing.join(", ")}`);
});

test("Docker-derived runtime layout starts and serves free and x402 routes", async (t) => {
  const copied = dockerCopyFiles(fs.readFileSync(dockerfilePath, "utf8"));
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-docker-runtime-"));
  for (const file of copied) {
    const source = path.join(root, file);
    const destination = path.join(runtime, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(runtime, "node_modules"), "junction");

  const port = 19876;
  const child = spawn(process.execPath, ["index.js"], {
    cwd: runtime,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: "0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    fs.rmSync(runtime, { recursive: true, force: true });
  });

  try {
    await waitForServer(port, child);
    assert.equal(await request(port, "GET", "/health"), 200);
    assert.equal(await request(port, "POST", "/classify", { intent: "score this cold email" }), 200);
    assert.equal(await waitForStatus(port, "POST", "/dispatch", { intent: "score this cold email" }, 402), 402);
  } catch (error) {
    error.message += `\nRuntime output:\n${output}`;
    throw error;
  }
});

module.exports = { validateWorkflow, validateDockerfile, dockerCopyFiles, recursiveLocalRequireClosure };
