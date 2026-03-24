/**
 * Gradience Worker - Cloudflare Worker for AI Agent Execution
 * 
 * Features:
 * - Poll blockchain for new tasks
 * - Execute workflows with state management
 * - Handle human-in-the-loop approval
 * - Submit results to X Layer
 */

import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI } from "./config/contracts";
import { TaskExecutor } from "./executors/TaskExecutor";
import { StateManager } from "./services/StateManager";
import { isRetryableError } from "./utils/errors";
import { withContractRetry } from "./utils/retry";

export interface Env {
  // Blockchain config
  PRIVATE_KEY: string;
  XLAYER_RPC_URL: string;
  XLAYER_CHAIN_ID?: string;
  
  // External APIs
  COINGECKO_API_KEY?: string;
  XURL_API_KEY?: string;
  XURL_ENDPOINT?: string;
  
  // Cloudflare KV
  GRADIENCE_KV: KVNamespace;
  
  // Feature flags
  DEMO_MODE?: string; // "true" to enable auto-approval
}

// Track currently executing tasks to prevent duplicates
const executingTasks = new Set<string>();

/**
 * Main worker entry
 */
export default {
  /**
   * HTTP endpoint handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        timestamp: Date.now(),
        version: "0.1.0",
      });
    }
    
    // Get task status
    if (url.pathname.startsWith("/tasks/")) {
      const taskId = url.pathname.split("/")[2];
      return getTaskStatus(env, taskId);
    }
    
    // Trigger manual execution (for testing)
    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await request.json() as { taskId?: string; workflowHash?: string };
      
      if (!body.taskId || !body.workflowHash) {
        return Response.json(
          { error: "Missing taskId or workflowHash" },
          { status: 400 }
        );
      }
      
      ctx.waitUntil(executeTaskWithCleanup(env, body.taskId, body.workflowHash));
      
      return Response.json({
        status: "accepted",
        taskId: body.taskId,
        message: "Task execution started",
      });
    }
    
    // Cancel task
    if (url.pathname === "/cancel" && request.method === "POST") {
      const body = await request.json() as { taskId?: string };
      
      if (!body.taskId) {
        return Response.json({ error: "Missing taskId" }, { status: 400 });
      }
      
      const executor = new TaskExecutor(env);
      await executor.cancel(body.taskId);
      
      return Response.json({
        status: "cancelled",
        taskId: body.taskId,
      });
    }
    
    return new Response("Not found", { status: 404 });
  },

  /**
   * Scheduled task handler - Poll for new tasks
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("[Worker] Scheduled poll started");
    
    try {
      await pollAndExecute(env);
    } catch (error) {
      console.error("[Worker] Scheduled poll failed:", error);
    }
  },
};

/**
 * Get task status
 */
async function getTaskStatus(env: Env, taskId: string): Promise<Response> {
  try {
    const executor = new TaskExecutor(env);
    const state = await executor.getStatus(taskId);
    
    if (!state) {
      return Response.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    return Response.json({
      taskId: state.taskId,
      status: state.status,
      currentStepIndex: state.currentStepIndex,
      totalSteps: state.stepResults.length,
      stepResults: state.stepResults,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt,
      executionCount: state.executionCount,
    });
  } catch (error) {
    console.error(`[Worker] Failed to get task status: ${error}`);
    return Response.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Poll blockchain for pending tasks and execute
 */
async function pollAndExecute(env: Env): Promise<void> {
  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const taskManager = new ethers.Contract(
    CONTRACTS.taskManager,
    TASK_MANAGER_ABI,
    provider
  );

  try {
    // Query recent TaskCreated events
    const filter = taskManager.filters.TaskCreated();
    const currentBlock = await withContractRetry(() => provider.getBlockNumber());
    const fromBlock = Math.max(0, currentBlock - 100); // Last 100 blocks

    console.log(`[Worker] Polling blocks ${fromBlock} to ${currentBlock}`);

    const events = await withContractRetry(() =>
      taskManager.queryFilter(filter, fromBlock)
    );

    console.log(`[Worker] Found ${events.length} task events`);

    // Process tasks
    const pendingTasks: Array<{ taskId: string; workflowHash: string }> = [];

    for (const event of events) {
      if (!event.args) continue;

      const taskId = event.args[0].toString();
      const workflowHash = event.args[2];

      // Skip if already executing
      if (executingTasks.has(taskId)) {
        continue;
      }

      try {
        // Check task status
        const task = await withContractRetry(() =>
          taskManager.getTask(taskId)
        );

        // Status values: 0=Created, 1=PendingConfirmation, 2=Executing, 3=Completed, 4=Failed, 5=Cancelled, 6=Timeout
        if (task.status === 2) {
          // Executing status - we should process it
          pendingTasks.push({ taskId, workflowHash });
        }
      } catch (error) {
        console.error(`[Worker] Error checking task ${taskId}:`, error);
      }
    }

    console.log(`[Worker] ${pendingTasks.length} tasks ready for execution`);

    // Execute tasks (with concurrency limit)
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

    // Cleanup old completed tasks (run occasionally)
    if (Math.random() < 0.1) {
      // 10% chance
      const stateManager = new StateManager(env);
      const deleted = await stateManager.cleanupOldTasks(24); // Keep 24 hours
      console.log(`[Worker] Cleaned up ${deleted} old tasks`);
    }

  } catch (error) {
    console.error("[Worker] Poll and execute failed:", error);
    throw error;
  }
}

/**
 * Execute a single task with cleanup
 */
async function executeTaskWithCleanup(
  env: Env,
  taskId: string,
  workflowHash: string
): Promise<void> {
  // Prevent duplicate execution
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
    
    const duration = Date.now() - startTime;
    console.log(`[Worker] Task ${taskId} completed in ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Worker] Task ${taskId} failed after ${duration}ms:`, error);
    throw error;
    
  } finally {
    executingTasks.delete(taskId);
  }
}
