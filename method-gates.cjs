"use strict";

// x402 discovery crawlers (Coinbase Bazaar) probe paid URLs with GET/HEAD. Expand each
// "POST /path" route into GET and HEAD gates carrying the same payment requirements so the
// challenge is identical. POST config is untouched; existing GET/HEAD keys are kept.
function withReadMethodGates(routes) {
  const out = { ...routes };
  for (const [key, config] of Object.entries(routes)) {
    const m = /^POST (\/.+)$/.exec(key);
    if (!m) continue;
    for (const verb of ["GET", "HEAD"]) {
      const k = `${verb} ${m[1]}`;
      if (!(k in out)) out[k] = config;
    }
  }
  return out;
}

module.exports = { withReadMethodGates };
