// sentry-forge-x402 handler — Debt-dispute forensics pack
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.SENTRY_PRICE || "$5.00";

// POST /api/dispute-pack — generate debt-dispute forensics pack
router.post("/api/dispute-pack", (req, res) => {
  const { creditor, amount, account_number, reason, user_details } = req.body || {};
  if (!creditor || !amount) return res.status(400).json({ ok: false, error: "creditor and amount are required" });
  res.json({
    ok: true,
    service: "sentry-forge-x402",
    summary: `Dispute pack for ${creditor} — $${amount}`,
    validation_summary: { creditor: creditor, amount: `$${amount}`, account_number: account_number || "not provided" },
    dispute_letter: `[Dispute letter generated for ${creditor} — $${amount}]`,
    credit_bureau_letters: ["Equifax", "Experian", "TransUnion"].map((bureau) => ({
      bureau,
      letter: `[Dispute letter to ${bureau} regarding ${creditor}]`,
    })),
    supporting_docs: ["[Validation notice template]", "[FCRA compliance checklist]"],
    disclaimer: "This dispute pack is generated for informational purposes. It is not legal advice. Consult an attorney for your specific situation.",
    price: PRICE,
  });
});

const disputeRoute = {
  accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "sentry-forge",
  description: "Generate a debt-dispute forensics pack for a creditor. Body: { creditor, amount, account_number?, reason?, user_details? }",
  mimeType: "application/json",
};
const routesConfig = { "POST /api/dispute-pack": disputeRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "sentry-forge" };