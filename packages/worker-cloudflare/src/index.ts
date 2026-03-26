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
import { CloudflareRuntime, RuntimeFactory, ExecutionNode, NodeConfig } from "@agentx/shared-orchestrator";
import { WorkflowOrchestrator, PriceOracleAgent, TradeStrategyAgent } from "@agentx/agent-sdk";
import { CONTRACTS } from "./config/contracts";
import { AgentSession } from "./agents/AgentSession";
import { A2APaymentWorkflow, type A2AWorkflowParams, type A2AWorkflowResult } from "./workflows/A2APaymentWorkflow";

// Re-export Durable Objects and Workflows for Wrangler bindings
export { AgentSession, A2APaymentWorkflow };

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

    // POST /api/a2a/execute — synchronous A2A payment with axUSDC (real transferFrom + agent payments)
    if (url.pathname === "/api/a2a/execute" && request.method === "POST") {
      return handleA2AExecute(request, env);
    }

    // Legacy simulation endpoint (no callerAddress = demo mode, still sync)
    if (url.pathname === "/api/a2a/simulate" && request.method === "POST") {
      return handleA2ASimulate(request, env);
    }

    // ── Node Registry (KV-backed indexer) ────────────────────────────────────
    // POST /api/nodes/generate-key  — issue sk_node_xxx, no auth required
    // POST /api/nodes/connect       — register node endpoint (Bearer auth)
    // POST /api/nodes/heartbeat     — refresh node alive TTL (Bearer auth)
    // GET  /api/nodes/active        — list online nodes (public)
    // POST /api/hire                — X402 agent hiring (402 → pay → 200)

    if (url.pathname === "/api/nodes/generate-key" && request.method === "POST") {
      return handleNodeGenerateKey(request, env);
    }

    if (url.pathname === "/api/nodes/connect" && request.method === "POST") {
      return handleNodeConnect(request, env);
    }

    if (url.pathname === "/api/nodes/heartbeat" && request.method === "POST") {
      return handleNodeHeartbeat(request, env);
    }

    if (url.pathname === "/api/nodes/active" && request.method === "GET") {
      return handleNodeActive(env);
    }

    if (url.pathname === "/api/hire" && request.method === "POST") {
      return handleHireAgent(request, env);
    }

    // ── Agent Addresses ───────────────────────────────────────────────────────
    // GET /api/agents — returns derived wallet addresses for all 3 demo agents

    if (url.pathname === "/api/agents" && request.method === "GET") {
      // NODE_PRIVATE_KEY is optional — only needed for A2A demo agents.
      if (!env.NODE_PRIVATE_KEY) {
        return Response.json({}, { headers: CORS });
      }
      // Use agent-sdk as single source of truth for agent info
      const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
      const orchestrator = new WorkflowOrchestrator(env.NODE_PRIVATE_KEY, provider);
      const priceAgent   = new PriceOracleAgent(env.NODE_PRIVATE_KEY, provider);
      const tradeAgent   = new TradeStrategyAgent(env.NODE_PRIVATE_KEY, provider);

      const toEntry = (agent: WorkflowOrchestrator | PriceOracleAgent | TradeStrategyAgent) => {
        const info = agent.getInfo();
        return { address: info.address, fee: `${info.pricing.perCall} OKB`, capabilities: info.capabilities };
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

    if (!env.NODE_PRIVATE_KEY) {
      return Response.json({ error: "Not found" }, { status: 404, headers: CORS });
    }

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
    note: "Simulation mode — no real OKB transfers. Use POST /api/a2a with callerAddress for real payments.",
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
      { step: "Orchestrator → PriceOracleAgent", amount: "0.001 OKB" },
      conditionMet ? { step: "Orchestrator → TradeStrategyAgent", amount: "0.005 OKB" } : null,
      { step: "Orchestrator → User (refund)",    amount: `${(budget - 0.001 - (conditionMet ? 0.005 : 0)).toFixed(4)} OKB` },
    ].filter(Boolean),
  }, { headers: CORS });
}

// ─── Synchronous A2A Execute (axUSDC) ─────────────────────────────────────────

