// Offline routing sanity — keyword classifier must land obvious intents.
// (LLM classify is exercised live against the running server in deploy checks.)
const { SERVICES } = require("./registry");

// re-implement the keyword scorer inline to avoid importing index.js (which boots a server)
function keywordClassify(intent) {
  const q = String(intent || "").toLowerCase();
  const toks = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let best = null, bestScore = 0;
  for (const s of SERVICES) {
    const hay = `${s.intent} ${s.name} ${s.id}`.toLowerCase();
    let score = 0;
    for (const t of toks) if (hay.includes(t)) score += 1;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best ? best.id : null;
}

const cases = [
  ["score this cold outreach email", "power-pack"],
  ["find me a skill for stripe webhooks", "suprapack"],
  ["generate an image of a ruby crown", "nanobanana"],
  ["analyze ticker NVDA for me", "tradingagents"],
  ["draft a debt dispute letter for a collection", "sentry-forge"],
];

let pass = 0;
for (const [intent, expected] of cases) {
  const got = keywordClassify(intent);
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  "${intent}" -> ${got} (expected ${expected})`);
  if (ok) pass++;
}
console.log(`\n${pass}/${cases.length} routing cases passed`);
process.exit(pass === cases.length ? 0 : 1);
