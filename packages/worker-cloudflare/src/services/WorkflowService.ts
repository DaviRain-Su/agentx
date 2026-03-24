/**
 * Workflow Service - Fetch and manage workflow definitions
 * 
 * Supports multiple storage backends:
 * - xurl (xurl.io) - Decentralized content addressing
 * - Arweave - Permanent storage
 * - IPFS - Distributed storage
 */

import { Workflow, WorkflowStep } from "@gradience/shared-orchestrator";
import { WorkflowError, ValidationError } from "../utils/errors";
import { withApiRetry } from "../utils/retry";

export interface WorkflowSource {
  type: "xurl" | "arweave" | "ipfs" | "inline";
  hash: string;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  executionMode: "sequential" | "parallel" | "conditional";
}

export interface WorkflowStepDefinition {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  dependsOn: string[];
  humanApproval?: boolean;
  timeout?: number;
}

export class WorkflowService {
  private xurlEndpoint: string;
  private arweaveEndpoint: string;
  private ipfsEndpoint: string;

  constructor(
    private env: { XURL_API_KEY?: string; XURL_ENDPOINT?: string }
  ) {
    this.xurlEndpoint = env.XURL_ENDPOINT || "https://api.xurl.io/v1";
    this.arweaveEndpoint = "https://arweave.net";
    this.ipfsEndpoint = "https://ipfs.io/ipfs";
  }

  /**
   * Fetch workflow by hash (auto-detect type)
   */
  async fetchWorkflow(hash: string): Promise<WorkflowDefinition> {
    // Try to detect hash type
    const source = this.detectSource(hash);
    
    switch (source.type) {
      case "xurl":
        return this.fetchFromXurl(hash);
      case "arweave":
        return this.fetchFromArweave(hash);
      case "ipfs":
        return this.fetchFromIPFS(hash);
      default:
        // Try inline JSON (for testing)
        try {
          return JSON.parse(hash);
        } catch {
          throw new WorkflowError(`Unsupported workflow hash format: ${hash}`);
        }
    }
  }

  /**
   * Detect storage type from hash format
   */
  private detectSource(hash: string): WorkflowSource {
    // Arweave: 43 chars, base64url
    if (/^[a-zA-Z0-9_-]{43}$/.test(hash)) {
      return { type: "arweave", hash };
    }
    
    // IPFS: Qm... (46 chars) or CIDv1
    if (hash.startsWith("Qm") || hash.startsWith("bafy")) {
      return { type: "ipfs", hash };
    }
    
    // xurl: xurl:// prefix or specific format
    if (hash.startsWith("xurl://") || hash.startsWith("gradience://")) {
      return { type: "xurl", hash: hash.replace(/^(xurl|gradience):\/\//, "") };
    }
    
    return { type: "inline", hash };
  }

  /**
   * Fetch from xurl.io
   */
  private async fetchFromXurl(hash: string): Promise<WorkflowDefinition> {
    return withApiRetry(async () => {
      const url = `${this.xurlEndpoint}/content/${hash}`;
      const headers: Record<string, string> = {};
      
      if (this.env.XURL_API_KEY) {
        headers["Authorization"] = `Bearer ${this.env.XURL_API_KEY}`;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new WorkflowError(
          `xurl fetch failed: ${response.status} ${response.statusText}`,
          response.status === 404 ? false : true
        );
      }

      const data = await response.json();
      return this.validateWorkflow(data);
    });
  }

  /**
   * Fetch from Arweave
   */
  private async fetchFromArweave(hash: string): Promise<WorkflowDefinition> {
    return withApiRetry(async () => {
      const url = `${this.arweaveEndpoint}/${hash}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new WorkflowError(
          `Arweave fetch failed: ${response.status}`,
          response.status !== 404
        );
      }

      const data = await response.json();
      return this.validateWorkflow(data);
    });
  }

  /**
   * Fetch from IPFS
   */
  private async fetchFromIPFS(hash: string): Promise<WorkflowDefinition> {
    return withApiRetry(async () => {
      const url = `${this.ipfsEndpoint}/${hash}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new WorkflowError(
          `IPFS fetch failed: ${response.status}`,
          response.status !== 404
        );
      }

      const data = await response.json();
      return this.validateWorkflow(data);
    });
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflow(data: unknown): WorkflowDefinition {
    if (!data || typeof data !== "object") {
      throw new ValidationError("Workflow must be an object");
    }

    const workflow = data as Partial<WorkflowDefinition>;

    // Required fields
    if (!workflow.name || typeof workflow.name !== "string") {
      throw new ValidationError("Workflow must have a name");
    }

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new ValidationError("Workflow must have at least one step");
    }

    const validModes = ["sequential", "parallel", "conditional"];
    if (!workflow.executionMode || !validModes.includes(workflow.executionMode)) {
      throw new ValidationError(`executionMode must be one of: ${validModes.join(", ")}`);
    }

    // Validate steps
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      this.validateStep(step, stepIds);
      stepIds.add(step.id);
    }

    // Validate dependencies exist
    for (const step of workflow.steps) {
      for (const depId of step.dependsOn || []) {
        if (!stepIds.has(depId)) {
          throw new ValidationError(`Step ${step.id} depends on unknown step: ${depId}`);
        }
      }
    }

    return workflow as WorkflowDefinition;
  }

