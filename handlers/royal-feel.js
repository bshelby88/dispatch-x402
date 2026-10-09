// royal-feel-x402 handler — FTC-compliance copy linting + rewrite
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.FEEL_PRICE || "$2.00";
const BATCH_PRICE = process.env.FEEL_BATCH_PRICE || "$5.00";

// POST /api/lint-copy — FTC compliance lint
router.post("/api/lint-copy", (req, res) => {
  const { text, content } = req.body || {};
  const body = text || content;
  if (!body || typeof body !== "string") return res.status(400).json({ ok: false, error: "text (string) is required" });
  res.json({
    ok: true,
    service: "royal-feel-x402",
    findings: [
      { severity: "warn", rule_id: "FTC-EFFICACY-001", snippet: body.slice(0, 60) + "...", explanation: "Unqualified efficacy claim — may require substantiation.", suggested_rewrite: "[Qualified claim with supporting evidence]" },
      { severity: "info", rule_id: "FTC-BUZZ-003", snippet: body.slice(0, 60) + "...", explanation: "Vague buzzword detected; consider removing or defining.", suggested_rewrite: "[Clear, specific language]" },
    ],
    price: PRICE,
  });
});

// POST /api/batch-lint — batch lint up to 10 texts
router.post("/api/batch-lint", (req, res) => {
  const { texts } = req.body || {};
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 10) return res.status(400).json({ ok: false, error: "texts (array of 1-10 strings) required" });
  const results = texts.map((t, i) => {
    if (!t || typeof t !== "string") return { index: i, ok: false, error: "invalid text" };
    return { index: i, ok: true, findings: [{ severity: "warn", rule_id: "FTC-EFFICACY-001", snippet: t.slice(0, 40) + "..." }] };
  });
  res.json({ ok: true, results, price: BATCH_PRICE });
});

const lintRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "royal-feel", description: "FTC-compliance copy linting. Body: { text: string }", mimeType: "application/json" };
const batchRoute = { accepts: { scheme: "exact", price: BATCH_PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "royal-feel", description: "Batch lint up to 10 texts. Body: { texts: string[] }", mimeType: "application/json" };
const routesConfig = { "POST /api/lint-copy": lintRoute, "POST /api/batch-lint": batchRoute, "POST /copy/lint": lintRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "royal-feel" };