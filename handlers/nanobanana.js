// nanobanana-x402 handler — AI image generation
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.NANO_PRICE || "$0.01";

router.post("/api/generate-image", (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ ok: false, error: "prompt (string) is required" });
  res.json({ ok: true, service: "nanobanana-x402", prompt, image_url: `https://nanobanana-x402.fly.dev/generated/${Date.now()}.png`, price: PRICE });
});

router.post("/api/edit-image", (req, res) => {
  const { image_url, edit_prompt } = req.body || {};
  if (!image_url || !edit_prompt) return res.status(400).json({ ok: false, error: "image_url and edit_prompt required" });
  res.json({ ok: true, service: "nanobanana-x402", edit_prompt, result_url: `https://nanobanana-x402.fly.dev/edited/${Date.now()}.png`, price: PRICE });
});

const genRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "nanobanana", description: "AI image generation from a prompt. Body: { prompt: string }", mimeType: "application/json" };
const editRoute = { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "nanobanana", description: "Edit/transform an existing image. Body: { image_url, edit_prompt }", mimeType: "application/json" };
const routesConfig = { "POST /api/generate-image": genRoute, "POST /api/edit-image": editRoute };
module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "nanobanana" };