  /**
   * Validate individual step
   */
  private validateStep(step: Partial<WorkflowStepDefinition>, existingIds: Set<string>): void {
    if (!step.id || typeof step.id !== "string") {
      throw new ValidationError("Step must have an id");
    }

    if (existingIds.has(step.id)) {
      throw new ValidationError(`Duplicate step id: ${step.id}`);
    }

    if (!step.agentId || typeof step.agentId !== "string") {
      throw new ValidationError(`Step ${step.id} must have an agentId`);
    }

    if (!step.config || typeof step.config !== "object") {
      throw new ValidationError(`Step ${step.id} must have a config object`);
    }

    // Validate timeout
    if (step.timeout !== undefined) {
      if (typeof step.timeout !== "number" || step.timeout < 0) {
        throw new ValidationError(`Step ${step.id} timeout must be a positive number`);
      }
    }

    // Ensure dependsOn is array
    if (step.dependsOn && !Array.isArray(step.dependsOn)) {
      throw new ValidationError(`Step ${step.id} dependsOn must be an array`);
    }
  }

  /**
   * Convert workflow definition to shared-orchestrator format
   */
  toSharedFormat(definition: WorkflowDefinition, workflowId: string): Workflow {
    return {
      id: workflowId,
      name: definition.name,
      description: definition.description,
      steps: definition.steps.map((step) => ({
        id: step.id,
        agentId: step.agentId,
        name: step.name,
        description: step.description,
        config: step.config,
        dependsOn: step.dependsOn || [],
        humanApproval: step.humanApproval,
        timeout: step.timeout || 300,
      })),
      executionMode: definition.executionMode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create a mock workflow for testing
   */
  static createMockWorkflow(): WorkflowDefinition {
    return {
      name: "Price Alert Trading",
      description: "Monitor price and execute trade when condition is met",
      executionMode: "sequential",
      steps: [
        {
          id: "step-1",
          agentId: "price-monitor",
          name: "Monitor ETH Price",
          description: "Get current ETH price from CoinGecko",
          config: { token: "ethereum", source: "coingecko" },
          dependsOn: [],
          humanApproval: false,
          timeout: 60,
        },
        {
          id: "step-2",
          agentId: "condition-eval",
          name: "Evaluate Condition",
          description: "Check if price meets condition",
          config: { condition: "price < 1800", operator: "<", threshold: 1800 },
          dependsOn: ["step-1"],
          humanApproval: true,
          timeout: 300,
        },
        {
          id: "step-3",
          agentId: "trade-executor",
          name: "Execute Trade",
          description: "Prepare trade transaction",
          config: { action: "buy", token: "ETH", amount: "0.1" },
          dependsOn: ["step-2"],
          humanApproval: true,
          timeout: 300,
        },
      ],
    };
  }
}
