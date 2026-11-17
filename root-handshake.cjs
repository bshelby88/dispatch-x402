/**
 * ROOT MACHINE HANDSHAKE — fleet front-door fix (Nov 16).
 * Agents probing the service root were getting the human HTML page (or a 404)
 * even with `Accept: application/json`. This module adds root-level content
 * negotiation: a JSON machine handshake for machines, the unchanged landing
 * page for humans. Prices/payTo are read LIVE from this service's own
 * /.well-known/x402.json (loopback self-fetch, 60s cache) so the handshake
 * cannot drift from the manifest; the static block below is only a fallback
 * for cold-boot ordering and is verified against the live manifest per deploy.
 */
'use strict';
const http = require('http');

const CONFIG = {
  "service": "dispatch",
  "sku": "dispatch",
  "port": 3000,
  "description": "Dispatch API: routes a natural-language task intent to the right fleet service and returns the execution envelope.",
  "fallback_endpoints": [
    {
      "route": "/dispatch",
      "method": "POST",
      "price_usd": 0.5
    }
  ],
  "manifest_url": "https://dispatch-x402.fly.dev/.well-known/x402.json",
  "catalog_url": "https://settlement-collector.fly.dev/clearing/catalog.json",
  "clearing_intent": "POST https://settlement-collector.fly.dev/clearing/intent {buyer, service, sku}",
  "docs": "https://bshelby88.github.io/x402-cookbook/",
  "recovery": "https://settlement-collector.fly.dev/storefront/claims",
  "payment": {
    "scheme": "exact",
    "network": "eip155:8453",
    "payTo": "0x9b8a27e03ceba490953cda8ab1291c0e13baf72f"
  }
};

function wantsJson(req) {
  if (req.query && req.query.format === 'json') return true;
  const accept = String((req.headers && req.headers.accept) || '');
  const ua = String((req.headers && req.headers['user-agent']) || '');
  if (/x402|wallet|agent/i.test(ua)) return true;
  // A browser sends `text/html,application/xhtml+xml,...,*/*` — that stays HTML.
  // A machine asking for JSON sends an accept without an HTML entry.
  if (/application\/json/i.test(accept) && !/text\/html|application\/xhtml\+xml|\*\/\*/i.test(accept)) return true;
  return false;
}

function priceUsd(p) {
  if (p === null || p === undefined) return null;
  if (typeof p === 'number') return p;
  const m = /\$?([0-9]+(?:\.[0-9]+)?)/.exec(String(p));
  return m ? parseFloat(m[1]) : null;
}

function endpointsFromManifest(manifest) {
  const eps = (manifest && manifest.endpoints) || {};
  return Object.entries(eps).map(([route, ep]) => ({
    route,
    method: String(ep.method || 'GET').toUpperCase(),
    price_usd: priceUsd(ep.accepts && ep.accepts.price),
  }));
}

function paymentFromManifest(manifest) {
  const eps = (manifest && manifest.endpoints) || {};
  const first = Object.values(eps)[0] || {};
  const acc = first.accepts || {};
  return {
    scheme: acc.scheme || 'exact',
    network: acc.network || CONFIG.payment.network,
    asset: 'USDC',
    payTo: acc.payTo || CONFIG.payment.payTo,
  };
}

function buildHandshake(manifest) {
  const endpoints = (manifest && Object.keys(manifest.endpoints || {}).length)
    ? endpointsFromManifest(manifest)
    : CONFIG.fallback_endpoints;
  return {
    service: CONFIG.service,
    description: CONFIG.description,
    manifest_url: CONFIG.manifest_url,
    catalog_url: CONFIG.catalog_url,
    clearing_intent: CONFIG.clearing_intent,
    endpoints,
    payment: paymentFromManifest(manifest),
    docs: CONFIG.docs,
    recovery: CONFIG.recovery,
  };
}

function selfFetchManifest(port, cb) {
  const req = http.get({ host: '127.0.0.1', port, path: '/.well-known/x402.json', timeout: 3000 }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      try { cb(null, JSON.parse(body)); } catch (e) { cb(e); }
    });
  });
  req.on('error', (e) => cb(e));
  req.on('timeout', () => req.destroy(new Error('self-fetch timeout')));
}

function installRootHandshake(app) {
  let cache = null;
  let cacheAt = 0;
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path !== '/') return next();
    if (!wantsJson(req)) return next();
    const send = (manifest) => {
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.status(200).json(buildHandshake(manifest));
    };
    if (cache && Date.now() - cacheAt < 60000) return send(cache);
    const ports = [process.env.PORT, CONFIG.port, 8080, 3000]
      .map((p) => parseInt(p, 10))
      .filter((p, i, a) => p && a.indexOf(p) === i);
    let i = 0;
    const attempt = () => {
      if (i >= ports.length) return send(null);
      selfFetchManifest(ports[i++], (err, manifest) => {
        if (err || !manifest || !manifest.endpoints) return attempt();
        cache = manifest;
        cacheAt = Date.now();
        send(manifest);
      });
    };
    attempt();
  });
}

module.exports = { installRootHandshake, wantsJson, buildHandshake };
