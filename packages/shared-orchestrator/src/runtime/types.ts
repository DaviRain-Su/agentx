/**
 * Runtime abstraction for decentralized Agent execution
 * Supports Cloudflare Workers, Node.js, Docker, and more
 */

export interface RuntimeConfig {
  maxMemoryMB: number;
  maxCpuMs?: number;
  timeoutMs: number;
  allowNetwork: boolean;
  allowedHosts?: string[];
}

export interface ExecutionContext {
  taskId: string;
  workflowId: string;
  nodeId: string;
  attempt: number;
  startTime: number;
  memorySnapshot?: MemorySnapshot;
}

export interface MemorySnapshot {
  used: number;
  peak: number;
  limit: number;
}

export interface HealthStatus {
  healthy: boolean;
  status: 'idle' | 'busy' | 'error';
  load: number; // 0-1
  lastError?: string;
}

export interface RuntimeMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  averageMemoryUsage: number;
}

export interface ExecutionResult<T = any> {
  status: 'success' | 'failed' | 'timeout' | 'memory_exceeded';
  output?: T;
  logs: LogEntry[];
  executionTime: number;
  memoryUsed: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  runtime: RuntimeType;
  entryPoint: string; // code or CID
  dependencies?: string[];
  env?: Record<string, string>;
}

export type RuntimeType = 
  | 'cloudflare-worker'
  | 'node'
  | 'deno'
  | 'docker'
  | 'wasm'
  | 'python';

export abstract class AgentRuntime {
  protected config: RuntimeConfig;
  protected metrics: RuntimeMetrics;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageMemoryUsage: 0,
    };
  }

  abstract initialize(): Promise<void>;
  abstract destroy(): Promise<void>;
  
  abstract executeAgent<T = any>(
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>>;
  
  abstract health(): Promise<HealthStatus>;
  abstract getMetrics(): RuntimeMetrics;

  protected updateMetrics(executionTime: number, memoryUsed: number, success: boolean): void {
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    
    // Rolling average
    const n = this.metrics.totalExecutions;
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (n - 1) + executionTime) / n;
    this.metrics.averageMemoryUsage = 
      (this.metrics.averageMemoryUsage * (n - 1) + memoryUsed) / n;
  }
}
