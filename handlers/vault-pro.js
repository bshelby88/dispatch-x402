// vault-pro-x402 handler — Obsidian/Ollama project templates
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.VAULT_PRICE || "$0.05";

// POST /api/scaffold — scaffold Obsidian-ready project and agent vault templates
router.post("/api/scaffold", (req, res) => {
  const { project_type, project_name, description } = req.body || {};
  if (!project_type) return res.status(400).json({ ok: false, error: "project_type is required" });
  res.json({
    ok: true,
    service: "vault-pro-x402",
    project_type,
    project_name: project_name || `${project_type}-project`,
    description: description || null,
    template_structure: {
      vault: `${project_name}/`,
      folders: ["templates/", "references/", "scripts/", "assets/"],
      files: [`${project_name}/SKILL.md`, `${project_name}/README.md`, `${project_name}/.env.example`],
    },
    price: PRICE,
  });
});

const scaffoldRoute = {
  accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "vault-pro",
  description: "Scaffold Obsidian-ready project and agent vault templates. Body: { project_type: string, project_name?, description? }",
  mimeType: "application/json",
};
const routesConfig = { "POST /api/scaffold": scaffoldRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "vault-pro" };