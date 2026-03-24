/**
 * Gradience Worker - Cloudflare Worker for Decentralized Agent Execution Network
 *
 * Features:
 * - Runtime abstraction supporting multiple execution environments
 * - Node registration with capability discovery
 * - Task execution with sandboxed agents
 * - P2P communication with other nodes
 * - On-chain settlement and verification
 * - AI Agent sessions via CF AI Gateway (multi-model, configurable)
 */

import { ethers } from "ethers";
import { CloudflareRuntime, RuntimeFactory, ExecutionNode, NodeConfig } from "@gradience/shared-orchestrator";
import { CONTRACTS } from "./config/contracts";
import { AgentSession } from "./agents/AgentSession";

// Re-export Durable Object for Wrangler binding
export { AgentSession };

export interface Env {
  // Node identity
  NODE_ID: string;
  NODE_PRIVATE_KEY: string;

  // Network
  XLAYER_RPC_URL: string;
  REGISTRY_CONTRACT: string;

  // CF AI Gateway (routes to Workers AI / Anthropic / OpenAI / etc.)
  CF_ACCOUNT_ID: string;
  CF_GATEWAY_NAME: string;
  CF_GATEWAY_TOKEN: string;          // Secret: CF API token
  AI_GATEWAY_MODEL: string;          // e.g. "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

  // External APIs (optional, for providers beyond Workers AI)
  ANTHROPIC_API_KEY?: string;
  COINGECKO_API_KEY?: string;

  // xurl / workflow storage (optional)
  XURL_API_KEY?: string;
  XURL_ENDPOINT?: string;

  // Cloudflare services
  GRADIENCE_KV: KVNamespace;
  AI: Ai;
  AGENT_SESSIONS: DurableObjectNamespace;

  // Feature flags
  DEMO_MODE?: string;
}

// Node instance (lazy init)
let node: ExecutionNode | null = null;

// CORS headers
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── Agent API (handled by Durable Objects) ───────────────────────────────

    if (url.pathname === "/agent/auth" && request.method === "POST") {
      return handleAgentAuth(request, env);
    }

    if (url.pathname.startsWith("/agent/ws/")) {
      const sessionId = url.pathname.split("/")[3];
      return proxyToSession(request, env, sessionId, "/ws");
    }

    if (url.pathname.startsWith("/agent/chat/") && request.method === "POST") {
      const sessionId = url.pathname.split("/")[3];
      return proxyToSession(request, env, sessionId, "/chat");
    }

    if (url.pathname.startsWith("/agent/history/")) {
      const sessionId = url.pathname.split("/")[3];
      return proxyToSession(request, env, sessionId, "/history");
    }

    if (url.pathname.startsWith("/agent/clear/") && request.method === "POST") {
      const sessionId = url.pathname.split("/")[3];
      return proxyToSession(request, env, sessionId, "/clear");
    }

    // ── Health ───────────────────────────────────────────────────────────────

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        version: "0.2.0",
        gateway: `${env.CF_ACCOUNT_ID ? "configured" : "missing"}`,
        model: env.AI_GATEWAY_MODEL || "not set",
      }, { headers: CORS });
    }

    // ── ExecutionNode (decentralized task execution) ─────────────────────────

    if (!node) {
      try {
        node = await initializeNode(env);
      } catch (err) {
        console.error("[Worker] Node init failed:", err);
        return Response.json({ error: "Node not initialized", detail: String(err) }, { status: 503, headers: CORS });
      }
    }

    return node.handleRequest(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    console.log("[Worker] Scheduled heartbeat");
    if (!node) {
      try {
        node = await initializeNode(env);
      } catch (err) {
        console.error("[Worker] Node init failed in cron:", err);
        return;
      }
    }
    const health = await node.health();
    console.log(`[Worker] Health: ${JSON.stringify(health)}`);
  },
};

// ─── Agent Auth ───────────────────────────────────────────────────────────────

