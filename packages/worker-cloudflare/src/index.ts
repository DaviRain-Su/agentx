/**
 * Gradience Worker - Cloudflare Worker for AI Agent Execution
 *
 * Features:
 * - Poll blockchain for new tasks
 * - Execute workflows with AI agents
 * - Handle human-in-the-loop approval
 * - Persistent agent sessions via Durable Objects
 * - On-chain access control for agent API
 */

import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI } from "./config/contracts";
import { TaskExecutor } from "./executors/TaskExecutor";
import { StateManager } from "./services/StateManager";
import { withContractRetry } from "./utils/retry";
import { AgentSession } from "./agents/AgentSession";

// Re-export Durable Object so Wrangler can bind it
export { AgentSession };

export interface Env {
  // Blockchain config
  PRIVATE_KEY: string;
  XLAYER_RPC_URL: string;
  XLAYER_CHAIN_ID?: string;

  // External APIs
  COINGECKO_API_KEY?: string;

  // Cloudflare KV (state + session tokens)
  GRADIENCE_KV: KVNamespace;

  // Cloudflare Workers AI
  AI: Ai;

  // Durable Objects for agent sessions
  AGENT_SESSIONS: DurableObjectNamespace;

  // Feature flags
  DEMO_MODE?: string;
}

// Track currently executing tasks to prevent duplicates
const executingTasks = new Set<string>();

// CORS headers for agent API
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── Existing endpoints ───────────────────────────────────────────────────

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: Date.now(), version: "0.2.0" }, { headers: CORS });
    }

    if (url.pathname.startsWith("/tasks/")) {
      const taskId = url.pathname.split("/")[2];
      return getTaskStatus(env, taskId);
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const body = (await request.json()) as { taskId?: string; workflowHash?: string };
      if (!body.taskId || !body.workflowHash) {
        return Response.json({ error: "Missing taskId or workflowHash" }, { status: 400, headers: CORS });
      }
      ctx.waitUntil(executeTaskWithCleanup(env, body.taskId, body.workflowHash));
      return Response.json({ status: "accepted", taskId: body.taskId }, { headers: CORS });
    }

    if (url.pathname === "/cancel" && request.method === "POST") {
      const body = (await request.json()) as { taskId?: string };
      if (!body.taskId) {
        return Response.json({ error: "Missing taskId" }, { status: 400, headers: CORS });
      }
      const executor = new TaskExecutor(env);
      await executor.cancel(body.taskId);
      return Response.json({ status: "cancelled", taskId: body.taskId }, { headers: CORS });
    }

    // ── Agent API ────────────────────────────────────────────────────────────

    // POST /agent/auth — Verify Gradience task ownership → issue session token
    if (url.pathname === "/agent/auth" && request.method === "POST") {
      return handleAgentAuth(request, env);
    }

    // GET /agent/ws/:sessionId — WebSocket to persistent agent session
    if (url.pathname.startsWith("/agent/ws/")) {
      const sessionId = url.pathname.split("/")[3];
      return handleAgentWebSocket(request, env, sessionId);
    }

    // POST /agent/chat/:sessionId — HTTP chat (fallback)
    if (url.pathname.startsWith("/agent/chat/") && request.method === "POST") {
      const sessionId = url.pathname.split("/")[3];
      return handleAgentChat(request, env, sessionId);
    }

    // GET /agent/history/:sessionId — Fetch message history
    if (url.pathname.startsWith("/agent/history/") && request.method === "GET") {
      const sessionId = url.pathname.split("/")[3];
      return handleAgentProxy(request, env, sessionId, "/history");
    }

    // POST /agent/clear/:sessionId — Clear history
    if (url.pathname.startsWith("/agent/clear/") && request.method === "POST") {
      const sessionId = url.pathname.split("/")[3];
      return handleAgentProxy(request, env, sessionId, "/clear");
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    console.log("[Worker] Scheduled poll started");
    try {
      await pollAndExecute(env);
    } catch (error) {
      console.error("[Worker] Scheduled poll failed:", error);
    }
  },
};

// ─── Agent Auth ───────────────────────────────────────────────────────────────

/**
 * Verify the caller owns an active Gradience task, then issue a session token.
 *
 * Body: { taskId: string, address: string, signature: string }
 * Signature message: "Gradience Agent Access: {taskId}"
 */
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

  // 1. Verify the wallet signature
  const message = `Gradience Agent Access: ${taskId}`;
  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401, headers: CORS });
  }

  if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: "Signature does not match address" }, { status: 401, headers: CORS });
  }

  // 2. Verify on-chain: address must be the task requester and task must be active
  try {
    const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
    const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, provider);
    const task = await taskManager.getTask(taskId);

    if (task.requester.toLowerCase() !== address.toLowerCase()) {
      return Response.json({ error: "Address is not the task requester" }, { status: 403, headers: CORS });
    }

    // Status 4 = Failed, 5 = Cancelled — reject those
    const status = Number(task.status);
    if (status === 4 || status === 5) {
      return Response.json({ error: "Task is no longer active (failed or cancelled)" }, { status: 403, headers: CORS });
    }
  } catch (err) {
    console.error("[Agent Auth] On-chain verification failed:", err);
    return Response.json({ error: "Could not verify task on-chain" }, { status: 403, headers: CORS });
  }

  // 3. Issue a 24-hour session token
  const sessionId = crypto.randomUUID();
  await env.GRADIENCE_KV.put(
    `agent_session:${sessionId}`,
    JSON.stringify({ taskId, address, createdAt: Date.now() }),
    { expirationTtl: 86400 }
  );

  // 4. Initialize the Durable Object with session metadata
  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);
  // Pre-warm the DO by calling info (this ensures tables are created)
  await stub.fetch(new Request("https://do/info")).catch(() => {});

  return Response.json(
    { sessionId, expiresIn: 86400, taskId, address },
    { headers: CORS }
  );
}

