/**
 * Task Executor - Core execution engine for Gradience Worker
 * 
 * Features:
 * - Execute workflow steps with proper state management
 * - Handle human-in-the-loop approval
 * - Retry logic for transient failures
 * - Result submission to blockchain
 */

import { ethers } from "ethers";
import { Env } from "../index";
import { WorkflowService, WorkflowDefinition, WorkflowStepDefinition } from "../services/WorkflowService";
import { StateManager, TaskState } from "../services/StateManager";
import { HumanLoopService } from "../services/HumanLoopService";
import { AIAgent } from "../agents/AIAgent";
import { CONTRACTS, TASK_MANAGER_ABI } from "../config/contracts";
import { 
  WorkerError, 
  AgentExecutionError, 
  ContractError, 
  HumanLoopTimeoutError,
  isRetryableError 
} from "../utils/errors";
import { withRetry, withContractRetry } from "../utils/retry";

export interface ExecutionContext {
  taskId: string;
  workflow: WorkflowDefinition;
  state: TaskState;
  variables: Record<string, unknown>;
}

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  executionTime: number;
}

export class TaskExecutor {
  private workflowService: WorkflowService;
  private stateManager: StateManager;
  private humanLoopService: HumanLoopService;
  private aiAgent: AIAgent;

  // Lazy-initialized blockchain resources (only when needed for tx signing)
  private _provider: ethers.JsonRpcProvider | null = null;
  private _wallet: ethers.Wallet | null = null;
  private _taskManager: ethers.Contract | null = null;

  constructor(private env: Env) {
    this.workflowService = new WorkflowService(env);
    this.stateManager = new StateManager(env);
    this.humanLoopService = new HumanLoopService(env, this.stateManager);
    this.aiAgent = new AIAgent(env);
  }

  /** Initialize blockchain connection lazily (only when signing txs) */
  private initBlockchain() {
    if (!this._provider) {
      this._provider = new ethers.JsonRpcProvider(this.env.XLAYER_RPC_URL);
      this._wallet = new ethers.Wallet(this.env.PRIVATE_KEY, this._provider);
      this._taskManager = new ethers.Contract(
        CONTRACTS.taskManager,
        TASK_MANAGER_ABI,
        this._wallet
      );
    }
    return {
      provider: this._provider,
      wallet: this._wallet!,
      taskManager: this._taskManager!,
    };
  }