async function handleAgentAuth(request: Request, env: Env): Promise<Response> {
  let body: { taskId?: string; address?: string; signature?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { taskId, address, signature } = body;
  if (!taskId || !address || !signature) {
    return Response.json({ error: "Missing taskId, address, or signature" }, { status: 400, headers: CORS });
  }

  // Verify wallet signature
  const message = `Gradience Agent Access: ${taskId}`;
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401, headers: CORS });
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: "Signature mismatch" }, { status: 401, headers: CORS });
  }

  // Verify on-chain task ownership (skip in DEMO_MODE)
  if (env.DEMO_MODE !== "true") {
    try {
      const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
      const taskManager = new ethers.Contract(
        CONTRACTS.taskManager,
        ["function getTask(uint256) view returns (address requester, uint8 status, bytes32 workflowHash, uint256 totalBudget, uint256 currentStepIndex, uint256[] agentDIDs, uint256 createdAt, uint256 updatedAt, uint256 completedAt)"],
        provider
      );
      const task = await taskManager.getTask(taskId);
      if (task.requester.toLowerCase() !== address.toLowerCase()) {
        return Response.json({ error: "Not the task requester" }, { status: 403, headers: CORS });
      }
      const status = Number(task.status);
      if (status === 4 || status === 5) {
        return Response.json({ error: "Task failed or cancelled" }, { status: 403, headers: CORS });
      }
    } catch (err) {
      console.error("[AgentAuth] Chain verification failed:", err);
      return Response.json({ error: "Could not verify task on-chain" }, { status: 403, headers: CORS });
    }
  }

  // Issue 24h session token
  const sessionId = crypto.randomUUID();
  await env.GRADIENCE_KV.put(
    `agent_session:${sessionId}`,
    JSON.stringify({ taskId, address, createdAt: Date.now() }),
    { expirationTtl: 86400 }
  );

  return Response.json({ sessionId, expiresIn: 86400, taskId, address }, { headers: CORS });
}

// ─── Session Proxy ────────────────────────────────────────────────────────────

async function proxyToSession(
  request: Request,
  env: Env,
  sessionId: string,
  path: string
): Promise<Response> {
  // Verify session token
  const session = await env.GRADIENCE_KV.get(`agent_session:${sessionId}`);
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);
  const doUrl = new URL(path, "https://agent-session");
  return stub.fetch(new Request(doUrl.toString(), request));
}

// ─── ExecutionNode Init ───────────────────────────────────────────────────────

async function initializeNode(env: Env): Promise<ExecutionNode> {
  const config: NodeConfig = {
    nodeId: env.NODE_ID || `cf-worker-${crypto.randomUUID()}`,
    privateKey: env.NODE_PRIVATE_KEY,
    endpoint: "https://gradience-worker.davirain-yin.workers.dev",
    registryContract: env.REGISTRY_CONTRACT,
    provider: new ethers.JsonRpcProvider(env.XLAYER_RPC_URL),
    capabilities: {
      runtime: "cloudflare-worker",
      resources: { memory: 128, cpu: 1 },
      agentTypes: ["price-monitor", "condition-checker", "trade-executor", "llm-inference"],
      region: "global",
      network: { latency: 50, bandwidth: 100 },
      pricing: { perExecution: "0.005", perSecond: "0.0001" },
    },
  };

  const runtime = RuntimeFactory.create("cloudflare-worker", {
    maxMemoryMB: 128,
    maxCpuMs: 50,
    timeoutMs: 30000,
    allowNetwork: true,
    allowedHosts: [
      "api.coingecko.com",
      "api.binance.com",
      "gateway.ai.cloudflare.com",
      "xlayertestrpc.okx.com",
    ],
  });

  const executionNode = new ExecutionNode(runtime, config);
  await executionNode.initialize();
  console.log(`[Worker] Node ${config.nodeId} initialized`);
  return executionNode;
}
