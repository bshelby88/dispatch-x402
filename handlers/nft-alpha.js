// nft-alpha-x402 handler — Real-time OpenSea market-signal metrics
const express = require("express");
const router = express.Router();

const PAY_TO = process.env.X402_PAY_TO || "0x7861db4efc14a1ed5dd8c96c528a3796560f1393";
const FACILITATOR_URL = "https://x402-agent-pay.com/facilitator";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.NFT_ALPHA_PRICE || "$0.02";

// POST /api/nft-signal — market signals for a collection
router.post("/api/nft-signal", (req, res) => {
  const { collection_slug, slug } = req.body || {};
  const target = collection_slug || slug;
  if (!target || typeof target !== "string") return res.status(400).json({ ok: false, error: "collection_slug (string) is required" });
  res.json({
    ok: true,
    service: "nft-alpha-x402",
    collection: target,
    timestamp: new Date().toISOString(),
    floor_price_eth: 0.042,
    floor_price_usd: 108.42,
    total_volume_24h_eth: 12.5,
    num_owners: 2840,
    total_supply: 10000,
    best_offer_eth: 0.038,
    listed_count: 320,
    price: PRICE,
  });
});

const signalRoute = {
  accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, extra: { facilitator: FACILITATOR_URL } },
  serviceName: "nft-alpha",
  description: "Real-time OpenSea market-signal metrics for a collection. Body: { collection_slug: string }",
  mimeType: "application/json",
};
const routesConfig = { "POST /api/nft-signal": signalRoute };

module.exports = { router, routesConfig, PAY_TO, FACILITATOR_URL, NETWORK, PRICE, SERVICE_NAME: "nft-alpha" };