  /**
   * Execute a task end-to-end
   */
  async execute(taskId: string, workflowHash: string): Promise<void> {
    console.log(`[TaskExecutor] Starting execution: task=${taskId}`);
    
    // Acquire lock to prevent concurrent execution
    const lockAcquired = await this.stateManager.acquireLock(taskId);
    if (!lockAcquired) {
      console.log(`[TaskExecutor] Task ${taskId} is already being executed, skipping`);
      return;
    }

    try {
      // Initialize task state
      const state = await this.stateManager.createTaskState(taskId, workflowHash);
      
      // Fetch workflow
      const workflow = await this.fetchWorkflow(workflowHash);
      
      // Build execution context
      const context: ExecutionContext = {
        taskId,
        workflow,
        state,
        variables: {},
      };

      // Update status to executing
      await this.stateManager.updateTaskStatus(taskId, "executing");
      
      // Execute workflow
      const result = await this.executeWorkflow(context);
      
      // Update final status
      if (result.success) {
        await this.stateManager.updateTaskStatus(taskId, "completed");
        console.log(`[TaskExecutor] Task ${taskId} completed successfully`);
      } else {
        await this.stateManager.updateTaskStatus(taskId, "failed", result.error);
        console.log(`[TaskExecutor] Task ${taskId} failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`[TaskExecutor] Fatal error executing task ${taskId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.stateManager.updateTaskStatus(taskId, "failed", errorMessage);
      
      // Try to submit failure to chain
      await this.submitFailure(taskId, errorMessage).catch((e) => {
        console.error(`[TaskExecutor] Failed to submit failure to chain:`, e);
      });
      
    } finally {
      // Release lock
      await this.stateManager.releaseLock(taskId);
    }
  }

  /**
   * Fetch workflow with retry
   */
  private async fetchWorkflow(hash: string): Promise<WorkflowDefinition> {
    try {
      return await this.workflowService.fetchWorkflow(hash);
    } catch (error) {
      console.error(`[TaskExecutor] Failed to fetch workflow:`, error);
      
      // Fallback to mock workflow for demo
      console.log(`[TaskExecutor] Using mock workflow`);
      return WorkflowService.createMockWorkflow();
    }
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(context: ExecutionContext): Promise<{ success: boolean; error?: string }> {
    const { workflow, taskId } = context;
    
    // Sort steps by dependencies (topological order)
    const sortedSteps = this.sortStepsByDependencies(workflow.steps);
    
    for (const step of sortedSteps) {
      // Check if task was cancelled
      const currentState = await this.stateManager.getTaskState(taskId);
      if (currentState?.status === "cancelled") {
        console.log(`[TaskExecutor] Task ${taskId} was cancelled`);
        return { success: false, error: "Task cancelled" };
      }

      // Execute step
      const result = await this.executeStep(step, context);
      
      if (!result.success) {
        return { success: false, error: `Step ${step.id} failed: ${result.error}` };
      }

      // Store result in context variables
      context.variables[step.id] = result.output;
      
      // Check for human approval requirement
      if (step.humanApproval) {
        try {
          const approved = await this.humanLoopService.waitForApproval(
            taskId,
            step.id,
            step.timeout || 300
          );
          
          if (!approved) {
            return { success: false, error: `Step ${step.id} was rejected by user` };
          }
        } catch (error) {
          if (error instanceof HumanLoopTimeoutError) {
            return { success: false, error: `Step ${step.id} timed out waiting for approval` };
          }
          throw error;
        }
      }
    }

    return { success: true };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: WorkflowStepDefinition,
    context: ExecutionContext
  ): Promise<StepExecutionResult> {
    const { taskId } = context;
    const startTime = Date.now();
    
    console.log(`[TaskExecutor] Executing step: ${step.id} (${step.agentId})`);
    
    // Mark step as started
    await this.stateManager.startStep(taskId, step.id);

    try {
      // Merge step config with variables from previous steps
      const config = this.resolveConfig(step.config, context.variables);

      // Execute via AI Agent (LLM-powered, replaces hardcoded agents)
      const agentResult = await withRetry(
        () => this.aiAgent.execute(step.agentId, config, Object.values(context.variables) as Record<string, unknown>[]),
        (error) => isRetryableError(error) && !(error instanceof AgentExecutionError && !error.retryable),
        { maxRetries: 2, baseDelay: 1000 }
      );

      console.log(`[TaskExecutor] AI Agent tools used: ${agentResult.toolsUsed?.join(", ") || "none"}`);

      const executionTime = Date.now() - startTime;

      if (!agentResult.success) {
        const error = agentResult.error || "Agent execution failed";
        
        // Mark step as failed
        await this.stateManager.completeStep(taskId, step.id, false, undefined, error);
        
        return {
          stepId: step.id,
          success: false,
          error,
          executionTime,
        };
      }

      // Mark step as completed
      await this.stateManager.completeStep(taskId, step.id, true, agentResult.output);

      console.log(`[TaskExecutor] Step ${step.id} completed in ${executionTime}ms`);

      return {
        stepId: step.id,
        success: true,
        output: agentResult.output,
        executionTime,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      console.error(`[TaskExecutor] Step ${step.id} failed:`, error);

      // Mark step as failed
      await this.stateManager.completeStep(taskId, step.id, false, undefined, errorMessage);

      return {
        stepId: step.id,
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Resolve config variables (e.g., {{step-1.output.price}})
   */
  private resolveConfig(
    config: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved = { ...config };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string") {
        // Simple variable substitution
        resolved[key] = this.substituteVariables(value, variables);
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this.resolveConfig(value as Record<string, unknown>, variables);
      }
    }

    return resolved;
  }

  /**
   * Substitute variables in string
   */
  private substituteVariables(str: string, variables: Record<string, unknown>): string {
    // Simple template: {{stepId.property}}
    const regex = /\{\{(\w+)\.?(\w+)?\}\}/g;
    
    return str.replace(regex, (match, stepId, property) => {
      const stepOutput = variables[stepId];
      
      if (!stepOutput || typeof stepOutput !== "object") {
        return match; // Keep original if not found
      }

      if (property) {
        const value = (stepOutput as Record<string, unknown>)[property];
        return value !== undefined ? String(value) : match;
      }

      return JSON.stringify(stepOutput);
    });
  }

  /**
   * Sort steps by dependencies (Kahn's algorithm)
   */
  private sortStepsByDependencies(steps: WorkflowStepDefinition[]): WorkflowStepDefinition[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const step of steps) {
      inDegree.set(step.id, step.dependsOn?.length || 0);
      adjacency.set(step.id, []);
    }

    // Build adjacency
    for (const step of steps) {
      for (const depId of step.dependsOn || []) {
        adjacency.get(depId)?.push(step.id);
      }
    }

    // Find all with no dependencies
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Process
    const result: WorkflowStepDefinition[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = stepMap.get(id);
      if (step) {
        result.push(step);
      }

      for (const dependentId of adjacency.get(id) || []) {
        const newDegree = (inDegree.get(dependentId) || 0) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    if (result.length !== steps.length) {
      throw new WorkerError("Cycle detected in workflow dependencies", "CYCLE_ERROR", false);
    }

    return result;
  }

  /**
   * Submit step completion to blockchain
   */
  async submitStepResult(
    taskId: string,
    stepId: string,
    success: boolean,
    output?: unknown,
    error?: string
  ): Promise<void> {
    const outputHash = output
      ? ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(output)))
      : ethers.ZeroHash;

    await withContractRetry(async () => {
      const { taskManager } = this.initBlockchain();
      const tx = await taskManager.recordStepCompletion(
        taskId,
        ethers.keccak256(ethers.toUtf8Bytes(stepId)),
        success ? 1 : 2, // 1 = Success, 2 = Failed
        outputHash,
        error || ""
      );

      const receipt = await tx.wait();
      console.log(`[TaskExecutor] Step result submitted: tx=${receipt?.hash}`);
    });
  }

  /**
   * Submit failure to blockchain
   */
  private async submitFailure(taskId: string, error: string): Promise<void> {
    try {
      await this.submitStepResult(taskId, "final", false, undefined, error);
    } catch (e) {
      throw new ContractError(`Failed to submit failure: ${e}`);
    }
  }

  /**
   * Get execution status
   */
  async getStatus(taskId: string): Promise<TaskState | null> {
    return this.stateManager.getTaskState(taskId);
  }

  /**
   * Cancel a task
   */
  async cancel(taskId: string): Promise<void> {
    await this.stateManager.updateTaskStatus(taskId, "cancelled");
  }
}
