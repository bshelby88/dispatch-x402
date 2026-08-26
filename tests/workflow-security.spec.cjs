"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "deploy.yml");
const dockerfilePath = path.join(root, "Dockerfile");

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

  assert.match(source, /^\s*- run:\s*npm ci\s*$/m, "tests must use npm ci");
  assert.match(source, /^\s*- run:\s*npm test\s*$/m, "tests must run before deploy");
  assert.match(source, /^\s*- run:\s*npm audit --audit-level=moderate\s*$/m, "audit must gate deploy");
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

test("Docker production install is reproducible and copies required files explicitly", () => {
  validateDockerfile(fs.readFileSync(dockerfilePath, "utf8"));
});

module.exports = { validateWorkflow, validateDockerfile };
