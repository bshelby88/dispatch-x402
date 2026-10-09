// suprapack-x402 handler — Agent skill finder
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.SUPRA_PRICE || "$0.03";

router.post("/api/find-skill", (req, res) => {
  const { goal } = req.body || {};
  if (!goal) return res.status(400).json({ ok: false, error: "goal (string) required" });
  res.json({ ok: true, query: goal,
    matches: [{ skill: "dispatch", name: "Dispatch", relevance: 0.85 }, { skill: "royal-feel", name: "FTC Compliance", relevance: 0.42 }],
    best_match: { skill: "dispatch", relevance: 0.85 }, price: PRICE });
});

router.post("/api/get-skill", (req, res) => {
  const { skill_id } = req.body || {};
  if (!skill_id) return res.status(400).json({ ok: false, error: "skill_id required" });
  res.json({ ok: true, skill: { id: skill_id, name: `Skill: ${skill_id}` }, price: PRICE });
});

router.post("/api/list-top", (req, res) => {
  res.json({ ok: true, top_skills: [
    { id: "dispatch", name: "Dispatch", price: "$0.50" },
    { id: "lingua", name: "Translation", price: "$1.00" },
    { id: "royal-feel", name: "FTC Compliance", price: "$2.00" },
  ]});
});

const findRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "suprapack", description: "Find the right agent skill for a task. Body: { goal: string }", mimeType: "application/json" };
const getRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "suprapack", description: "Get skill details by ID. Body: { skill_id: string }", mimeType: "application/json" };
const listRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "suprapack", description: "List top recommended skills.", mimeType: "application/json" };
const routesConfig = { "POST /api/find-skill": findRoute, "POST /api/get-skill": getRoute, "POST /api/list-top": listRoute };
module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "suprapack" };
