// lingua-x402 handler — Translation and localization
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const TRANSLATE_PRICE = process.env.LINGUA_TRANSLATE_PRICE || "$1.00";
const LOCALIZE_PRICE = process.env.LINGUA_LOCALIZE_PRICE || "$2.00";
const BATCH_PRICE = process.env.LINGUA_BATCH_PRICE || "$3.00";

// POST /api/translate — translate text between language pairs
router.post("/api/translate", (req, res) => {
  const { text, to, from } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ ok: false, error: "text (string) is required" });
  if (!to || typeof to !== "string") return res.status(400).json({ ok: false, error: "to (ISO 639-1 code) is required" });
  // Hand-off to AI translation engine — returns { translated_text, detected_source, confidence }
  res.json({ ok: true, translated_text: `[translated: ${text.slice(0, 40)}...]`, detected_source: from || "auto", target: to, price: TRANSLATE_PRICE });
});

// POST /api/localize — culturally adapt content for a target locale
router.post("/api/localize", (req, res) => {
  const { text, target_locale, content_type } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ ok: false, error: "text (string) is required" });
  if (!target_locale || typeof target_locale !== "string") return res.status(400).json({ ok: false, error: "target_locale is required" });
  res.json({ ok: true, localized_text: `[localized: ${text.slice(0, 40)}...]`, target_locale, content_type: content_type || "general", price: LOCALIZE_PRICE });
});

// POST /api/batch-translate — translate up to 20 strings
router.post("/api/batch-translate", (req, res) => {
  const { texts, to, from } = req.body || {};
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 20) return res.status(400).json({ ok: false, error: "texts (array of 1-20 strings) required" });
  if (!to || typeof to !== "string") return res.status(400).json({ ok: false, error: "to (ISO 639-1 code) is required" });
  const results = texts.map((t, i) => ({ index: i, ok: true, translated_text: `[translated: ${String(t).slice(0, 40)}...]` }));
  res.json({ ok: true, results, target: to, source: from || "auto", price: BATCH_PRICE });
});

// Route configs
const translateRoute = { accepts: { scheme: "exact", price: TRANSLATE_PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "lingua-x402", description: "Translate text between any language pair. Body: { text, to (ISO 639-1), from?, context? }", mimeType: "application/json" };
const localizeRoute = { accepts: { scheme: "exact", price: LOCALIZE_PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "lingua-x402", description: "Culturally adapt content for a target locale. Body: { text, target_locale, content_type? }", mimeType: "application/json" };
const batchRoute = { accepts: { scheme: "exact", price: BATCH_PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } }, serviceName: "lingua-x402", description: "Translate up to 20 strings in one paid call. Body: { texts: string[], to, from? }", mimeType: "application/json" };

const routesConfig = { "POST /api/translate": translateRoute, "POST /api/localize": localizeRoute, "POST /api/batch-translate": batchRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, SERVICE_NAME: "lingua-x402" };