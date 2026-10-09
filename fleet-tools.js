/**
 * Fleet AI SDK 7 Tool Definitions
 * Registers all 23 dispatch-x402 services as AI SDK tools.
 * Agents import this to get typed tools for every fleet service.
 *
 * Usage:
 *   import { registry } from "./fleet-tools.js";
 *   const tools = await registry.all();
 *   const result = await tools.suprapack({ goal: "find an NFT agent" });
 */

import { tool } from "ai";
import { z } from "zod";
import { SERVICES } from "./registry.js";

// ── Schema builders ──────────────────────────────────────────────

function paramsToSchema(paramsHint) {
  if (!paramsHint || typeof paramsHint !== "object") return z.object({}).optional();
  const shape = {};
  for (const [key, desc] of Object.entries(paramsHint)) {
    const required = !desc.endsWith("?");
    const base = z.string().describe(desc.replace(/\?$/, "").trim());
    shape[key] = required ? base : base.optional();
  }
  return z.object(shape);
}

// ── Tool builder ─────────────────────────────────────────────────

function buildTool(svc) {
  const schema = paramsToSchema(svc.params_hint);

  return tool({
    id: svc.id,
    description: `${svc.name} — ${svc.intent} (${svc.price})`,
    parameters: schema,
    execute: async (params, { abortSignal } = {}) => {
      const url = svc.base + svc.endpoint;
      console.log(`[FLEET-TOOL] ${svc.id}: calling ${svc.method} ${url}`);

      const options = {
        method: svc.method,
        headers: { "Content-Type": "application/json" },
        signal: abortSignal,
      };

      if (svc.method === "POST" && Object.keys(params).length > 0) {
        options.body = JSON.stringify(params);
      }

      const res = await fetch(url, options);

      if (res.status === 402) {
        // x402 payment challenge — return the challenge for automated handling
        const challenge = {
          requires_payment: true,
          service: svc.id,
          price: svc.price,
          network: svc.network,
          x402_url: url,
          payment_required_header: Object.fromEntries(
            [...res.headers.entries()].filter(([k]) =>
              k.toLowerCase().includes("payment")
            )
          ),
        };
        return challenge;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `${svc.id} returned HTTP ${res.status}: ${text.slice(0, 500)}`
        );
      }

      const body = await res.json().catch(() => null);
      return body;
    },
  });
}

// ── Registry ──────────────────────────────────────────────────────

class FleetToolRegistry {
  #initialized = false;
  #tools = {};

  async init() {
    if (this.#initialized) return;
    for (const svc of SERVICES) {
      this.#tools[svc.id] = buildTool(svc);
    }
    this.#initialized = true;
  }

  get(id) {
    if (!this.#initialized) throw new Error("Registry not initialized. Call registry.init() first.");
    const t = this.#tools[id];
    if (!t) throw new Error(`Unknown service: ${id}`);
    return t;
  }

  all() {
    if (!this.#initialized) throw new Error("Registry not initialized. Call registry.init() first.");
    return { ...this.#tools };
  }

  list() {
    return SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      description: s.intent,
    }));
  }
}

export const registry = new FleetToolRegistry();

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Bind all fleet tools into a tools object for AI SDK generateText.
 * Usage:
 *   const { text } = await generateText({
 *     model,
 *     tools: await fleetTools(),
 *     maxSteps: 5,
 *     prompt: "..."
 *   });
 */
export async function fleetTools() {
  await registry.init();
  return registry.all();
}

/**
 * Get tool config for a specific service by ID.
 */
export function getToolConfig(serviceId) {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) throw new Error(`Unknown service: ${serviceId}`);
  return {
    id: svc.id,
    name: svc.name,
    endpoint: svc.base + svc.endpoint,
    price: svc.price,
    network: svc.network,
  };
}

// ── Exports for integration ──────────────────────────────────────

export { SERVICES };
export default registry;