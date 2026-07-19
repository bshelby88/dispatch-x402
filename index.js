const express = require("express");
const { toonMiddleware } = require("./toon_middleware");
const { paymentMiddleware } = require("@x402/express");
const { x402ResourceServer, HTTPFacilitatorClient } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");
const { SERVICES, NETWORK_MAINNET } = require("./registry");

const PAY_TO = process.env.X402_PAY_TO;
if (!PAY_TO) {
  console.error("FATAL: X402_PAY_TO required");
  process.exit(1);
}

const DISPATCH_PRICE = process.env.DISPATCH_PRICE || "$0.50";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || "claude-haiku-4-5-20251001";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Council confidence gate (Forge report, x402 Aggregator, 2026-06-29):
//  >= AUTO  → high-confidence route, safe to auto-execute downstream
//  >= MIN   → route returned but flagged for confirmation
//  <  MIN   → ambiguous; free /classify returns candidates, no charge
const CONF_AUTO = 0.88;
const CONF_MIN = 0.65;

// --- classification ----------------------------------------------------------
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
  // crude confidence: matched tokens / total tokens, capped below the LLM ceiling
  const conf = Math.min(0.84, toks.length ? bestScore / toks.length : 0);
  return { service_id: best.id, confidence: Number(conf.toFixed(2)), params: {}, method: "keyword" };
}

async function llmClassify(intent) {
  const catalog = SERVICES.map(
    (s) => `- ${s.id}: ${s.intent} (expects ${JSON.stringify(s.params_hint)})`
  ).join("\n");
  const sys =
    "You are the routing classifier for an agent-commerce dispatch API. Given a " +
    "user intent, pick the single best fleet service to fulfill it, estimate a " +
    "calibrated confidence (0.0-1.0), and extract the downstream call params from " +
    "the intent. If nothing fits well, return service_id null with low confidence. " +
    "Respond with ONLY a JSON object: " +
    '{"service_id": string|null, "confidence": number, "params": object, "reasoning": string}';
  const user = `SERVICES:\n${catalog}\n\nUSER INTENT:\n${intent}`;

  // 1. Try Anthropic if key is set
  if (ANTHROPIC_API_KEY) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: CLASSIFY_MODEL,
            max_tokens: 400,
            system: sys,
            messages: [{ role: "user", content: user }],
          }),
        });
        if (!r.ok) {
          console.warn(`Anthropic error (HTTP ${r.status}); trying next attempt/fallback`);
          await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
          continue;
        }
        const data = await r.json();
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) continue;
        const parsed = JSON.parse(m[0]);
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
        return {
          service_id: parsed.service_id || null,
          confidence: Number(conf.toFixed(2)),
          params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
          reasoning: String(parsed.reasoning || ""),
          method: "llm-anthropic",
        };
      } catch (e) {
        console.warn(`Anthropic attempt failed: ${e.message}`);
        await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
      }
    }
  }

  // 2. Try Gemini fallback if key is set
  if (GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const promptText = `${sys}\n\n${user}`;
    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          console.warn(`Gemini error (HTTP ${r.status}); trying next attempt`);
          await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
          continue;
        }
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;
        const parsed = JSON.parse(text);
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
        return {
          service_id: parsed.service_id || null,
          confidence: Number(conf.toFixed(2)),
          params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
          reasoning: String(parsed.reasoning || ""),
          method: "llm-gemini",
        };
      } catch (e) {
        console.warn(`Gemini attempt failed: ${e.message}`);
        await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
      }
    }
  }

  return null;
}

async function classify(intent) {
  const llm = await llmClassify(intent);
  const result = llm || keywordClassify(intent);
  const svc = SERVICES.find((s) => s.id === result.service_id) || null;
  const tier =
    result.confidence >= CONF_AUTO ? "auto" : result.confidence >= CONF_MIN ? "confirm" : "ambiguous";
  return { ...result, service: svc, tier };
}

