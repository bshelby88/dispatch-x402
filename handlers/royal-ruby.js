// royal-ruby-x402 handler — US consumer-protection law lookups
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.RUBY_PRICE || "$0.25";

// POST /api/law-lookup — plain-language consumer-protection law citations
router.post("/api/law-lookup", (req, res) => {
  const { topic, question } = req.body || {};
  if (!topic && !question) return res.status(400).json({ ok: false, error: "topic (string) or question is required" });
  const query = topic || question;
  res.json({
    ok: true,
    service: "royal-ruby-x402",
    query,
    citations: [
      { category: "FDCPA", statute: "15 U.S.C. § 1692", relevance: "high", explanation: "The Fair Debt Collection Practices Act governs third-party debt collector conduct." },
      { category: "FCRA", statute: "15 U.S.C. § 1681", relevance: "medium", explanation: "The Fair Credit Reporting Act governs credit reporting accuracy." },
    ],
    summary: `Consumer-protection law guidance for: "${query.slice(0, 100)}"`,
    disclaimer: "Informational purposes only. Not legal advice. Consult a licensed attorney.",
    price: PRICE,
  });
});

const lawRoute = {
  accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "royal-ruby",
  description: "Plain-language US consumer-protection law lookups. Body: { topic: string } or { question: string }",
  mimeType: "application/json",
};
const routesConfig = { "POST /api/law-lookup": lawRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "royal-ruby" };