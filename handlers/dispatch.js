// dispatch-x402 handler — AI classifier router
// Extracted from dispatch-x402/index.js
const { SERVICES, NETWORK_MAINNET } = require("../registry.js");
const { generateText } = require("ai");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { createGoogle } = require("@ai-sdk/google");

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const DISPATCH_PRICE = process.env.DISPATCH_PRICE || "$0.50";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = NETWORK_MAINNET || "eip155:8453";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || "claude-haiku-4-5-20251001";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CONF_AUTO = 0.88;
const CONF_MIN = 0.65;

function keywordClassify(intent) {
  const q = String(intent || "").toLowerCase();
  const toks = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const s of SERVICES) {
    const hay = `${s.intent} ${s.name} ${s.id}`.toLowerCase();
    let score = 0;
    for (const t of toks) if (hay.includes(t)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best) return { service_id: null, confidence: 0, params: {}, method: "keyword" };
  const conf = Math.min(0.84, toks.length ? bestScore / toks.length : 0);
  return { service_id: best.id, confidence: Number(conf.toFixed(2)), params: {}, method: "keyword" };
}

async function llmClassify(intent) {
  const catalog = SERVICES.map((s) => `- ${s.id}: ${s.intent} (expects ${JSON.stringify(s.params_hint)})`).join("\n");
  const sys =
    "You are the routing classifier for an agent-commerce dispatch API. Given a " +
    "user intent, pick the single best fleet service to fulfill it, estimate a " +
    "calibrated confidence (0.0-1.0), and extract the downstream call params from " +
    "the intent. If nothing fits well, return service_id null with low confidence. " +
    "Respond with ONLY a JSON object: " +
    '{"service_id": string|null, "confidence": number, "params": object, "reasoning": string}';
  const user = `SERVICES:\n${catalog}\n\nUSER INTENT:\n${intent}`;
  const classificationSchema = {
    type: "object",
    properties: {
      service_id: { type: ["string", "null"] },
      confidence: { type: "number" },
      params: { type: "object" },
      reasoning: { type: "string" },
    },
    required: ["service_id", "confidence", "params", "reasoning"],
  };
  if (ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });
    for (let i = 0; i < 2; i++) {
      try {
        const { experimental_output } = await generateText({
          model: anthropic(CLASSIFY_MODEL),
          system: sys,
          prompt: user,
          maxTokens: 400,
          experimental_output: { schema: classificationSchema },
        });
        const parsed = experimental_output;
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
        return { service_id: parsed.service_id || null, confidence: Number(conf.toFixed(2)), params: parsed.params && typeof parsed.params === "object" ? parsed.params : {}, reasoning: String(parsed.reasoning || ""), method: "llm-anthropic" };
      } catch (e) { console.warn(`Anthropic attempt failed: ${e.message}`); await new Promise((res) => setTimeout(res, 1000 * (i + 1))); }
    }
  }
  if (GEMINI_API_KEY) {
    const google = createGoogle({ apiKey: GEMINI_API_KEY });
    for (let i = 0; i < 2; i++) {
      try {
        const { experimental_output } = await generateText({
          model: google(GEMINI_MODEL),
          system: sys,
          prompt: user,
          maxTokens: 400,
          experimental_output: { schema: classificationSchema },
        });
        const parsed = experimental_output;
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
        return { service_id: parsed.service_id || null, confidence: Number(conf.toFixed(2)), params: parsed.params && typeof parsed.params === "object" ? parsed.params : {}, reasoning: String(parsed.reasoning || ""), method: "llm-gemini" };
      } catch (e) { console.warn(`Gemini attempt failed: ${e.message}`); await new Promise((res) => setTimeout(res, 1000 * (i + 1))); }
    }
  }
  return null;
}

async function classify(intent) {
  const llm = await llmClassify(intent);
  const result = llm || keywordClassify(intent);
  const svc = SERVICES.find((s) => s.id === result.service_id) || null;
  let tier = "ambiguous";
  if (svc && result.confidence >= CONF_AUTO) tier = "auto";
  else if (svc && result.confidence >= CONF_MIN) tier = "confirm";
  return { service: svc, confidence: result.confidence, tier, params: result.params, method: result.method, reasoning: result.reasoning || null };
}

function publicService(s) {
  return { id: s.id, name: s.name, base: s.base, endpoint: s.endpoint, method: s.method, price: s.price, network: s.network };
}

// Route config for x402 payment middleware
const dispatchRoute = {
  accepts: { scheme: "exact", price: DISPATCH_PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "dispatch",
  description: "Route a natural-language agent intent to the correct paid fleet service. Returns the chosen service, a calibrated confidence score, params extracted from the intent, and ready-to-use call instructions (URL, method, price, x402 terms).",
  mimeType: "application/json",
};
const routesConfig = { "POST /dispatch": dispatchRoute };

module.exports = { routesConfig, classify, keywordClassify, llmClassify, publicService, SERVICES, PAY_TO, DISPATCH_PRICE, FACILITATOR_URL, NETWORK, SERVICE_NAME: "dispatch" };