function callInstructions(svc, params) {
  if (!svc) return null;
  return {
    method: svc.method,
    url: `${svc.base}${svc.endpoint}`,
    price: svc.price,
    network: svc.network,
    payment: "x402 — call the URL; respond to the 402 with an X-Payment header (USDC on Base).",
    suggested_body: params || {},
    terms_doc: `${svc.base}/.well-known/x402.json`,
  };
}

function publicService(svc) {
  if (!svc) return null;
  return { id: svc.id, name: svc.name, base: svc.base, endpoint: svc.endpoint, price: svc.price };
}

// --- x402 + Express ----------------------------------------------------------
if (process.env.CDP_API_KEY_SECRET_B64) {
  process.env.CDP_API_KEY_SECRET = Buffer.from(
    process.env.CDP_API_KEY_SECRET_B64,
    "base64"
  ).toString("utf-8");
}

const HAS_CDP = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
const NETWORK = HAS_CDP ? "eip155:8453" : "eip155:84532";

let facilitatorClient;
if (HAS_CDP) {
  const { facilitator } = require("@coinbase/x402");
  facilitatorClient = new HTTPFacilitatorClient(facilitator);
  console.log("→ Coinbase CDP facilitator (mainnet)");
} else {
  facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
  console.log("→ public x402.org facilitator (Sepolia testnet)");
}

const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register(NETWORK, new ExactEvmScheme());

