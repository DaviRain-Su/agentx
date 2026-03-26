/**
 * AgentX Worker - Cloudflare Worker for Decentralized Agent Execution Network
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
import { createDownloadHandler } from "pi-worker";
import { CloudflareRuntime, RuntimeFactory, ExecutionNode, NodeConfig } from "@agentx/shared-orchestrator";
import { WorkflowOrchestrator, PriceOracleAgent, TradeStrategyAgent } from "@agentx/agent-sdk";
import { CONTRACTS } from "./config/contracts";
import { AgentSession } from "./agents/AgentSession";
import { A2APaymentWorkflow, type A2AWorkflowParams, type A2AWorkflowResult } from "./workflows/A2APaymentWorkflow";
import { CodegenWorkflow, type CodegenWorkflowParams, type CodegenWorkflowResult } from "./workflows/CodegenWorkflow";

// Re-export Durable Objects and Workflows for Wrangler bindings
export { AgentSession, A2APaymentWorkflow, CodegenWorkflow };

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
  UNISWAP_API_KEY?: string;
  UNISWAP_QUOTE_URL?: string;

  // xurl / workflow storage (optional)
  XURL_API_KEY?: string;
  XURL_ENDPOINT?: string;

  // Cloudflare services
  AGENTX_KV: KVNamespace;
  AI: Ai;
  AGENT_SESSIONS: DurableObjectNamespace;
  A2A_WORKFLOW: Workflow<A2AWorkflowParams>;
  CODEGEN_WORKFLOW: Workflow<CodegenWorkflowParams>;
  CODEGEN_FILES: R2Bucket;
  DOWNLOAD_SECRET: string;
  LOADER?: unknown;
  OUTBOUND?: Fetcher;

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

    // ── A2A Workflow Endpoints ────────────────────────────────────────────────
    // POST /api/a2a  — start a durable A2A payment workflow
    //   Body: { symbol, budget, callerAddress, type?, condition?, threshold?, riskLevel? }
    //   Returns: { jobId, status: "running" }
    //
    // GET /api/a2a/:jobId — poll workflow status
    //   Returns: { status: "running"|"completed"|"failed", result? }

    if (url.pathname === "/api/a2a" && request.method === "POST") {
      return handleStartA2AWorkflow(request, env);
    }

    const a2aStatusMatch = url.pathname.match(/^\/api\/a2a\/([^/]+)$/);
    if (a2aStatusMatch && request.method === "GET") {
      return handleA2AStatus(a2aStatusMatch[1], env);
    }

    // Legacy simulation endpoint (no callerAddress = demo mode, still sync)
    if (url.pathname === "/api/a2a/simulate" && request.method === "POST") {
      return handleA2ASimulate(request, env);
    }

    // ── CodeFlare Codegen Workflow Endpoints ─────────────────────────────────

    if (url.pathname === "/api/codegen" && request.method === "POST") {
      return handleStartCodegenWorkflow(request, env);
    }

    const codegenStatusMatch = url.pathname.match(/^\/api\/codegen\/([^/]+)$/);
    if (codegenStatusMatch && request.method === "GET") {
      return handleCodegenStatus(codegenStatusMatch[1], env);
    }

    if (url.pathname.startsWith("/api/codegen/download/") && request.method === "GET") {
      return handleCodegenDownload(request, env);
    }

    // ── Agent Addresses ───────────────────────────────────────────────────────
    // GET /api/agents — returns derived wallet addresses for all 3 demo agents

    if (url.pathname === "/api/agents" && request.method === "GET") {
      if (!env.NODE_PRIVATE_KEY) {
        return Response.json({ error: "NODE_PRIVATE_KEY not set" }, { status: 503, headers: CORS });
      }
      // Use agent-sdk as single source of truth for agent info
      const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
      const orchestrator = new WorkflowOrchestrator(env.NODE_PRIVATE_KEY, provider);
      const priceAgent   = new PriceOracleAgent(env.NODE_PRIVATE_KEY, provider);
      const tradeAgent   = new TradeStrategyAgent(env.NODE_PRIVATE_KEY, provider);

      const toEntry = (agent: WorkflowOrchestrator | PriceOracleAgent | TradeStrategyAgent) => {
        const info = agent.getInfo();
        return { address: info.address, fee: `${info.pricing.perCall} USDC`, capabilities: info.capabilities };
      };

      return Response.json({
        "orchestrator":   toEntry(orchestrator),
        "price-oracle":   toEntry(priceAgent),
        "trade-strategy": toEntry(tradeAgent),
      }, { headers: CORS });
    }

    // ── Agent SDK Deploy ─────────────────────────────────────────────────────
    // POST /api/deploy — provision an agent session from a template

    if (url.pathname === "/api/deploy" && request.method === "POST") {
      let body: { template?: string; config?: { name?: string } } = {};
      try { body = await request.json() as typeof body; } catch { /* ok */ }

      const sessionId = crypto.randomUUID();
      await env.AGENTX_KV.put(
        `agent_session:${sessionId}`,
        JSON.stringify({ template: body.template || "orchestrator", config: body.config, createdAt: Date.now() }),
        { expirationTtl: 86400 }
      );

      return Response.json({
        agentId: sessionId,
        sessionId,
        template: body.template || "orchestrator",
        chatUrl: `/agent/chat/${sessionId}`,
        wsUrl: `/agent/ws/${sessionId}`,
        status: "deployed",
      }, { headers: CORS });
    }

    // ── Human-in-the-Loop Confirm ─────────────────────────────────────────────

    const confirmMatch = url.pathname.match(/^\/tasks\/(\d+)\/confirm$/);
    if (confirmMatch && request.method === "POST") {
      const taskId = confirmMatch[1];
      let body: { approved?: boolean } = {};
      try { body = await request.json() as typeof body; } catch { /* empty body ok */ }
      const approved = body.approved !== false; // default true
      await env.AGENTX_KV.put(
        `human_approval:${taskId}`,
        JSON.stringify({ approved, ts: Date.now() }),
        { expirationTtl: 3600 }
      );
      return Response.json({ ok: true, taskId, approved }, { headers: CORS });
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
  const message = `AgentX Access: ${taskId}`;
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
  await env.AGENTX_KV.put(
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
  const session = await env.AGENTX_KV.get(`agent_session:${sessionId}`);
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);
  const doUrl = new URL(path, "https://agent-session");
  return stub.fetch(new Request(doUrl.toString(), request));
}

