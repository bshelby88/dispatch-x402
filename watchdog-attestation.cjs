/**
 * watchdog-attestation.cjs — Fleet Uptime Attestation Loop
 * Royal Agentic Enterprises
 * 
 * Runs every 30 minutes via setInterval in dispatch-x402/index.js
 * Pings all 10 x402 endpoints, signs results with HMAC, logs to rae_ledger.json
 * Sends Telegram alerts on consecutive failures.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SIGNING_SECRET = process.env.RECEIPT_SECRET || 'rae-verification-secret-2026';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7795379160';

// 10 production x402 endpoints (verified healthy 2026-07-19)
const ENDPOINTS = [
  { name: 'staci-core', url: 'https://staci-core.fly.dev/health' },
  { name: 'dispatch-x402', url: 'https://dispatch-x402.fly.dev/health' },
  { name: 'tradingagents-x402', url: 'https://tradingagents-x402.fly.dev/health' },
  { name: 'vault-pro-x402', url: 'https://vault-pro-x402.fly.dev/health' },
  { name: 'suprapack-x402', url: 'https://suprapack-x402.fly.dev/health' },
  { name: 'royal-ruby-x402', url: 'https://royal-ruby-x402.fly.dev/health' },
  { name: 'nanobanana-x402', url: 'https://nanobanana-x402.fly.dev/health' },
  { name: 'power-pack-x402', url: 'https://power-pack-x402.fly.dev/health' },
  { name: 'sentry-forge-x402', url: 'https://sentry-forge-x402.fly.dev/health' },
  { name: 'dispute-forge-x402', url: 'https://dispute-forge-x402.fly.dev/health' }
];

// Track consecutive failures per service for alerting
const failureStreaks = {};

function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, url }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
  });
}

function sign(payload) {
  return crypto.createHmac('sha256', SIGNING_SECRET).update(JSON.stringify(payload)).digest('hex');
}

async function sendTelegramAlert(msg) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Attestation] Telegram not configured, alert:', msg);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {
    console.error('[Attestation] Telegram alert failed:', e.message);
  }
}

function loadLedger() {
  const ledgerPath = path.join(__dirname, 'rae_ledger.json');
  if (fs.existsSync(ledgerPath)) {
    try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return {}; }
  }
  return {};
}

function saveLedger(ledger) {
  const ledgerPath = path.join(__dirname, 'rae_ledger.json');
  // Keep last 1000 attestations
  if (ledger.attestations && ledger.attestations.length > 1000) {
    ledger.attestations = ledger.attestations.slice(-1000);
  }
  ledger.last_verification = Date.now();
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

async function runAttestationSweep() {
  console.log('[Attestation] Starting fleet sweep...');
  const results = [];
  const now = Date.now();

  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchUrl(ep.url);
      const ok = res.status === 200;
      const payload = {
        service: ep.name,
        url: ep.url,
        status: res.status,
        ok,
        timestamp: now,
        latency_ms: 0
      };
      results.push(payload);

      // Track failure streaks
      if (!ok) {
        failureStreaks[ep.name] = (failureStreaks[ep.name] || 0) + 1;
        if (failureStreaks[ep.name] === 2) { // Alert on 2nd consecutive failure
          await sendTelegramAlert(`🚨 *SERVICE DEGRADED*\nService: *${ep.name}*\nURL: ${ep.url}\nStatus: HTTP ${res.status}\nFailures: ${failureStreaks[ep.name]} consecutive\nTime: ${new Date(now).toISOString()}`);
        }
      } else {
        if (failureStreaks[ep.name] && failureStreaks[ep.name] >= 2) {
          await sendTelegramAlert(`✅ *SERVICE RECOVERED*\nService: *${ep.name}*\nBack to HTTP 200 after ${failureStreaks[ep.name]} failures.`);
        }
        failureStreaks[ep.name] = 0;
      }
    } catch (err) {
      failureStreaks[ep.name] = (failureStreaks[ep.name] || 0) + 1;
      const payload = {
        service: ep.name,
        url: ep.url,
        status: 0,
        ok: false,
        error: err.message,
        timestamp: now
      };
      results.push(payload);

      if (failureStreaks[ep.name] === 2) {
        await sendTelegramAlert(`🚨 *SERVICE DOWN*\nService: *${ep.name}*\nURL: ${ep.url}\nError: ${err.message}\nFailures: ${failureStreaks[ep.name]} consecutive\nTime: ${new Date(now).toISOString()}`);
      }
    }
  }

  // Create signed attestation receipt
  const receipt = {
    epoch: now,
    results,
    signature: sign({ epoch: now, results })
  };

  // Append to ledger
  const ledger = loadLedger();
  ledger.attestations = ledger.attestations || [];
  ledger.attestations.push(receipt);
  saveLedger(ledger);

  console.log(`[Attestation] Sweep complete: ${results.filter(r => r.ok).length}/${results.length} healthy`);
  return receipt;
}

// Export for programmatic use
module.exports = { runAttestationSweep, loadLedger };

// CLI mode
if (require.main === module) {
  runAttestationSweep()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}