// Boot-resilient facilitator init (fleet fix 2026-06-13): never let a transient
// facilitator blip reject unhandled and crash boot into a Fly restart loop.
(async () => {
  for (let i = 1; i <= 12; i++) {
    try {
      await x402Server.initialize();
      console.log(`→ x402 facilitator ready (attempt ${i})`);
      return;
    } catch (e) {
      console.warn(`x402 facilitator init attempt ${i}/12 failed: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, Math.min(2000 * i, 15000)));
    }
  }
  console.warn("x402 facilitator not ready after retries; will init lazily on first paid request");
})();

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));
app.use(toonMiddleware);

// CORS + 402 cache hardening (fleet PR #381)
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Payment, PAYMENT-SIGNATURE, Authorization, X-Credit-Token"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "PAYMENT-REQUIRED, X-Payment, PAYMENT-SIGNATURE, Cache-Control"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  const orig = res.writeHead;
  res.writeHead = function (statusCode, ...args) {
    const actual = statusCode || res.statusCode;
    if (actual === 402) res.setHeader("Cache-Control", "private, no-store");
    return orig.call(this, statusCode, ...args);
  };
  next();
});

// --- OpenAPI discovery -------------------------------------------------------
app.get("/openapi.json", (_req, res) => {
  const paths = {
    "/classify": {
      post: {
        operationId: "classifyIntent",
        summary: "Classify (free) — preview route + confidence for an agent intent",
        tags: ["Routing"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  intent: { type: "string", minLength: 2, description: "Natural-language task to route" },
                },
                required: ["intent"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Classification result (free — no charge regardless of tier)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    intent: { type: "string" },
                    tier: { type: "string", enum: ["auto", "confirm", "ambiguous"] },
                    confidence: { type: "number" },
                    route: { type: "object", nullable: true },
                    note: { type: "string" },
                  },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
    "/dispatch": {
      post: {
        operationId: "dispatch",
        summary: "Dispatch ($0.50) — authoritative paid routing to the right fleet service",
        tags: ["Routing"],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: "0.500000" },
          protocols: [{ x402: {} }],
        },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  intent: { type: "string", minLength: 2, description: "Natural-language task to route to the fleet" },
                  params: { type: "object", description: "Optional downstream params to merge into call instructions" },
                },
                required: ["intent"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Authoritative routing decision with call instructions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    intent: { type: "string" },
                    tier: { type: "string", enum: ["auto", "confirm", "ambiguous"] },
                    confidence: { type: "number" },
                    route: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        base: { type: "string" },
                        endpoint: { type: "string" },
                        price: { type: "string" },
                      },
                    },
                    call: {
                      type: "object",
                      properties: {
                        method: { type: "string" },
                        url: { type: "string" },
                        price: { type: "string" },
                        network: { type: "string" },
                        payment: { type: "string" },
                        suggested_body: { type: "object" },
                        terms_doc: { type: "string" },
                      },
                    },
                    params: { type: "object" },
                    note: { type: "string" },
                  },
                  required: ["ok"],
                },
              },
            },
          },
          "402": { description: "Payment Required — x402 challenge with USDC on Base" },
        },
      },
    },
    "/api/services": {
      get: {
        operationId: "listServices",
        summary: "List all fleet services registered in the dispatch router",
        tags: ["Catalog"],
        security: [],
        responses: {
          "200": {
            description: "Array of available fleet services with base URLs and prices",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    services: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          base: { type: "string" },
                          endpoint: { type: "string" },
                          price: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  res.json({
    openapi: "3.1.0",
    info: {
      title: "Dispatch — x402 Aggregator Meta-API",
      version: "1.0.0",
      description:
        "Paid routing layer for the Royal Agentic Enterprises fleet. " +
        "One paid endpoint that routes an agent's natural-language intent to the right paid fleet service. " +
        "Free /classify previews the route + confidence; paid /dispatch ($0.50) returns the authoritative route, " +
        "extracted params, and ready-to-use call instructions. Routing itself is the priced primitive. " +
        `Currently routes to ${SERVICES.length} paid services.`,
      "x-guidance":
        "1. Call GET /api/services for the current fleet catalog. " +
        "2. Call POST /classify (free) with your intent to preview routing confidence. " +
        "3. Call POST /dispatch (x402, $0.50 USDC on Base) with your intent to get authoritative routing + call instructions. " +
        "4. Use the returned call.url + call.method to invoke the downstream service — it also uses x402.",
      contact: {
        email: "jadedfocus@gmail.com",
        name: "Royal Agentic Enterprises",
      },
    },
    servers: [{ url: "https://dispatch-x402.fly.dev" }],
    paths,
  });
});

// --- free endpoints ----------------------------------------------------------
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "dispatch-x402", services: SERVICES.length })
);

app.get("/about", (_req, res) =>
  res.json({
    service: "Dispatch — x402 Aggregator Meta-API",
    operator: "Royal Agentic Enterprises",
    description:
      "One paid endpoint that routes an agent's natural-language intent to the right paid fleet service. " +
      "Free /classify previews the route + confidence; paid /dispatch ($0.50) returns the authoritative " +
      "route, extracted params, and call instructions. Routing itself is the priced primitive.",
    pricing: { "/classify": "free", "/dispatch": DISPATCH_PRICE },
    confidence_gate: { auto: CONF_AUTO, confirm: CONF_MIN },
    services: SERVICES.map(publicService),
    contact: "jadedfocus@gmail.com",
  })
);

app.get("/api/services", (_req, res) =>
  res.json({ count: SERVICES.length, services: SERVICES.map(publicService) })
);

// FREE preview / disambiguation — no charge for low-confidence (council gate).
app.post("/classify", async (req, res) => {
  const intent = req.body && req.body.intent;
  if (!intent || typeof intent !== "string" || intent.length < 2) {
    return res.status(400).json({ ok: false, error: "intent (string >= 2 chars) required" });
  }
  const c = await classify(intent);
  res.json({
    ok: true,
    intent,
    tier: c.tier,
    confidence: c.confidence,
    method: c.method,
    would_auto_execute: c.tier === "auto",
    route: c.service ? publicService(c.service) : null,
    suggested_params: c.params,
    reasoning: c.reasoning || undefined,
    note:
      c.tier === "ambiguous"
        ? "Low confidence — refine your intent or pick a service from /api/services. No charge."
        : "Call POST /dispatch with the same intent to get authoritative routing + call instructions.",
  });
});

// --- x402-gated route config -------------------------------------------------
const dispatchRoute = {
  accepts: { scheme: "exact", price: DISPATCH_PRICE, network: NETWORK, payTo: PAY_TO },
  description:
    "Route a natural-language agent intent to the correct paid fleet service. Returns the chosen " +
    "service, a calibrated confidence score, params extracted from the intent, and ready-to-use call " +
    "instructions (URL, method, price, x402 terms). Use the free /classify first to preview confidence.",
  mimeType: "application/json",
  extensions: {
    ...declareDiscoveryExtension({
      method: "POST",
      bodyType: "json",
      input: { intent: "score this cold email for me", params: {} },
      inputSchema: {
        type: "object",
        properties: {
          intent: { type: "string", description: "Natural-language task to route" },
          params: { type: "object", description: "Optional downstream params to merge" },
        },
        required: ["intent"],
      },
      output: {
        example: {
          ok: true,
          intent: "score this cold email for me",
          tier: "auto",
          confidence: 0.93,
          route: { id: "power-pack", name: "Power Pack — outreach email scorer" },
          call: {
            method: "POST",
            url: "https://power-pack-x402.fly.dev/api/score-email",
            price: "$0.01",
            network: "eip155:8453",
          },
        },
        schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            intent: { type: "string" },
            tier: { type: "string", enum: ["auto", "confirm", "ambiguous"] },
            confidence: { type: "number" },
            route: { type: "object" },
            params: { type: "object" },
            call: { type: "object" },
            error: { type: "string" },
          },
          required: ["ok"],
        },
      },
    }),
  },
};

const routesConfig = { "POST /dispatch": dispatchRoute };

// discovery endpoints
const serviceInfo = {
  name: "dispatch",
  title: "Dispatch — x402 Aggregator Meta-API",
  description:
    "Paid routing layer for the agent-commerce fleet. One intent in, the right paid service out.",
  contact: "jadedfocus@gmail.com",
  operator: "Royal Agentic Enterprises",
};
app.get("/.well-known/x402.json", (_req, res) =>
  res.json({
    version: "2.0.0",
    service: serviceInfo,
    endpoints: {
      "/dispatch": {
        method: "POST",
        accepts: dispatchRoute.accepts,
        description: dispatchRoute.description,
        mimeType: "application/json",
      },
    },
  })
);
app.get("/.well-known/x402", (req, res) => res.redirect("/.well-known/x402.json"));

app.use(paymentMiddleware(routesConfig, x402Server, undefined, undefined, false));

// Ledger — append-only stdout line per paid dispatch (captured by fly logs).
app.use((req, res, next) => {
  if (req.method !== "POST" || req.path !== "/dispatch") return next();
  const t0 = Date.now();
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      try {
        console.log(
          `[LEDGER] ${JSON.stringify({
            ts: new Date().toISOString(),
            app: "dispatch-x402",
            endpoint: "/dispatch",
            price_usdc: DISPATCH_PRICE,
            network: NETWORK,
            pay_to: PAY_TO,
            routed_to: body && body.route ? body.route.id : null,
            tier: body && body.tier,
            confidence: body && body.confidence,
            latency_ms: Date.now() - t0,
          })}`
        );
      } catch (_) {}
    }
    return origJson(body);
  };
  next();
});

// PAID — authoritative routing decision.
app.post("/dispatch", async (req, res) => {
  const intent = req.body && req.body.intent;
  if (!intent || typeof intent !== "string" || intent.length < 2) {
    return res.status(400).json({ ok: false, error: "intent (string >= 2 chars) required" });
  }
  const c = await classify(intent);
  const merged = { ...(c.params || {}), ...((req.body && req.body.params) || {}) };
  res.json({
    ok: true,
    intent,
    tier: c.tier,
    confidence: c.confidence,
    method: c.method,
    route: publicService(c.service),
    params: merged,
    call: callInstructions(c.service, merged),
    reasoning: c.reasoning || undefined,
    note:
      c.tier === "ambiguous"
        ? "Low confidence — verify the route before calling downstream, or refine intent via free /classify."
        : c.tier === "confirm"
        ? "Moderate confidence — confirm the route fits before charging the downstream call."
        : "High confidence — safe to call the downstream service directly.",
  });
});

const crypto = require("crypto");

app.get("/api/verify", async (req, res) => {
  const targetUrl = req.query.target;
  if (!targetUrl || typeof targetUrl !== "string") {
    return res.status(400).json({ ok: false, error: "target query param required" });
  }
  try {
    const manifestUrl = targetUrl.endsWith("/.well-known/x402") ? targetUrl : `${targetUrl.replace(/\/$/, "")}/.well-known/x402`;
    const response = await fetch(manifestUrl);
    if (response.status !== 200) {
      return res.json({ ok: false, error: `Manifest route returned HTTP ${response.status}` });
    }
    const manifest = await response.json().catch(() => null);
    if (!manifest) {
      return res.json({ ok: false, error: "Invalid JSON in manifest" });
    }
    const errors = [];
    if (!manifest.version) errors.push("Missing manifest version");
    if (!manifest.service) errors.push("Missing service descriptor");
    if (!manifest.endpoints || Object.keys(manifest.endpoints).length === 0) errors.push("No endpoints listed");
    
    const payTo = manifest.service && (manifest.service.payTo || manifest.service.pay_to);
    if (payTo && !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      errors.push("Invalid EVM payTo treasury address format");
    }

    const SIGNING_SECRET = process.env.RECEIPT_SECRET || "rae-verification-secret-2026";
    const auditPayload = {
      timestamp: Date.now(),
      target: targetUrl,
      status: errors.length === 0 ? "PASSED" : "FAILED",
      errors
    };

    const signature = crypto.createHmac("sha256", SIGNING_SECRET).update(JSON.stringify(auditPayload)).digest("hex");
    
    res.json({
      ok: errors.length === 0,
      receipt: { payload: auditPayload, signature }
    });
  } catch (err) {
    res.json({ ok: false, error: `Verification failed: ${err.message}` });
  }
});

// Alternative 1: BlockRun-Arbitrage Synthesis Route
const { synthesizeMarketReport } = require("./blockrun-arbitrage.cjs");
app.post("/api/arbitrage/synthesize", async (req, res) => {
  const ticker = req.body && req.body.ticker;
  if (!ticker || typeof ticker !== "string") {
    return res.status(400).json({ ok: false, error: "ticker body parameter required" });
  }
  const result = await synthesizeMarketReport(ticker);
  res.json(result);
});

// Alternative 4: Verification API Route (redirected target)
const { verifyEndpoint } = require("./x402-verifier.cjs");
app.get("/api/verify/x402", async (req, res) => {
  const target = req.query.target;
  if (!target || typeof target !== "string") {
    return res.status(400).json({ ok: false, error: "target query parameter required" });
  }
  const result = await verifyEndpoint(target);
  res.json(result);
});

// DTC Telegram Bot Gateway Startup
const { fork } = require("child_process");
const path = require("path");

if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log("→ Starting Telegram Bot Gateway process...");
  const botProcess = fork(path.join(__dirname, "telegram-gateway.cjs"), {
    env: { ...process.env }
  });
  botProcess.on("error", (err) => console.error("Telegram Bot Gateway crashed:", err));
  botProcess.on("exit", (code) => console.log("Telegram Bot Gateway exited with code:", code));
} else {
  console.log("→ TELEGRAM_BOT_TOKEN not set; skipping Telegram Bot Gateway startup.");
}

// --- Fleet Attestation Loop (every 30 min) ---
const { runAttestationSweep } = require("./watchdog-attestation.cjs");
setInterval(async () => {
  try {
    await runAttestationSweep();
  } catch (e) {
    console.error("[Attestation] Sweep failed:", e.message);
  }
}, 30 * 60 * 1000);
// Run once on boot
runAttestationSweep().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`→ Dispatch x402 listening on :${PORT}`);
  console.log(`→ Receive: ${PAY_TO} | price ${DISPATCH_PRICE} | services ${SERVICES.length}`);
});