/**
 * POST /api/a2a/execute — Real A2A payment flow with axUSDC ERC-20
 *
 * Prerequisite: User must have called axUSDC.approve(orchestratorAddress, budget)
 * from their wallet BEFORE calling this endpoint.
 *
 * Steps (all in one request, no Durable Workflow):
 * 1. Orchestrator.transferFrom(user → orchestrator, budget) — pull axUSDC
 * 2. Orchestrator.transfer(→ priceOracle, fee) — A2A payment
 * 3. Fetch live price
 * 4. Orchestrator.transfer(→ tradeStrategy, fee) — A2A payment (if condition met)
 * 5. Orchestrator.transfer(→ user, remaining) — refund
 */
async function handleA2AExecute(request: Request, env: Env): Promise<Response> {
  if (!env.NODE_PRIVATE_KEY) {
    return Response.json({ error: "NODE_PRIVATE_KEY not configured" }, { status: 503, headers: CORS });
  }

  let body: { callerAddress?: string; symbol?: string; budget?: string; type?: string; threshold?: number } = {};
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const callerAddress = body.callerAddress;
  if (!callerAddress || !ethers.isAddress(callerAddress)) {
    return Response.json({ error: "callerAddress required" }, { status: 400, headers: CORS });
  }

  const symbol = (body.symbol || "ETH").toUpperCase();
  const budgetStr = body.budget || "1";
  const budgetWei = ethers.parseUnits(budgetStr, 6);
  const a2aType = body.type || "price_alert";
  const threshold = body.threshold ?? 0;

  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

  // Derive agent wallets
  const deriveWallet = (name: string) => {
    const seed = ethers.keccak256(ethers.toUtf8Bytes(`${env.NODE_PRIVATE_KEY}:${name}`));
    return new ethers.Wallet(seed, provider);
  };
  const orchestrator = deriveWallet("orchestrator");
  const priceOracle = deriveWallet("price-oracle");
  const tradeStrategy = deriveWallet("trade-strategy");

  const axUSDC = new ethers.Contract(CONTRACTS.usdc, [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ], orchestrator);

  const payments: Array<{ step: string; from: string; to: string; amount: string; txHash: string; blockNumber: number; explorerUrl: string }> = [];

  try {
    // ── Step 1: Pull budget from user (transferFrom) ───────────────────────
    const allowance = await axUSDC.allowance(callerAddress, orchestrator.address);
    if (allowance < budgetWei) {
      return Response.json({
        error: `Insufficient axUSDC allowance. User must approve ${budgetStr} axUSDC for ${orchestrator.address}. Current allowance: ${ethers.formatUnits(allowance, 6)}`,
      }, { status: 400, headers: CORS });
    }

    const tx1 = await axUSDC.transferFrom(callerAddress, orchestrator.address, budgetWei, { gasLimit: 100000 });
    const r1 = await tx1.wait(1);
    payments.push({
      step: "User → Orchestrator: deposit budget",
      from: callerAddress, to: orchestrator.address,
      amount: `${budgetStr} axUSDC`,
      txHash: r1.hash, blockNumber: r1.blockNumber,
      explorerUrl: `${EXPLORER}/${r1.hash}`,
    });

    // ── Step 2: Pay PriceOracle (A2A) ────────────────────────────────────────
    const priceFee = ethers.parseUnits("0.1", 6);
    const tx2 = await axUSDC.transfer(priceOracle.address, priceFee, { gasLimit: 100000 });
    const r2 = await tx2.wait(1);
    payments.push({
      step: "Orchestrator → PriceOracle: A2A payment",
      from: orchestrator.address, to: priceOracle.address,
      amount: "0.1 axUSDC",
      txHash: r2.hash, blockNumber: r2.blockNumber,
      explorerUrl: `${EXPLORER}/${r2.hash}`,
    });

    // ── Step 3: Fetch live price ──────────────────────────────────────────────
    let price = 0;
    let priceSource = "binance";
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
      if (res.ok) {
        const d = await res.json() as { price: string };
        price = parseFloat(d.price);
      }
    } catch { /* fallback below */ }
    if (!price) {
      const cgMap: Record<string, string> = { ETH: "ethereum", BTC: "bitcoin", SOL: "solana", OKB: "okb" };
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgMap[symbol] || symbol.toLowerCase()}&vs_currencies=usd`);
        if (res.ok) {
          const d = await res.json() as Record<string, { usd: number }>;
          price = Object.values(d)[0]?.usd || 0;
          priceSource = "coingecko";
        }
      } catch { /* ignore */ }
    }

    // ── Step 4: Pay TradeStrategy (conditional) ───────────────────────────────
    let action: string | undefined;
    let conditionMet: boolean | undefined;
    const tradeFee = ethers.parseUnits("0.5", 6);

    if (a2aType !== "price_only") {
      conditionMet = threshold > 0 ? price > threshold : true;
      if (conditionMet) {
        const tx3 = await axUSDC.transfer(tradeStrategy.address, tradeFee, { gasLimit: 100000 });
        const r3 = await tx3.wait(1);
        payments.push({
          step: "Orchestrator → TradeStrategy: A2A payment",
          from: orchestrator.address, to: tradeStrategy.address,
          amount: "0.5 axUSDC",
          txHash: r3.hash, blockNumber: r3.blockNumber,
          explorerUrl: `${EXPLORER}/${r3.hash}`,
        });
        action = price > (threshold || 0) ? "BUY" : "HOLD";
      }
    }

    // ── Step 5: Refund remaining to user ──────────────────────────────────────
    const remaining = await axUSDC.balanceOf(orchestrator.address);
    // Only refund the amount from this workflow (not pre-existing balance)
    const spent = priceFee + (conditionMet ? tradeFee : 0n);
    const refundable = budgetWei - spent;

    if (refundable > 0n) {
      const tx4 = await axUSDC.transfer(callerAddress, refundable, { gasLimit: 100000 });
      const r4 = await tx4.wait(1);
      payments.push({
        step: "Orchestrator → User: refund unspent",
        from: orchestrator.address, to: callerAddress,
        amount: `${ethers.formatUnits(refundable, 6)} axUSDC`,
        txHash: r4.hash, blockNumber: r4.blockNumber,
        explorerUrl: `${EXPLORER}/${r4.hash}`,
      });
    }

    return Response.json({
      status: "completed",
      symbol,
      currentPrice: price,
      priceSource,
      conditionMet,
      action,
      totalSpent: ethers.formatUnits(spent, 6),
      refunded: ethers.formatUnits(refundable, 6),
      payments,
      token: "axUSDC",
      tokenAddress: CONTRACTS.usdc,
      explorerBase: EXPLORER,
    }, { headers: CORS });
  } catch (err) {
    return Response.json({
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      payments, // return any payments that succeeded before the error
    }, { status: 500, headers: CORS });
  }
}

// ─── Node Registry Handlers ───────────────────────────────────────────────────

/** Verify Bearer sk_node_xxx token, return { nodeId, name } or null */
async function authNode(request: Request, env: Env): Promise<{ nodeId: string; name: string } | null> {
  const key = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!key?.startsWith("sk_node_")) return null;
  const raw = await env.AGENTX_KV.get(`node_key:${key}`);
  return raw ? JSON.parse(raw) : null;
}

/** POST /api/nodes/generate-key — create a new node API key */
async function handleNodeGenerateKey(request: Request, env: Env): Promise<Response> {
  let body: { name?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* ok */ }

  const apiKey = "sk_node_" + Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const nodeId = crypto.randomUUID();
  const name = body.name?.trim() || "unnamed";

  await env.AGENTX_KV.put(`node_key:${apiKey}`, JSON.stringify({
    nodeId,
    name,
    createdAt: Date.now(),
  }));

  return Response.json({ apiKey, nodeId, name }, { headers: CORS });
}

/** POST /api/nodes/connect — register node endpoint */
async function handleNodeConnect(request: Request, env: Env): Promise<Response> {
  const info = await authNode(request, env);
  if (!info) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  let body: { endpoint?: string; name?: string; model?: string; capabilities?: unknown; fee?: string; feeToken?: string; address?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* ok */ }

  if (!body.endpoint) {
    return Response.json({ error: "endpoint is required" }, { status: 400, headers: CORS });
  }

  await env.AGENTX_KV.put(`node_alive:${info.nodeId}`, JSON.stringify({
    nodeId: info.nodeId,
    endpoint: body.endpoint,
    name: body.name || info.name,
    model: body.model || "unknown",
    capabilities: body.capabilities || [],
    ...(body.fee ? { fee: body.fee, feeToken: body.feeToken || "OKB" } : {}),
    ...(body.address ? { address: body.address } : {}),
    lastSeen: Date.now(),
  }), { expirationTtl: 300 });

  return Response.json({ ok: true, nodeId: info.nodeId }, { headers: CORS });
}

/** POST /api/nodes/heartbeat — refresh node alive TTL */
async function handleNodeHeartbeat(request: Request, env: Env): Promise<Response> {
  const info = await authNode(request, env);
  if (!info) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const existing = await env.AGENTX_KV.get(`node_alive:${info.nodeId}`);
  if (!existing) {
    return Response.json({ error: "Node not registered. Call /api/nodes/connect first." }, { status: 404, headers: CORS });
  }

  const data = JSON.parse(existing);
  data.lastSeen = Date.now();

  await env.AGENTX_KV.put(`node_alive:${info.nodeId}`, JSON.stringify(data), { expirationTtl: 300 });

  return Response.json({ ok: true, nodeId: info.nodeId, lastSeen: data.lastSeen }, { headers: CORS });
}

// ─── Built-in Agent Registry (always live — derived from known NODE_PRIVATE_KEY) ─
// Addresses from CLAUDE.md (deterministic from current NODE_PRIVATE_KEY)
const BUILTIN_NODES = [
  {
    nodeId: "builtin-orchestrator",
    name: "orchestrator",
    endpoint: "https://agentx-worker.davirain-yin.workers.dev",
    model: "llama-3.3-70b-instruct",
    capabilities: ["workflow_orchestration", "a2a_payment"],
    address: "0xbE24E6aa9063a7d4885E84E2427Ec6aE31144Ee0",
    fee: "0.02",
    feeToken: "OKB",
    builtin: true,
  },
  {
    nodeId: "builtin-price-oracle",
    name: "price-oracle",
    endpoint: "https://agentx-worker.davirain-yin.workers.dev",
    model: "llama-3.3-70b-instruct",
    capabilities: ["price_oracle", "data_analysis"],
    address: "0x1DAaE012c914bb010D2bD5aF3a90d5b0D4cf0ff7",
    fee: "0.001",
    feeToken: "OKB",
    builtin: true,
  },
  {
    nodeId: "builtin-trade-strategy",
    name: "trade-strategy",
    endpoint: "https://agentx-worker.davirain-yin.workers.dev",
    model: "llama-3.3-70b-instruct",
    capabilities: ["trade_execution", "risk_management"],
    address: "0x21c89513dFd1f9639e7A4CF1ca518c971430a756",
    fee: "0.005",
    feeToken: "OKB",
    builtin: true,
  },
];

/** GET /api/nodes/active — built-in agents + live KV-registered nodes */
async function handleNodeActive(env: Env): Promise<Response> {
  // Always include the 3 built-in agents with current timestamp
  const results = BUILTIN_NODES.map(n => ({ ...n, lastSeen: Date.now() }));

  // Also include any externally-registered live nodes from KV
  try {
    const list = await env.AGENTX_KV.list({ prefix: "node_alive:" });
    const external = await Promise.all(
      list.keys.map(async (k) => {
        const raw = await env.AGENTX_KV.get(k.name);
        return raw ? JSON.parse(raw) : null;
      })
    );
    results.push(...external.filter(Boolean));
  } catch { /* KV unavailable — still return built-ins */ }

  return Response.json(results, { headers: CORS });
}

/** POST /api/hire — X402 agent hiring protocol
 *  No X-Payment-Proof header → 402 with payment details
 *  With X-Payment-Proof: <txHash> → 200 hired confirmation
 */
async function handleHireAgent(request: Request, env: Env): Promise<Response> {
  let body: { agentName?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* ok */ }

  const agentName = body.agentName?.trim();
  if (!agentName) {
    return Response.json({ error: "agentName required" }, { status: 400, headers: CORS });
  }

  const agent = BUILTIN_NODES.find(n => n.name === agentName);
  if (!agent) {
    return Response.json({ error: `Agent '${agentName}' not found` }, { status: 404, headers: CORS });
  }

  const paymentProof = request.headers.get("X-Payment-Proof");

  if (!paymentProof) {
    // X402 Payment Required — return payment details
    return Response.json({
      required: true,
      agentName,
      payment: {
        amount: agent.fee,
        token: agent.feeToken,
        to: agent.address,
        network: "xlayer-testnet",
        chainId: 195,
      },
      message: `Pay ${agent.fee} ${agent.feeToken} to hire ${agentName}`,
    }, { status: 402, headers: CORS });
  }

  // Payment proof provided — confirm hire (demo: trust txHash, no on-chain verify)
  return Response.json({
    hired: true,
    agentName,
    txHash: paymentProof,
    address: agent.address,
    hiredUntil: Date.now() + 86400000, // 24h
    message: `${agentName} hired successfully`,
  }, { headers: CORS });
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
