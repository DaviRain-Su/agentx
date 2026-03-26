/**
 * State Manager - Track task execution state using Cloudflare KV
 * 
 * Features:
 * - Task state persistence
 * - Step execution tracking
 * - Idempotency (prevent duplicate execution)
 * - Execution history
 */

import { Env } from "../index";

export interface TaskState {
  taskId: string;
  workflowHash: string;
  status: "pending" | "executing" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  stepResults: StepResult[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  executionCount: number; // For idempotency
}

export interface StepResult {
  stepId: string;
  status: "pending" | "success" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ExecutionLog {
  taskId: string;
  events: ExecutionEvent[];
}

export interface ExecutionEvent {
  timestamp: number;
  type: "started" | "step_started" | "step_completed" | "human_approval_requested" | "human_approval_received" | "completed" | "failed" | "cancelled";
  data?: Record<string, unknown>;
}

export class StateManager {
  private kv: KVNamespace;
  private readonly TASK_PREFIX = "task:";
  private readonly LOG_PREFIX = "log:";
  private readonly LOCK_PREFIX = "lock:";
  private readonly LOCK_TTL = 300; // 5 minutes

  constructor(env: Env) {
    if (!env.AGENTX_KV) {
      throw new Error("AGENTX_KV binding not found");
    }
    this.kv = env.AGENTX_KV;
  }

  /**
   * Get task state
   */
  async getTaskState(taskId: string): Promise<TaskState | null> {
    const key = `${this.TASK_PREFIX}${taskId}`;
    const data = await this.kv.get(key);
    
    if (!data) {
      return null;
    }

    return JSON.parse(data) as TaskState;
  }

  /**
   * Save task state
   */
  async saveTaskState(state: TaskState): Promise<void> {
    const key = `${this.TASK_PREFIX}${state.taskId}`;
    state.updatedAt = Date.now();
    await this.kv.put(key, JSON.stringify(state));
  }

  /**
   * Create initial task state
   */
  async createTaskState(taskId: string, workflowHash: string): Promise<TaskState> {
    const existing = await this.getTaskState(taskId);
    
    if (existing) {
      // Task already exists, increment execution count
      existing.executionCount++;
      existing.status = "pending";
      existing.currentStepIndex = 0;
      existing.stepResults = [];
      existing.error = undefined;
      existing.completedAt = undefined;
      await this.saveTaskState(existing);
      return existing;
    }

    const state: TaskState = {
      taskId,
      workflowHash,
      status: "pending",
      currentStepIndex: 0,
      stepResults: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      executionCount: 1,
    };

    await this.saveTaskState(state);
    await this.logEvent(taskId, { type: "started", timestamp: Date.now() });
    
    return state;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskState["status"],
    error?: string
  ): Promise<void> {
    const state = await this.getTaskState(taskId);
    if (!state) {
      throw new Error(`Task ${taskId} not found`);
    }

    state.status = status;
    if (error) {
      state.error = error;
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      state.completedAt = Date.now();
    }

    await this.saveTaskState(state);
    
    // Log event
    await this.logEvent(taskId, {
      type: status === "completed" ? "completed" : status === "failed" ? "failed" : "cancelled",
      timestamp: Date.now(),
      data: error ? { error } : undefined,
    });
  }

  /**
   * Start step execution
   */
  async startStep(taskId: string, stepId: string): Promise<void> {
    const state = await this.getTaskState(taskId);
    if (!state) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Check if step already exists
    const existingStep = state.stepResults.find((s) => s.stepId === stepId);
    if (existingStep) {
      existingStep.status = "pending";
      existingStep.startedAt = Date.now();
      existingStep.error = undefined;
      existingStep.output = undefined;
      existingStep.completedAt = undefined;
    } else {
      state.stepResults.push({
        stepId,
        status: "pending",
        startedAt: Date.now(),
      });
    }

    await this.saveTaskState(state);
    await this.logEvent(taskId, {
      type: "step_started",
      timestamp: Date.now(),
      data: { stepId },
    });
  }

