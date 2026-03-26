/**
 * Human-in-the-Loop Service
 * 
 * Manages human approval workflow:
 * - Check if approval is needed
 * - Poll for approval status
 * - Handle timeout
 */

import { ethers } from "ethers";
import { Env } from "../index";
import { CONTRACTS, TASK_MANAGER_ABI } from "../config/contracts";
import { StateManager } from "./StateManager";
import { HumanLoopTimeoutError, WorkflowError } from "../utils/errors";
import { sleep } from "../utils/retry";

export interface HumanApprovalStatus {
  stepId: string;
  status: "pending" | "approved" | "rejected" | "timeout";
  confirmationId?: string;
  respondedAt?: number;
}

export class HumanLoopService {
  private taskManager: ethers.Contract;
  private provider: ethers.JsonRpcProvider;

  constructor(
    private env: Env,
    private stateManager: StateManager
  ) {
    this.provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
    // Use read-only provider for checking status
    this.taskManager = new ethers.Contract(
      CONTRACTS.taskManager,
      TASK_MANAGER_ABI,
      this.provider
    );
  }

  /**
   * Check if human approval is needed and wait for response
   * 
   * @param taskId - Task ID
   * @param stepId - Step ID
   * @param timeoutSeconds - Timeout in seconds (default: 300 = 5 minutes)
   * @returns true if approved, false if rejected or timeout
   */
  async waitForApproval(
    taskId: string,
    stepId: string,
    timeoutSeconds: number = 300
  ): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    console.log(`[HumanLoop] Waiting for approval: task=${taskId}, step=${stepId}, timeout=${timeoutSeconds}s`);

    // Log the approval request
    await this.stateManager.logEvent(taskId, {
      type: "human_approval_requested",
      timestamp: startTime,
      data: { stepId, timeoutSeconds },
    });

    // Poll for approval status
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.checkApprovalStatus(taskId, stepId);

        if (status.status === "approved") {
          console.log(`[HumanLoop] Approved: task=${taskId}, step=${stepId}`);
          await this.stateManager.logEvent(taskId, {
            type: "human_approval_received",
            timestamp: Date.now(),
            data: { stepId, approved: true },
          });
          return true;
        }

        if (status.status === "rejected") {
          console.log(`[HumanLoop] Rejected: task=${taskId}, step=${stepId}`);
          await this.stateManager.logEvent(taskId, {
            type: "human_approval_received",
            timestamp: Date.now(),
            data: { stepId, approved: false },
          });
          return false;
        }

        if (status.status === "timeout") {
          console.log(`[HumanLoop] Timeout: task=${taskId}, step=${stepId}`);
          throw new HumanLoopTimeoutError(stepId);
        }

        // Still pending, wait before next check
        await sleep(5000); // Check every 5 seconds

      } catch (error) {
        // If it's already a HumanLoopTimeoutError, re-throw
        if (error instanceof HumanLoopTimeoutError) {
          throw error;
        }

        // Log error but continue polling
        console.error(`[HumanLoop] Error checking status: ${error}`);
        await sleep(5000);
      }
    }

    // Timeout reached
    throw new HumanLoopTimeoutError(stepId);
  }

  /**
   * Check current approval status from blockchain
   */
  private async checkApprovalStatus(
    taskId: string,
    stepId: string
  ): Promise<HumanApprovalStatus> {
    // Method 1: Check TaskManager confirmation status
    try {
      // Get task details
      const task = await this.taskManager.getTask(taskId);

      // If task is no longer in PendingConfirmation status, check the result
      if (task.status !== 1) { // 1 = PendingConfirmation
        // Check step results to see if we have a confirmation response
        const stepResults = await this.taskManager.getStepResults(taskId);
        
        for (const result of stepResults) {
          if (result.stepId === ethers.keccak256(ethers.toUtf8Bytes(stepId))) {
            // If step is marked as failed, it might be a rejection
            if (result.status === 2) { // 2 = Failed
              // Check error message for rejection
              if (result.error && result.error.toLowerCase().includes("reject")) {
                return { stepId, status: "rejected" };
              }
            }
            
            // If task is executing or completed after pending, consider it approved
            if (task.status === 2 || task.status === 3) { // 2 = Executing, 3 = Completed
              return { stepId, status: "approved" };
            }
          }
        }
      }

      // Still pending
      return { stepId, status: "pending" };

    } catch (error) {
      console.error(`[HumanLoop] Contract call failed: ${error}`);
      
      // Method 2: Fallback to state manager
      return this.checkLocalStatus(taskId, stepId);
    }
  }

  /**
   * Check local state for approval status via KV store.
   * Set by the Worker's POST /tasks/:id/confirm endpoint.
   */
  private async checkLocalStatus(
    taskId: string,
    stepId: string
  ): Promise<HumanApprovalStatus> {
    try {
      const raw = await this.env.AGENTX_KV.get(`human_approval:${taskId}`);
      if (!raw) return { stepId, status: "pending" };
      const approval = JSON.parse(raw) as { approved: boolean; ts: number };
      // Clean up after reading
      await this.env.AGENTX_KV.delete(`human_approval:${taskId}`);
      return { stepId, status: approval.approved ? "approved" : "rejected" };
    } catch {
      return { stepId, status: "pending" };
    }
  }

  /**
   * Request human approval on-chain
   * 
   * This would be called when a step requires approval
   */
  async requestApproval(
    taskId: string,
    stepId: string,
    title: string,
    description: string
  ): Promise<string> {
    // In production, this would call TaskManager.requestConfirmation
    // But for now, we assume the approval is requested during step execution
    
    console.log(`[HumanLoop] Approval request created: ${title}`);
    
    // Return a mock confirmation ID
    return ethers.keccak256(
      ethers.toUtf8Bytes(`${taskId}-${stepId}-${Date.now()}`)
    );
  }

  /**
   * Auto-approve for testing/demo mode
   */
  async autoApprove(
    taskId: string,
    stepId: string,
    approve: boolean = true
  ): Promise<boolean> {
    console.log(`[HumanLoop] Auto-${approve ? "approving" : "rejecting"}: task=${taskId}, step=${stepId}`);
    
    await this.stateManager.logEvent(taskId, {
      type: "human_approval_received",
      timestamp: Date.now(),
      data: { stepId, approved: approve, auto: true },
    });

    return approve;
  }

  /**
   * Check if step requires human approval
   */
  requiresApproval(stepConfig: { humanApproval?: boolean }): boolean {
    return stepConfig.humanApproval === true;
  }
}

/**
 * Mock Human Loop Service for testing
 * Auto-approves all requests after a delay
 */
export class MockHumanLoopService extends HumanLoopService {
  private autoApproveDelay: number;

  constructor(
    env: Env,
    stateManager: StateManager,
    options: { autoApprove?: boolean; delayMs?: number } = {}
  ) {
    super(env, stateManager);
    this.autoApproveDelay = options.delayMs || 1000;
  }

  async waitForApproval(
    taskId: string,
    stepId: string,
    timeoutSeconds: number = 300
  ): Promise<boolean> {
    console.log(`[MockHumanLoop] Auto-approving after ${this.autoApproveDelay}ms: task=${taskId}, step=${stepId}`);
    
    await sleep(this.autoApproveDelay);
    
    return this.autoApprove(taskId, stepId, true);
  }
}
