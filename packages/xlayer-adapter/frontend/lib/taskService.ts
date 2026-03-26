import { ethers } from 'ethers';
import { CONTRACTS, USDC_ABI, TASK_MANAGER_ABI } from './contracts';
import { WorkflowData, workflowStorage } from './workflowStorage';

export interface Task {
  id: number;
  requester: string;
  workflowHash: string;
  agentDIDs: string[];
  totalBudget: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class TaskService {
  private taskManager: ethers.Contract;
  private usdc: ethers.Contract;
  private signer: ethers.Signer;

  constructor(signer: ethers.Signer) {
    this.signer = signer;
    this.taskManager = new ethers.Contract(
      CONTRACTS.taskManager,
      TASK_MANAGER_ABI,
      signer
    );
    this.usdc = new ethers.Contract(CONTRACTS.usdc, USDC_ABI, signer);
  }

  /**
   * Create a new task from workflow
   */
  async createTask(workflow: WorkflowData, budget: string): Promise<number> {
    const address = await this.signer.getAddress();
    
    // 1. Save workflow locally (in production, this would go to IPFS)
    workflowStorage.saveToLocal(workflow);
    
    // 2. Generate workflow hash
    const workflowHash = workflowStorage.generateHash(workflow);
    
    // 3. Check and approve USDC
    const budgetWei = ethers.parseUnits(budget, 6);
    const currentAllowance = await this.usdc.allowance(
      address,
      CONTRACTS.taskManager
    );
    
    if (currentAllowance < budgetWei) {
      console.log('Approving USDC...');
      const approveTx = await this.usdc.approve(
        CONTRACTS.taskManager,
        budgetWei
      );
      await approveTx.wait();
      console.log('USDC approved');
    }
    
    // 4. Get agent DIDs from workflow steps
    const agentDIDs = workflow.steps.map(step => 
      ethers.keccak256(ethers.toUtf8Bytes(step.agentDID))
    );
    
    // 5. Create task
    console.log('Creating task...');
    const tx = await this.taskManager.createTask(
      workflowHash,
      agentDIDs,
      budgetWei
    );
    
    // 6. Wait for receipt and extract taskId
    const receipt = await tx.wait();
    console.log('Task created, receipt:', receipt);
    
    // Find TaskCreated event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.taskManager.interface.parseLog(log);
        return parsed?.name === 'TaskCreated';
      } catch {
        return false;
      }
    });
    
    if (!event) {
      throw new Error('TaskCreated event not found in receipt');
    }
    
    const parsedEvent = this.taskManager.interface.parseLog(event);
    const taskId = Number(parsedEvent?.args?.taskId);
    
    // 7. Save to local tracking
    this.saveTaskToLocal(taskId, workflow.id, workflowHash, budget);
    
    return taskId;
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: number): Promise<Task> {
    const task = await this.taskManager.getTask(taskId);
    return this.formatTask(task);
  }

  /**
   * Get all tasks for current user
   */
  async getUserTasks(): Promise<Task[]> {
    const address = await this.signer.getAddress();
    const taskIds = await this.taskManager.getRequesterTasks(address);
    
    const tasks = await Promise.all(
      taskIds.map((id: any) => 
        this.getTask(Number(id)).catch(err => {
          console.error(`Failed to get task ${id}:`, err);
          return null;
        })
      )
    );
    
    return tasks.filter((t): t is Task => t !== null);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: number): Promise<void> {
    const tx = await this.taskManager.cancelTask(taskId);
    await tx.wait();
  }

  /**
   * Format task data from contract
   */
  private formatTask(task: any): Task {
    const statusMap: Record<number, Task['status']> = {
      0: 'pending',
      1: 'executing',
      2: 'completed',
      3: 'failed',
      4: 'cancelled',
    };

    return {
      id: Number(task.id),
      requester: task.requester,
      workflowHash: task.workflowHash,
      agentDIDs: task.agentDIDs,
      totalBudget: ethers.formatUnits(task.totalBudget, 6),
      status: statusMap[Number(task.status)] || 'pending',
      currentStepIndex: Number(task.currentStepIndex),
      createdAt: Number(task.createdAt) * 1000,
      updatedAt: Number(task.updatedAt) * 1000,
      completedAt: task.completedAt > 0 ? Number(task.completedAt) * 1000 : undefined,
    };
  }

  /**
   * Save task to local tracking
   */
  private saveTaskToLocal(
    taskId: number,
    workflowId: string,
    workflowHash: string,
    budget: string
  ): void {
    if (typeof window === 'undefined') return;
    
    const tasks = JSON.parse(localStorage.getItem('agentx_tasks') || '[]');
    tasks.push({
      taskId,
      workflowId,
      workflowHash,
      budget,
      createdAt: Date.now(),
    });
    localStorage.setItem('agentx_tasks', JSON.stringify(tasks));
  }
}

export const createTaskService = (signer: ethers.Signer) => {
  return new TaskService(signer);
};
