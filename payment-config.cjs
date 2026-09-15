"use strict";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Canonical fleet treasury (Base mainnet) — Royal Agentic Enterprises.
// Lingua-hardening pattern (POWER-PACK-BUY-1 / ROYALRUBY-BUY-1, 2026-09-15):
// a valid-but-wrong X402_PAY_TO silently misroutes every sale, so production
// boot now fails closed unless the recipient IS the canonical treasury.
const CANONICAL_TREASURY = "0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393";

function resolveProductionRecipient(env = process.env) {
  const recipient = env.X402_PAY_TO;
  if (typeof recipient !== "string" || !EVM_ADDRESS.test(recipient)) {
    throw new Error("X402_PAY_TO must be an explicitly configured valid EVM address");
  }
  if (recipient.toLowerCase() !== CANONICAL_TREASURY.toLowerCase()) {
    throw new Error(
      `X402_PAY_TO must be the canonical fleet treasury ${CANONICAL_TREASURY} (got ${recipient})`
    );
  }
  return recipient;
}

module.exports = { resolveProductionRecipient, CANONICAL_TREASURY };
