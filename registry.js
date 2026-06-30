// Fleet service registry — the routing target set for the dispatch meta-API.
// Each entry: stable id, live base URL, paid endpoint, price, network, intent
// signature (the classifier routes on it), and param hints. Endpoints + prices
// verified live against each service's /.well-known/x402.json + source 2026-06-29.

const NETWORK_MAINNET = "eip155:8453";

const SERVICES = [
  {
    id: "suprapack",
    name: "SupraPack — skill discovery",
    base: "https://suprapack-x402.fly.dev",
    endpoint: "/api/find-skill",
    method: "POST",
    price: "$0.03",
    network: NETWORK_MAINNET,
    intent: "Find or search Claude Code skills/agents by keyword or goal. Discover a capability to load on demand.",
    params_hint: { goal: "string (what skill/capability to find)" },
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
    params_hint: { subject: "string (email subject)", body: "string (email body)" },
  },
  {
    id: "royal-ruby",
    name: "Royal Ruby — US consumer-law citation lookup",
    base: "https://royal-ruby-x402.fly.dev",
    endpoint: "/api/law-lookup",
    method: "POST",
    price: "$0.01",
    network: NETWORK_MAINNET,
    intent: "Look up US consumer-protection law citations (FDCPA, FCRA, TILA, etc.) for a topic or situation. Informational, not legal advice.",
    params_hint: { topic: "string (consumer-law topic or question)" },
  },
  {
    id: "sentry-forge",
    name: "Sentry Forge — debt dispute pack",
    base: "https://sentry-forge-x402.fly.dev",
    endpoint: "/api/dispute-pack",
    method: "POST",
    price: "$0.50",
    network: NETWORK_MAINNET,
    intent: "Generate a consumer-debt dispute letter / dispute pack for a collection or credit-report item.",
    params_hint: { debt: "string (the debt/collection situation)" },
  },
  {
    id: "vault-pro",
    name: "Vault Pro — Obsidian project scaffolder",
    base: "https://vault-pro-x402.fly.dev",
    endpoint: "/api/scaffold-project",
    method: "POST",
    price: "$0.05",
    network: NETWORK_MAINNET,
    intent: "Scaffold an Obsidian project or agent vault structure from a goal/description.",
    params_hint: { goal: "string (what to scaffold)" },
  },
  {
    id: "tradingagents",
    name: "TradingAgents — multi-agent ticker analysis",
    base: "https://tradingagents-x402.fly.dev",
    endpoint: "/api/analyze-ticker",
    method: "POST",
    price: "$0.05",
    network: NETWORK_MAINNET,
    intent: "Run a multi-agent LLM analysis/consensus on a stock ticker for a buy/hold/sell view.",
    params_hint: { ticker: "string (stock symbol)" },
  },
  {
    id: "nanobanana",
    name: "Nanobanana — paid image generation",
    base: "https://nanobanana-x402.fly.dev",
    endpoint: "/api/generate-image",
    method: "POST",
    price: "$0.01",
    network: NETWORK_MAINNET,
    intent: "Generate an image from a text prompt. (Use /api/edit-image to edit an existing image.)",
    params_hint: { prompt: "string (image prompt)" },
  },
  {
    id: "nft-alpha",
    name: "NFT Alpha — OpenSea market signals",
    base: "https://nft-alpha-x402.fly.dev",
    endpoint: "/api/nft-signal",
    method: "POST",
    price: "$0.10",
    network: NETWORK_MAINNET,
    intent: "Get real-time OpenSea market signals for a watched NFT collection — floor pressure, listings, sales, bids, sell-through.",
    params_hint: { collection: "string (collection slug or address)" },
  },
];

module.exports = { SERVICES, NETWORK_MAINNET };