// ─── Agent Session Proxy ──────────────────────────────────────────────────────

async function verifySession(env: Env, sessionId: string): Promise<boolean> {
  const session = await env.GRADIENCE_KV.get(`agent_session:${sessionId}`);
  return session !== null;
}

async function handleAgentWebSocket(
  request: Request,
  env: Env,
  sessionId: string
): Promise<Response> {
  if (!(await verifySession(env, sessionId))) {
    return new Response("Unauthorized: invalid or expired session", { status: 401 });
  }

  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);

  // Forward the WebSocket upgrade to the Durable Object
  const doUrl = new URL("/ws", "https://agent-session");
  return stub.fetch(new Request(doUrl.toString(), request));
}

async function handleAgentChat(
  request: Request,
  env: Env,
  sessionId: string
): Promise<Response> {
  if (!(await verifySession(env, sessionId))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);

  const doUrl = new URL("/chat", "https://agent-session");
  const response = await stub.fetch(new Request(doUrl.toString(), request));
  return addCors(response);
}

async function handleAgentProxy(
  request: Request,
  env: Env,
  sessionId: string,
  path: string
): Promise<Response> {
  if (!(await verifySession(env, sessionId))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const doId = env.AGENT_SESSIONS.idFromName(sessionId);
  const stub = env.AGENT_SESSIONS.get(doId);

  const doUrl = new URL(path, "https://agent-session");
  const response = await stub.fetch(new Request(doUrl.toString(), { method: request.method }));
  return addCors(response);
}

function addCors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

// ─── Task Execution (unchanged) ───────────────────────────────────────────────

async function getTaskStatus(env: Env, taskId: string): Promise<Response> {
  try {
    const executor = new TaskExecutor(env);
    const state = await executor.getStatus(taskId);

    if (!state) {
      return Response.json({ error: "Task not found" }, { status: 404, headers: CORS });
    }

    return Response.json(
      {
        taskId: state.taskId,
        status: state.status,
        currentStepIndex: state.currentStepIndex,
        totalSteps: state.stepResults.length,
        stepResults: state.stepResults,
        startedAt: state.startedAt,
        updatedAt: state.updatedAt,
        completedAt: state.completedAt,
        executionCount: state.executionCount,
      },
      { headers: CORS }
    );
  } catch (error) {
    console.error(`[Worker] Failed to get task status: ${error}`);
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}

async function pollAndExecute(env: Env): Promise<void> {
  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, provider);

  try {
    const filter = taskManager.filters.TaskCreated();
    const currentBlock = await withContractRetry(() => provider.getBlockNumber());
    const fromBlock = Math.max(0, currentBlock - 100);

    console.log(`[Worker] Polling blocks ${fromBlock} to ${currentBlock}`);

    const events = await withContractRetry(() => taskManager.queryFilter(filter, fromBlock));
    console.log(`[Worker] Found ${events.length} task events`);

    const pendingTasks: Array<{ taskId: string; workflowHash: string }> = [];

    for (const event of events) {
      if (!event.args) continue;

      const taskId = event.args[0].toString();
      const workflowHash = event.args[2];

      if (executingTasks.has(taskId)) continue;

      try {
        const task = await withContractRetry(() => taskManager.getTask(taskId));
        if (task.status === 2) {
          pendingTasks.push({ taskId, workflowHash });
        }
      } catch (error) {
        console.error(`[Worker] Error checking task ${taskId}:`, error);
      }
    }

    console.log(`[Worker] ${pendingTasks.length} tasks ready for execution`);

    const CONCURRENCY_LIMIT = 3;
    for (let i = 0; i < pendingTasks.length; i += CONCURRENCY_LIMIT) {
      const batch = pendingTasks.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(
        batch.map(({ taskId, workflowHash }) =>
          executeTaskWithCleanup(env, taskId, workflowHash).catch((error) => {
            console.error(`[Worker] Task ${taskId} execution failed:`, error);
          })
        )
      );
    }

    // Cleanup old completed tasks occasionally
    if (Math.random() < 0.1) {
      const stateManager = new StateManager(env);
      const deleted = await stateManager.cleanupOldTasks(24);
      console.log(`[Worker] Cleaned up ${deleted} old tasks`);
    }
  } catch (error) {
    console.error("[Worker] Poll and execute failed:", error);
    throw error;
  }
}

async function executeTaskWithCleanup(
  env: Env,
  taskId: string,
  workflowHash: string
): Promise<void> {
  if (executingTasks.has(taskId)) {
    console.log(`[Worker] Task ${taskId} is already being executed`);
    return;
  }

  executingTasks.add(taskId);
  console.log(`[Worker] Starting task execution: ${taskId}`);
  const startTime = Date.now();

  try {
    const executor = new TaskExecutor(env);
    await executor.execute(taskId, workflowHash);
    console.log(`[Worker] Task ${taskId} completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error(`[Worker] Task ${taskId} failed after ${Date.now() - startTime}ms:`, error);
    throw error;
  } finally {
    executingTasks.delete(taskId);
  }
}
