"use strict";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function resolveProductionRecipient(env = process.env) {
  const recipient = env.X402_PAY_TO;
  if (typeof recipient !== "string" || !EVM_ADDRESS.test(recipient)) {
    throw new Error("X402_PAY_TO must be an explicitly configured valid EVM address");
  }
  return recipient;
}

module.exports = { resolveProductionRecipient };
