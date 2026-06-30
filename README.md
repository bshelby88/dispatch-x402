# dispatch-x402 — x402 Aggregator Meta-API

One paid endpoint that routes an agent's natural-language intent to the correct
paid service in the Royal Agentic x402 fleet. Routing itself is the priced
primitive. Live on Base mainnet.

## Endpoints

| Endpoint | Cost | Purpose |
|----------|------|---------|
| `GET /health` | free | Liveness |
| `GET /about` | free | Service info, pricing, registry |
| `GET /api/services` | free | List routable fleet services |
| `POST /classify` | free | Preview: chosen service + confidence + extracted params. No charge for ambiguous routes. |
| `POST /dispatch` | $0.50 USDC | Authoritative route + params + downstream call instructions |
| `GET /.well-known/x402.json` | free | x402 Bazaar discovery manifest |

Body for `/classify` and `/dispatch`: `{ "intent": "score this cold email", "params": {} }`

## Confidence gate

`≥0.88` auto-execute-safe · `≥0.65` confirm · `<0.65` ambiguous (use free `/classify`).
Classification via Claude Haiku, keyword fallback so `/dispatch` never hard-fails
after charging.

## Deploy

Git-gated. Push to `main` → GitHub Actions runs `flyctl deploy`. Never deploy by hand.

## Secrets (Fly)

`X402_PAY_TO`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET_B64`, `ANTHROPIC_API_KEY`.

## Routing registry

Edit `registry.js` to add/adjust fleet services. Each entry carries the intent
signature the classifier routes on plus the downstream call terms.