// ─── A2A Workflow Handlers ────────────────────────────────────────────────────

/** POST /api/a2a — launch a durable Cloudflare Workflow for the payment flow */
async function handleStartA2AWorkflow(request: Request, env: Env): Promise<Response> {
  if (!env.NODE_PRIVATE_KEY) {
    return Response.json({ error: "NODE_PRIVATE_KEY not configured" }, { status: 503, headers: CORS });
  }

  let body: Partial<A2AWorkflowParams> = {};
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }); }

  if (!body.callerAddress) {
    return Response.json(
      { error: "callerAddress required. For demo without wallet use POST /api/a2a/simulate" },
      { status: 400, headers: CORS }
    );
  }

  const params: A2AWorkflowParams = {
    symbol:        body.symbol       || "ETH",
    budget:        body.budget       || 0.01,
    callerAddress: body.callerAddress,
    type:          body.type         || "price_only",
    condition:     body.condition,
    threshold:     body.threshold,
    riskLevel:     body.riskLevel    || "medium",
  };

  const jobId = `a2a_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    await env.A2A_WORKFLOW.create({ id: jobId, params });
  } catch (err) {
    return Response.json({ error: `Failed to start workflow: ${err}` }, { status: 500, headers: CORS });
  }

  return Response.json({ jobId, status: "running", pollUrl: `/api/a2a/${jobId}` }, { headers: CORS });
}

/** GET /api/a2a/:jobId — poll workflow status */
async function handleA2AStatus(jobId: string, env: Env): Promise<Response> {
  try {
    const instance = await env.A2A_WORKFLOW.get(jobId);
    const info = await instance.status();

    switch (info.status) {
      case "queued":
      case "running":
      case "waiting":
      case "paused":
        return Response.json({ jobId, status: "running" }, { headers: CORS });

      case "complete":
        return Response.json({
          jobId,
          status: "completed",
          result: info.output as A2AWorkflowResult,
        }, { headers: CORS });

      case "errored":
      case "terminated":
        return Response.json({
          jobId,
          status: "failed",
          error: (info as any).error?.message || `Workflow ${info.status}`,
        }, { headers: CORS });

      default:
        return Response.json({ jobId, status: "unknown" }, { headers: CORS });
    }
  } catch {
    return Response.json({ error: "Job not found" }, { status: 404, headers: CORS });
  }
}

/** POST /api/a2a/simulate — demo mode, no wallet needed, returns mock payment trail */
async function handleA2ASimulate(request: Request, env: Env): Promise<Response> {
  let body: { symbol?: string; budget?: number; threshold?: number; condition?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* ok */ }

  const symbol = (body.symbol || "ETH").toUpperCase();
  const budget = body.budget || 0.01;

  let price = 0;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    if (res.ok) { const d = await res.json() as { price: string }; price = parseFloat(d.price); }
  } catch { /* ignore */ }

  const threshold = body.threshold || 0;
  const conditionMet = threshold > 0 ? price > threshold : true;

  const deriveAddress = (name: string) => {
    if (!env.NODE_PRIVATE_KEY) return `0x${"0".repeat(40)}`;
    const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${env.NODE_PRIVATE_KEY}:${name}`));
    return new ethers.Wallet(walletSeed).address;
  };

  return Response.json({
    status: "simulated",
    note: "Simulation mode — no real USDC transfers. Use POST /api/a2a with callerAddress for real payments.",
    symbol,
    currentPrice: price,
    conditionMet,
    action: conditionMet ? "BUY" : "HOLD",
    agentAddresses: {
      orchestrator:  deriveAddress("orchestrator"),
      priceOracle:   deriveAddress("price-oracle"),
      tradeStrategy: deriveAddress("trade-strategy"),
    },
    simulatedPayments: [
      { step: "User → Orchestrator",            amount: `${budget} USDC` },
      { step: "Orchestrator → PriceOracleAgent", amount: "0.001 USDC" },
      conditionMet ? { step: "Orchestrator → TradeStrategyAgent", amount: "0.005 USDC" } : null,
      { step: "Orchestrator → User (refund)",    amount: `${(budget - 0.001 - (conditionMet ? 0.005 : 0)).toFixed(4)} USDC` },
    ].filter(Boolean),
  }, { headers: CORS });
}

