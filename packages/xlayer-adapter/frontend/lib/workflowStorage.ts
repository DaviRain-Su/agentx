import { ethers } from 'ethers';

export interface WorkflowStep {
  id: string;
  name: string;
  agentDID: string;
  mode: 'sequential' | 'parallel' | 'conditional';
  config: Record<string, any>;
  dependsOn?: string[];
}

export interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  version: string;
  creator: string;
}

// IPFS Gateway (using public gateway for now)
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

export class WorkflowStorage {
  /**
   * Save workflow to local storage
   */
  saveToLocal(workflow: WorkflowData): void {
    const workflows = this.getAllLocal();
    workflows[workflow.id] = workflow;
    localStorage.setItem('agentx_workflows', JSON.stringify(workflows));
  }

  /**
   * Get all workflows from local storage
   */
  getAllLocal(): Record<string, WorkflowData> {
    if (typeof window === 'undefined') return {};
    const stored = localStorage.getItem('agentx_workflows');
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Get a single workflow by ID
   */
  getLocal(id: string): WorkflowData | null {
    const workflows = this.getAllLocal();
    return workflows[id] || null;
  }

  /**
   * Delete a workflow
   */
  deleteLocal(id: string): void {
    const workflows = this.getAllLocal();
    delete workflows[id];
    localStorage.setItem('agentx_workflows', JSON.stringify(workflows));
  }

  /**
   * Generate workflow hash (for blockchain)
   */
  generateHash(workflow: WorkflowData): string {
    const content = JSON.stringify({
      name: workflow.name,
      steps: workflow.steps,
      version: workflow.version,
    });
    return ethers.keccak256(ethers.toUtf8Bytes(content));
  }

  /**
   * Create a new workflow with defaults
   */
  createWorkflow(creator: string, name: string, description?: string): WorkflowData {
    return {
      id: `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0.0',
      creator,
    };
  }
}

export const workflowStorage = new WorkflowStorage();
