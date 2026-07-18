const { spawn } = require("node:child_process");
const http = require("node:http");
const assert = require("node:assert");

const BASE = process.env.DISPATCH_BASE || "http://127.0.0.1:9876";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const client = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        let text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.status, headers: res.headers, body: text });
      });
    });
    client.on("error", reject);
    if (payload) client.write(payload);
    client.end();
  });
}

(async () => {
  const health = await req("GET", "/health");
  console.log("health", health.status, health.body.slice(0, 80));

  const classify = await req("POST", "/classify", { intent: "score this cold email" });
  console.log("classify", classify.status, classify.body.slice(0, 180));

  const blind = await req("POST", "/dispatch", { intent: "score this cold email" });
  console.log("dispatch-blurred", blind.status, blind.body.slice(0, 120));

  assert.strictEqual(health.status, 200, "health must be 200");
  assert.strictEqual(classify.status, 200, "classify must be 200");
  assert.strictEqual(blind.status, 402, "unpaid dispatch must be 402");
  console.log("PASS: dispatch sample routing checks");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
