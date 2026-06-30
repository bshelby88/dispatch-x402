// Fleet service registry — the routing target set for the dispatch meta-API.
// Each entry: stable id, live base URL, paid endpoint, price, network, and an
// intent signature used by the classifier. Keep descriptions distinct — the
// classifier routes on them.

const NETWORK_MAINNET = "eip155:8453";

const SERVICES = [
  {
    id: "suprapack",
    name: "SupraPack — skill discovery",
    base: "https://suprapack-x402.fly.dev",
    endpoint: "/api/find-skill",
    method: "POST",
    price: "$0.01",
    network: NETWORK_MAINNET,
    intent: "Find or search Claude Code skills/agents by keyword. Discover a capability to load on demand.",
    params_hint: { query: "string (what skill to find)" },
  },
  {
    id: "power-pack",
    name: "Power Pack — outreach email scorer",
    base: "https://power-pack-x402.fly.dev",
    endpoint: "/api/score-email",
    method: "POST",
    price: "$0.01",
    network: NETWORK_MAINNET,
    intent: "Score or critique a cold/outreach/sales email for quality, deliverability, and persuasion.",
    params_hint: { email: "string (the email body to score)" },
  },
  {
    id: "royal-ruby",
    name: "Royal Ruby — US consumer-law citation lookup",
    base: "https://royal-ruby-x402.fly.dev",
    endpoint: "/api/cite",
    method: "POST",
    price: "$0.05",
    network: NETWORK_MAINNET,
    intent: "Look up US consumer-protection law citations (FDCPA, FCRA, TILA, etc.) for a situation. Informational, not legal advice.",
    params_hint: { question: "string (consumer-law question)" },
  },
  {
    id: "sentry-forge",
    name: "Sentry Forge — debt dispute pack",
    base: "https://sentry-forge-x402.fly.dev",
    endpoint: "/api/dispute",
    method: "POST",
    price: "$0.50",
    network: NETWORK_MAINNET,
    intent: "Generate a consumer-debt dispute letter / dispute pack for a collection or credit-report item.",
    params_hint: { details: "string (the debt/collection situation)" },
  },
  {
    id: "vault-pro",
    name: "Vault Pro — Obsidian project scaffolder",
    base: "https://vault-pro-x402.fly.dev",
    endpoint: "/api/scaffold",
    method: "POST",
    price: "$0.05",
    network: NETWORK_MAINNET,
    intent: "Scaffold an Obsidian project/agent vault structure from a description.",
    params_hint: { spec: "string (what to scaffold)" },
  },
  {
    id: "tradingagents",
    name: "TradingAgents — multi-agent ticker analysis",
    base: "https://tradingagents-x402.fly.dev",
    endpoint: "/api/analyze-ticker",
    method: "POST",
    price: "$1.00",
    network: NETWORK_MAINNET,
    intent: "Run a multi-agent LLM analysis/consensus on a stock ticker for a buy/hold/sell view.",
    params_hint: { ticker: "string (stock symbol)" },
  },
  {
    id: "nanobanana",
    name: "Nanobanana — paid image generation",
    base: "https://nanobanana-x402.fly.dev",
    endpoint: "/api/generate",
    method: "POST",
    price: "$0.02",
    network: NETWORK_MAINNET,
    intent: "Generate or edit an image from a text prompt.",
    params_hint: { prompt: "string (image prompt)" },
  },
  {
    id: "nft-alpha",
    name: "NFT Alpha — NFT collection signal",
    base: "https://nft-alpha-x402.fly.dev",
    endpoint: "/api/alpha",
    method: "POST",
    price: "$0.05",
    network: NETWORK_MAINNET,
    intent: "Get alpha/signal on watched NFT collections (floor moves, volume, mint activity).",
    params_hint: { collection: "string (collection name or address)" },
  },
];

module.exports = { SERVICES, NETWORK_MAINNET };