  /**
   * Complete step execution
   */
  async completeStep(
    taskId: string,
    stepId: string,
    success: boolean,
    output?: unknown,
    error?: string
  ): Promise<void> {
    const state = await this.getTaskState(taskId);
    if (!state) {
      throw new Error(`Task ${taskId} not found`);
    }

    const step = state.stepResults.find((s) => s.stepId === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in task ${taskId}`);
    }

    step.status = success ? "success" : "failed";
    step.output = output;
    step.error = error;
    step.completedAt = Date.now();

    if (success) {
      state.currentStepIndex++;
    }

    await this.saveTaskState(state);
    await this.logEvent(taskId, {
      type: "step_completed",
      timestamp: Date.now(),
      data: { stepId, success, error },
    });
  }

  /**
   * Log execution event
   */
  async logEvent(taskId: string, event: ExecutionEvent): Promise<void> {
    const key = `${this.LOG_PREFIX}${taskId}`;
    const existing = await this.kv.get(key);
    
    const log: ExecutionLog = existing
      ? JSON.parse(existing)
      : { taskId, events: [] };

    log.events.push(event);
    
    // Keep only last 100 events
    if (log.events.length > 100) {
      log.events = log.events.slice(-100);
    }

    await this.kv.put(key, JSON.stringify(log));
  }

  /**
   * Get execution log
   */
  async getExecutionLog(taskId: string): Promise<ExecutionLog | null> {
    const key = `${this.LOG_PREFIX}${taskId}`;
    const data = await this.kv.get(key);
    
    if (!data) {
      return null;
    }

    return JSON.parse(data) as ExecutionLog;
  }

  /**
   * Acquire execution lock (prevent concurrent execution)
   */
  async acquireLock(taskId: string): Promise<boolean> {
    const key = `${this.LOCK_PREFIX}${taskId}`;
    const existing = await this.kv.get(key);

    if (existing) {
      // Lock exists, check if expired
      const lockData = JSON.parse(existing);
      if (lockData.expiresAt > Date.now()) {
        return false; // Lock is still valid
      }
    }

    // Acquire lock
    const lockData = {
      acquiredAt: Date.now(),
      expiresAt: Date.now() + this.LOCK_TTL * 1000,
    };

    await this.kv.put(key, JSON.stringify(lockData), {
      expirationTtl: this.LOCK_TTL,
    });

    return true;
  }

  /**
   * Release execution lock
   */
  async releaseLock(taskId: string): Promise<void> {
    const key = `${this.LOCK_PREFIX}${taskId}`;
    await this.kv.delete(key);
  }

  /**
   * Check if task is already being executed
   */
  async isExecuting(taskId: string): Promise<boolean> {
    const state = await this.getTaskState(taskId);
    if (!state) {
      return false;
    }

    // Check lock
    const hasLock = await this.kv.get(`${this.LOCK_PREFIX}${taskId}`);
    
    return state.status === "executing" && hasLock !== null;
  }

  /**
   * Get all pending tasks
   */
  async getPendingTasks(): Promise<TaskState[]> {
    const tasks: TaskState[] = [];
    const list = await this.kv.list({ prefix: this.TASK_PREFIX });

    for (const key of list.keys) {
      const data = await this.kv.get(key.name);
      if (data) {
        const state = JSON.parse(data) as TaskState;
        if (state.status === "pending" || state.status === "executing") {
          tasks.push(state);
        }
      }
    }

    return tasks;
  }

  /**
   * Clean up old completed tasks
   */
  async cleanupOldTasks(maxAgeHours: number = 24): Promise<number> {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    let deleted = 0;

    const list = await this.kv.list({ prefix: this.TASK_PREFIX });

    for (const key of list.keys) {
      const data = await this.kv.get(key.name);
      if (data) {
        const state = JSON.parse(data) as TaskState;
        if (
          (state.status === "completed" || state.status === "failed" || state.status === "cancelled") &&
          state.completedAt &&
          state.completedAt < cutoff
        ) {
          await this.kv.delete(key.name);
          await this.kv.delete(`${this.LOG_PREFIX}${state.taskId}`);
          deleted++;
        }
      }
    }

    return deleted;
  }
}
