import { AgentRuntime, RuntimeConfig, ExecutionContext, ExecutionResult, AgentDefinition, HealthStatus, RuntimeMetrics, RuntimeType } from './types';
import { ethers } from 'ethers';

/**
 * Execution Node - represents a single node in the decentralized execution network
 * Can be a Cloudflare Worker, local PC, cloud server, or edge device
 */
export interface NodeConfig {
  nodeId: string;
  privateKey: string;
  endpoint: string;
  registryContract: string;
  provider: ethers.Provider;
  capabilities: NodeCapability;
}

export interface NodeCapability {
  runtime: RuntimeType;
  resources: {
    memory: number;
    cpu: number;
    gpu?: boolean;
    storage?: number;
  };
  agentTypes: string[];
  region: string;
  network: {
    latency: number;
    bandwidth: number;
  };
  pricing: {
    perExecution: string;
    perSecond: string;
  };
}

export interface Task {
  taskId: string;
  workflowId: string;
  agent: AgentDefinition;
  input: any;
  requirements: TaskRequirements;
  payment: {
    amount: string;
    token: string;
    escrowId: string;
  };
}

export interface TaskRequirements {
  agentType: string;
  minResources: {
    memory: number;
    cpu: number;
  };
  maxLatency: number;
  preferredRegions?: string[];
}

export class ExecutionNode {
  public readonly id: string;
  public readonly endpoint: string;
  private runtime: AgentRuntime;
  private config: NodeConfig;
  private registry: ethers.Contract;
  private signer: ethers.Signer;
  private activeTasks: Map<string, AbortController> = new Map();
  private isRunning = false;

  constructor(runtime: AgentRuntime, config: NodeConfig) {
    this.runtime = runtime;
    this.config = config;
    this.id = config.nodeId;
    this.endpoint = config.endpoint;
    
    // Initialize signer and contract
    this.signer = new ethers.Wallet(config.privateKey, config.provider);
    
    const registryAbi = [
      "function registerNode(string nodeId, string endpoint, bytes capabilities, bytes signature)",
      "function heartbeat(string nodeId)",
      "function acceptTask(string taskId)",
      "function submitResult(string taskId, bytes result, bytes proof)",
      "event TaskAssigned(string indexed taskId, string indexed nodeId, bytes32 agentType)",
    ];
    
    this.registry = new ethers.Contract(config.registryContract, registryAbi, this.signer);
  }

  /**
   * Initialize the node and register with the network
   */
  async initialize(): Promise<void> {
    await this.runtime.initialize();
    
    // Register with the network
    const capabilities = this.encodeCapabilities(this.config.capabilities);
    const signature = await this.signRegistration(this.config.nodeId, this.endpoint);
    
    const tx = await this.registry.registerNode(
      this.config.nodeId,
      this.config.endpoint,
      capabilities,
      signature
    );
    await tx.wait();
    
    this.isRunning = true;
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Start listening for tasks
    this.listenForTasks();
  }

  /**
   * Stop the node
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Cancel all active tasks
    for (const [taskId, controller] of this.activeTasks) {
      controller.abort();
      this.activeTasks.delete(taskId);
    }
    
    await this.runtime.destroy();
  }

  /**
   * Execute a task
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    const controller = new AbortController();
    this.activeTasks.set(task.taskId, controller);

    try {
      // Accept task on chain
      const acceptTx = await this.registry.acceptTask(task.taskId);
      await acceptTx.wait();

      // Create execution context
      const context: ExecutionContext = {
        taskId: task.taskId,
        workflowId: task.workflowId,
        nodeId: this.id,
        attempt: 1,
        startTime: Date.now(),
      };

      // Execute agent
      const result = await this.runtime.executeAgent(
        task.agent,
        task.input,
        context
      );

      // Submit result to chain
      const resultBytes = ethers.toUtf8Bytes(JSON.stringify(result));
      const proof = await this.generateProof(task, result);
      
      const submitTx = await this.registry.submitResult(
        task.taskId,
        resultBytes,
        proof
      );
      await submitTx.wait();

      return result;
    } catch (error: any) {
      // Submit failure result
      const errorResult: ExecutionResult = {
        status: 'failed',
        logs: [{ level: 'error', message: error.message, timestamp: Date.now() }],
        executionTime: 0,
        memoryUsed: 0,
        error: {
          code: error.code || 'EXECUTION_ERROR',
          message: error.message,
        },
      };

      const resultBytes = ethers.toUtf8Bytes(JSON.stringify(errorResult));
      await this.registry.submitResult(task.taskId, resultBytes, '0x');

      return errorResult;
    } finally {
      this.activeTasks.delete(task.taskId);
    }
  }

  /**
   * Get node health status
   */
  async health(): Promise<HealthStatus> {
    return this.runtime.health();
  }

  /**
   * Get node metrics
   */
  getMetrics(): RuntimeMetrics {
    return this.runtime.getMetrics();
  }

  /**
   * Handle incoming HTTP request (for Cloudflare Workers)
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/health':
        const health = await this.health();
        return new Response(JSON.stringify(health), {
          headers: { 'Content-Type': 'application/json' },
        });
        
      case '/metrics':
        const metrics = this.getMetrics();
        return new Response(JSON.stringify(metrics), {
          headers: { 'Content-Type': 'application/json' },
        });
        
      case '/execute':
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }
        
        const task = await request.json() as Task;
        const result = await this.executeTask(task);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
        
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async startHeartbeat(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.registry.heartbeat(this.config.nodeId);
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
      
      // Send heartbeat every 5 minutes
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
  }

  private listenForTasks(): void {
    // Listen for TaskAssigned events
    this.registry.on('TaskAssigned', (taskId: string, nodeId: string, agentType: string) => {
      if (nodeId === this.config.nodeId) {
        console.log(`Task ${taskId} assigned to this node`);
        // Task will be fetched and executed via executeTask
      }
    });
  }

  private encodeCapabilities(capabilities: NodeCapability): string {
    return ethers.toUtf8Bytes(JSON.stringify(capabilities));
  }

  private async signRegistration(nodeId: string, endpoint: string): Promise<string> {
    const message = ethers.keccak256(
      ethers.toUtf8Bytes(`${nodeId}:${endpoint}:${Date.now()}`)
    );
    return this.signer.signMessage(ethers.getBytes(message));
  }

  private async generateProof(task: Task, result: ExecutionResult): Promise<string> {
    // Simple proof: sign the task result hash
    const resultHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify({
        taskId: task.taskId,
        status: result.status,
        output: result.output,
        executionTime: result.executionTime,
      }))
    );
    
    return this.signer.signMessage(ethers.getBytes(resultHash));
  }
}
