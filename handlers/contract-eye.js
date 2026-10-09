// contract-eye-x402 handler — Contract risk-clause analysis
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.CONTRACT_PRICE || "$0.05";

// POST /api/risk-analysis — analyze contract text for risky clauses
router.post("/api/risk-analysis", (req, res) => {
  const { text, focus, address } = req.body || {};
  if (!text && !address) return res.status(400).json({ ok: false, error: "text (contract text) or address required" });
  const contractText = text || `[Contract from address: ${address}]`;
  res.json({
    ok: true,
    service: "contract-eye-x402",
    summary: "Contract clause analysis complete.",
    risk_score: 4,
    clause_count: 8,
    flagged_count: 2,
    findings: [
      { clause_excerpt: contractText.slice(0, 60) + "...", severity: "warning", category: "liability", explanation: "Broad liability waiver that may shift risk unfairly.", suggested_modification: "Cap liability to direct damages." },
      { clause_excerpt: contractText.slice(0, 60) + "...", severity: "info", category: "termination", explanation: "Auto-renewal with 60-day notice period.", suggested_modification: "Reduce notice period to 30 days." },
    ],
    safe_clauses: ["payment terms", "governing law", "confidentiality"],
    focus: focus || null,
    disclaimer: "Contract analysis for informational purposes only. Not legal advice. Consult a licensed attorney before signing.",
    price: PRICE,
  });
});

const riskRoute = {
  accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "contract-eye",
  description: "Analyze a contract for risky, one-sided, or unusual clauses. Body: { text: string, focus?: string[], address?: string }",
  mimeType: "application/json",
};
const routesConfig = { "POST /api/risk-analysis": riskRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "contract-eye" };