// ─── CodeFlare Workflow Handlers ─────────────────────────────────────────────

/** POST /api/codegen — launch durable code generation workflow */
async function handleStartCodegenWorkflow(request: Request, env: Env): Promise<Response> {
  if (!env.CODEGEN_WORKFLOW || !env.CODEGEN_FILES || !env.DOWNLOAD_SECRET) {
    return Response.json({ error: "Codegen workflow bindings are not configured" }, { status: 503, headers: CORS });
  }

  let body: Partial<CodegenWorkflowParams> = {};
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }); }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400, headers: CORS });
  }

  const params: CodegenWorkflowParams = {
    prompt,
    language: body.language || "typescript",
    target: body.target || "cloudflare-worker",
  };
  const jobId = `codegen_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    await env.CODEGEN_WORKFLOW.create({
      id: jobId,
      params,
      retention: {
        successRetention: "1 day",
        errorRetention: "1 day",
      },
    });
  } catch (err) {
    return Response.json({ error: `Failed to start codegen workflow: ${err}` }, { status: 500, headers: CORS });
  }

  return Response.json({
    jobId,
    status: "running",
    pollUrl: `/api/codegen/${jobId}`,
  }, { headers: CORS });
}

/** GET /api/codegen/:jobId — poll code generation workflow status */
async function handleCodegenStatus(jobId: string, env: Env): Promise<Response> {
  try {
    const instance = await env.CODEGEN_WORKFLOW.get(jobId);
    const info = await instance.status();

    switch (info.status) {
      case "queued":
      case "running":
      case "waiting":
      case "waitingForPause":
      case "paused":
        return Response.json({ jobId, status: "running" }, { headers: CORS });

      case "complete":
        return Response.json({
          jobId,
          status: "completed",
          result: info.output as CodegenWorkflowResult,
        }, { headers: CORS });

      case "errored":
      case "terminated":
        return Response.json({
          jobId,
          status: "failed",
          error: (info as any).error?.message || `Workflow ${info.status}`,
        }, { headers: CORS });

      default:
        return Response.json({ jobId, status: "unknown" }, { headers: CORS });
    }
  } catch {
    return Response.json({ error: "Job not found" }, { status: 404, headers: CORS });
  }
}

/** GET /api/codegen/download/:key?sig=... — serve signed artifact downloads */
async function handleCodegenDownload(request: Request, env: Env): Promise<Response> {
  if (!env.CODEGEN_FILES || !env.DOWNLOAD_SECRET) {
    return Response.json({ error: "Codegen download bindings are not configured" }, { status: 503, headers: CORS });
  }
  const downloads = createDownloadHandler(env.CODEGEN_FILES, env.DOWNLOAD_SECRET, "/api/codegen/download/");
  const served = await downloads.serve(request);
  return served || Response.json({ error: "Invalid or expired download URL" }, { status: 404, headers: CORS });
}

// ─── ExecutionNode Init ───────────────────────────────────────────────────────

async function initializeNode(env: Env): Promise<ExecutionNode> {
  const config: NodeConfig = {
    nodeId: env.NODE_ID || `cf-worker-${crypto.randomUUID()}`,
    privateKey: env.NODE_PRIVATE_KEY,
    endpoint: "https://agentx-worker.davirain-yin.workers.dev",
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
      "trade-api.gateway.uniswap.org",
      "gateway.ai.cloudflare.com",
      "xlayertestrpc.okx.com",
    ],
  });

  const executionNode = new ExecutionNode(runtime, config);
  await executionNode.initialize();
  console.log(`[Worker] Node ${config.nodeId} initialized`);
  return executionNode;
}
