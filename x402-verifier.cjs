const http = require("http");
const https = require("https");
const crypto = require("crypto");

const SIGNING_SECRET = process.env.RECEIPT_SECRET || "rae-verification-secret-2026";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on("error", reject);
  });
}

function generateSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

async function verifyEndpoint(targetUrl) {
  console.log(`[Verifier] Auditing endpoint: ${targetUrl}...`);
  try {
    const manifestUrl = targetUrl.endsWith("/.well-known/x402") ? targetUrl : `${targetUrl.replace(/\/$/, "")}/.well-known/x402`;
    const res = await fetchUrl(manifestUrl);
    
    if (res.status !== 200) {
      return { ok: false, error: `Manifest route returned HTTP ${res.status}` };
    }

    const manifest = res.body;
    const errors = [];

    // Schema Validation
    if (!manifest.version) errors.push("Missing manifest version");
    if (!manifest.service) errors.push("Missing service descriptor");
    if (!manifest.endpoints || Object.keys(manifest.endpoints).length === 0) errors.push("No endpoints listed");
    
    // Address Check
    const payTo = manifest.service && manifest.service.payTo;
    if (payTo && !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      errors.push("Invalid EVM payTo treasury address format");
    }

    const auditPayload = {
      timestamp: Date.now(),
      target: targetUrl,
      status: errors.length === 0 ? "PASSED" : "FAILED",
      errors
    };

    const receipt = {
      payload: auditPayload,
      signature: generateSignature(auditPayload, SIGNING_SECRET)
    };

    return { ok: errors.length === 0, receipt };
  } catch (err) {
    return { ok: false, error: `Verification failed: ${err.message}` };
  }
}

if (require.main === module) {
  const target = process.argv[2] || "https://tradingagents-x402.fly.dev";
  verifyEndpoint(target).then(console.log);
}

module.exports = { verifyEndpoint };
