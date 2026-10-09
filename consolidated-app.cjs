// x402-core Consolidated Express App (CommonJS)
// Mounts all 11 core x402 wall handlers under one Express server

const express = require("express");
const path = require("path");

// Handler imports
const dispatchHandler = require("./handlers/dispatch.js");
const linguaHandler = require("./handlers/lingua.js");
const sentryForgeHandler = require("./handlers/sentry-forge.js");
const contractEyeHandler = require("./handlers/contract-eye.js");
const tradingagentsHandler = require("./handlers/tradingagents.js");
const royalRubyHandler = require("./handlers/royal-ruby.js");
const royalFeelHandler = require("./handlers/royal-feel.js");
const nftAlphaHandler = require("./handlers/nft-alpha.js");
const nanobananaHandler = require("./handlers/nanobanana.js");
const suprapackHandler = require("./handlers/suprapack.js");
const vaultProHandler = require("./handlers/vault-pro.js");

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";

const CANONICAL_PAY_TO = "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
if (PAY_TO.toLowerCase() !== CANONICAL_PAY_TO.toLowerCase()) {
  console.error(`FATAL: X402_PAY_TO ${PAY_TO} does not match canonical treasury ${CANONICAL_PAY_TO}`);
  process.exit(1);
}
console.log(`x402-core consolidated — payTo: ${PAY_TO}, network: ${NETWORK}`);

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment, PAYMENT-SIGNATURE, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, X-Payment, PAYMENT-SIGNATURE, Cache-Control");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Mount all handler routers
const handlers = [
  dispatchHandler, linguaHandler, sentryForgeHandler, contractEyeHandler,
  tradingagentsHandler, royalRubyHandler, royalFeelHandler,
  nftAlphaHandler, nanobananaHandler, suprapackHandler, vaultProHandler,
];

for (const h of handlers) {
  if (h.router) app.use(h.router);
}

// Build x402 manifest from all route configs
const allEndpoints = {};
const serviceNames = [];
for (const h of handlers) {
  if (h.routesConfig) {
    for (const [route, config] of Object.entries(h.routesConfig)) {
      allEndpoints[route] = config;
    }
  }
  if (h.SERVICE_NAME) serviceNames.push(h.SERVICE_NAME);
}

// x402 discovery endpoints
const serviceInfo = {
  name: "x402-core",
  title: "x402 Core Consolidated — 11 fleet services",
  description: "Consolidated x402 wall exposing 11 core fleet services: " + serviceNames.join(", "),
  contact: "jadedfocus@gmail.com",
  operator: "Royal Agentic Enterprises",
};

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    version: "2.0.0",
    service: serviceInfo,
    endpoints: allEndpoints,
  });
});

app.get("/.well-known/x402", (req, res) => res.redirect("/.well-known/x402.json"));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "x402-core", services: Object.keys(allEndpoints).length }));
app.get("/", (_req, res) => res.json({ service: "x402-core", version: "2.0.0", endpoints: Object.keys(allEndpoints) }));

// Error handling
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`x402-core consolidated gateway running on port ${PORT}`);
  console.log(`Services: ${serviceNames.length} core walls mounted`);
});
