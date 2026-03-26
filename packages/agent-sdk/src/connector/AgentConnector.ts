/**
 * AgentConnector — lightweight class for external developers to join the AgentX network.
 *
 * Handles: connect, heartbeat, wallet derivation, request parsing, and response formatting.
 * Works inside any Cloudflare Worker — no on-chain knowledge required.
 *
 * @example
 * // wrangler.toml secrets: AGENTX_API_KEY, AGENTX_PRIVATE_KEY
 *
 * const connector = new AgentConnector({
 *   serverUrl:  "https://agentx-worker.davirain-yin.workers.dev",
 *   apiKey:     env.AGENTX_API_KEY,
 *   privateKey: env.AGENTX_PRIVATE_KEY,
 *   endpoint:   "https://my-worker.workers.dev",
 *   name:       "my-sentiment-agent",
 *   model:      "llama-3.3-70b",
 * });
 *
 * // In fetch handler:
 * return connector.handle(request, async (task) => {
 *   const result = await env.AI.run("@cf/meta/llama-3.3-70b", {
 *     messages: [{ role: "user", content: task.message }],
 *   });
 *   return result.response;
 * });
 *
 * // In scheduled handler (cron):
 * await connector.heartbeat();
 */

import { ethers } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentConnectorConfig {
  /** AgentX indexer URL, e.g. "https://agentx-worker.davirain-yin.workers.dev" */
  serverUrl: string;
  /** API key from the AgentX Dashboard (sk_node_xxx) */
  apiKey: string;
  /** This Worker's public URL, e.g. "https://my-agent.workers.dev" */
  endpoint: string;
  /** Display name shown in Agent Swarm */
  name: string;
  /** Private key for wallet derivation — store as Cloudflare secret */
  privateKey?: string;
  /** Model name shown in Agent Swarm, e.g. "llama-3.3-70b" */
  model?: string;
  /** Capabilities advertised to orchestrators */
  capabilities?: string[];
  /** X Layer RPC URL (only needed for on-chain payment features) */
  rpcUrl?: string;
}

/** Incoming task from an AgentX orchestrator */
export interface AgentTask {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Set when part of an A2A workflow */
  taskId?: string;
  /** Caller wallet address (for payment verification) */
  callerAddress?: string;
}

/** Standard CORS headers */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── AgentConnector ───────────────────────────────────────────────────────────

export class AgentConnector {
  private readonly config: AgentConnectorConfig;
  private readonly wallet: ethers.Wallet | null = null;

  constructor(config: AgentConnectorConfig) {
    this.config = config;

    if (config.privateKey) {
      // Derive deterministic wallet: same pattern as AgentX internal agents
      const seed = ethers.keccak256(
        ethers.toUtf8Bytes(`${config.privateKey}:${config.name}`)
      );
      this.wallet = new ethers.Wallet(seed);
    }
  }

  /**
   * Register this Worker with the AgentX indexer.
   * Call once on startup or after each deploy.
   */
  async connect(): Promise<void> {
    const res = await fetch(`${this.config.serverUrl}/api/nodes/connect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint: this.config.endpoint,
        name: this.config.name,
        model: this.config.model || "unknown",
        capabilities: this.config.capabilities || [],
        ...(this.wallet ? { address: this.wallet.address } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AgentConnector.connect failed (${res.status}): ${body}`);
    }
  }

  /**
   * Refresh the node's alive TTL in the indexer (5-minute window).
   * Call from a Cloudflare cron trigger every 2 minutes.
   *
   * @example
   * // wrangler.toml: crons = ["*\/2 * * * *"]
   * async scheduled(_event, env) {
   *   await connector.heartbeat();
   * }
   */
  async heartbeat(): Promise<void> {
    const res = await fetch(`${this.config.serverUrl}/api/nodes/heartbeat`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.config.apiKey}` },
    });

    if (!res.ok && res.status === 404) {
      // Node expired — re-register
      await this.connect();
    }
  }

  /**
   * Derived on-chain wallet address.
   * Returns null if no privateKey was provided.
   * This address receives A2A payments from orchestrators.
   */
  getAddress(): string | null {
    return this.wallet?.address ?? null;
  }

  /**
   * Parse an incoming AgentX task request.
   * Handles both direct POST /chat calls and AgentX orchestrator payloads.
   */
  async parseRequest(request: Request): Promise<AgentTask> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return {
      message: (body.message as string) || (body.prompt as string) || "",
      history: (body.history as AgentTask["history"]) || [],
      taskId: body.taskId as string | undefined,
      callerAddress: body.callerAddress as string | undefined,
    };
  }

  /**
   * Build a standard AgentX response.
   */
  respond(text: string, status = 200): Response {
    return Response.json({ response: text }, { status, headers: CORS });
  }

  /**
   * All-in-one handler for a Cloudflare Worker fetch function.
   * Routes /health, /chat, and OPTIONS automatically.
   * Pass your AI logic as the `handler` callback.
   *
   * @example
   * export default {
   *   async fetch(request, env) {
   *     return connector.handle(request, async (task) => {
   *       const out = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
   *         messages: [{ role: "user", content: task.message }],
   *       });
   *       return (out as { response: string }).response;
   *     });
   *   },
   * };
   */
  async handle(
    request: Request,
    handler: (task: AgentTask) => Promise<string>
  ): Promise<Response | null> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        name: this.config.name,
        model: this.config.model || "unknown",
        ...(this.wallet ? { address: this.wallet.address } : {}),
      }, { headers: CORS });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const task = await this.parseRequest(request);
        if (!task.message) {
          return this.respond("message is required", 400);
        }
        const reply = await handler(task);
        return this.respond(reply);
      } catch (err) {
        return this.respond(`Agent error: ${String(err)}`, 500);
      }
    }

    // Return null → caller handles remaining routes
    return null;
  }
}
