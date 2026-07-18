const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function ensureAgentCashWallet() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.warn("[Arbitrage] Warning: PRIVATE_KEY environment variable not set.");
    return;
  }
  const homeDir = process.env.HOME || "/root";
  const agentCashDir = path.join(homeDir, ".agentcash");
  const walletPath = path.join(agentCashDir, "wallet.json");

  if (!fs.existsSync(walletPath)) {
    console.log("[Arbitrage] Initializing agentcash wallet inside container...");
    try {
      fs.mkdirSync(agentCashDir, { recursive: true });
      const walletConfig = {
        privateKey: pk.startsWith("0x") ? pk : `0x${pk}`,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(walletPath, JSON.stringify(walletConfig, null, 2));
      console.log(`[Arbitrage] Wallet config written to: ${walletPath}`);
    } catch (e) {
      console.error(`[Arbitrage] Failed to write agentcash wallet: ${e.message}`);
    }
  }
}

// Simple wrapper to call agentcash CLI for payments and fetching using exec to avoid libuv spawn bugs on Windows
function agentcashFetch(url, paymentHeader) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const headerOption = paymentHeader ? `-H "X-Payment: ${paymentHeader}"` : "";
    const cmd = `${isWin ? "npx.cmd" : "npx"} agentcash fetch "${url}" ${headerOption}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`agentcash failed: ${stderr || error.message}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout);
      }
    });
  });
}

// Main function to run the arbitrage synthesis
async function synthesizeMarketReport(ticker) {
  ensureAgentCashWallet();
  console.log(`[Arbitrage] Starting synthesis for ${ticker}...`);
  try {
    // Query Polymarket prediction odds via BlockRun gateway
    const polyUrl = `http://blockrun.ai/api/polymarket/search?query=${encodeURIComponent(ticker)}`;
    const polyData = await agentcashFetch(polyUrl);

    // Query DefiLlama protocol statistics via BlockRun gateway
    const llamaUrl = `http://blockrun.ai/api/defillama/protocol/${encodeURIComponent(ticker.toLowerCase())}`;
    const llamaData = await agentcashFetch(llamaUrl).catch(() => ({ error: "Protocol not found on DefiLlama" }));

    // Query Grok Search for live market sentiment via BlockRun
    const grokUrl = `http://blockrun.ai/api/grok/search?q=${encodeURIComponent(ticker + " market sentiment price predictions")}`;
    const grokData = await agentcashFetch(grokUrl).catch(() => ({ error: "Grok search failed" }));

    const synthesis = {
      timestamp: new Date().toISOString(),
      ticker: ticker.toUpperCase(),
      polymarket_sentiment: polyData.markets ? polyData.markets.slice(0, 3) : "No direct markets found",
      defillama_tvl: llamaData.tvl || "N/A",
      grok_analysis: grokData.answer || "N/A",
      consensus: "HOLD",
      confidence: "medium"
    };

    // Rule-based consensus decision
    if (grokData.answer && grokData.answer.toLowerCase().includes("bullish")) {
      synthesis.consensus = "BUY";
      synthesis.confidence = "high";
    } else if (grokData.answer && grokData.answer.toLowerCase().includes("bearish")) {
      synthesis.consensus = "SELL";
      synthesis.confidence = "high";
    }

    return { ok: true, report: synthesis };
  } catch (error) {
    console.error("[Arbitrage] Failed to synthesize:", error.message);
    return { ok: false, error: error.message };
  }
}

if (require.main === module) {
  const ticker = process.argv[2] || "ETH";
  synthesizeMarketReport(ticker).then(console.log);
}

module.exports = { synthesizeMarketReport };
