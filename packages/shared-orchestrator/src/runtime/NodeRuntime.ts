import { Worker } from 'worker_threads';
import * as vm from 'vm';
import { AgentRuntime, RuntimeConfig, ExecutionContext, ExecutionResult, AgentDefinition, HealthStatus } from './types';

/**
 * Node.js Runtime Implementation
 * Executes agents using Worker Threads for isolation
 * Suitable for local development and self-hosted nodes
 */
export class NodeRuntime extends AgentRuntime {
  private workerPool: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private initialized = false;

  async initialize(): Promise<void> {
    // Initialize worker pool
    const poolSize = Math.min(4, require('os').cpus().length);
    
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(this.createWorkerScript());
      this.workerPool.push(worker);
    }
    
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workerPool.map(w => w.terminate()));
    this.workerPool = [];
    this.busyWorkers.clear();
    this.initialized = false;
  }

  async executeAgent<T = any>(
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>> {
    if (!this.initialized) {
      throw new Error('Runtime not initialized');
    }

    const startTime = Date.now();
    const worker = await this.acquireWorker();
    
    try {
      const result = await this.executeInWorker(worker, agent, input, context);
      
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, result.memoryUsed || 0, true);
      
      this.releaseWorker(worker);
      
      return {
        status: 'success',
        output: result.output,
        logs: result.logs || [],
        executionTime,
        memoryUsed: result.memoryUsed || 0,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, 0, false);
      
      this.releaseWorker(worker);
      
      return {
        status: error.code === 'TIMEOUT' ? 'timeout' : 'failed',
        logs: error.logs || [],
        executionTime,
        memoryUsed: 0,
        error: {
          code: error.code || 'EXECUTION_ERROR',
          message: error.message,
          stack: error.stack,
        },
      };
    }
  }

  private async acquireWorker(): Promise<Worker> {
    // Find available worker
    const available = this.workerPool.find(w => !this.busyWorkers.has(w));
    if (available) {
      this.busyWorkers.add(available);
      return available;
    }
    
    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const worker = this.workerPool.find(w => !this.busyWorkers.has(w));
        if (worker) {
          clearInterval(checkInterval);
          this.busyWorkers.add(worker);
          resolve(worker);
        }
      }, 100);
    });
  }

  private releaseWorker(worker: Worker): void {
    this.busyWorkers.delete(worker);
  }

  private executeInWorker(
    worker: Worker,
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, this.config.timeoutMs);

      worker.once('message', (result) => {
        clearTimeout(timeout);
        if (result.error) {
          reject(result.error);
        } else {
          resolve(result);
        }
      });

      worker.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      worker.postMessage({
        type: 'EXECUTE',
        agent,
        input,
        context,
        config: this.config,
      });
    });
  }

  private createWorkerScript(): string {
    return `
      const { parentPort, workerData } = require('worker_threads');
      const vm = require('vm');
      
      parentPort.on('message', async (message) => {
        if (message.type === 'EXECUTE') {
          try {
            const result = await executeAgent(message.agent, message.input, message.context, message.config);
            parentPort.postMessage(result);
          } catch (error) {
            parentPort.postMessage({ 
              error: { 
                code: error.code || 'EXECUTION_ERROR', 
                message: error.message,
                stack: error.stack 
              } 
            });
          }
        }
      });
      
      async function executeAgent(agent, input, context, config) {
        const logs = [];
        const startTime = Date.now();
        
        // Create sandbox
        const sandbox = {
          console: {
            log: (...args) => logs.push({ level: 'info', message: args.join(' '), timestamp: Date.now() }),
            error: (...args) => logs.push({ level: 'error', message: args.join(' '), timestamp: Date.now() }),
            warn: (...args) => logs.push({ level: 'warn', message: args.join(' '), timestamp: Date.now() }),
            debug: (...args) => logs.push({ level: 'debug', message: args.join(' '), timestamp: Date.now() }),
          },
          context,
          require: config.allowNetwork ? require : undefined,
          Buffer,
          TextEncoder,
          TextDecoder,
          setTimeout,
          clearTimeout,
          Promise,
        };
        
        vm.createContext(sandbox);
        
        // Load and execute agent code
        const code = typeof agent.entryPoint === 'string' && agent.entryPoint.includes('function')
          ? agent.entryPoint
          : await loadAgentCode(agent);
        
        const wrappedCode = \`
          (async () => {
            \${code}
            if (typeof execute === 'function') {
              return await execute(input, context);
            } else if (typeof default === 'function') {
              return await default(input, context);
            }
            throw new Error('Agent must export execute or default function');
          })()
        \`;
        
        const result = await vm.runInContext(wrappedCode, sandbox, {
          timeout: config.timeoutMs,
          displayErrors: true,
        });
        
        const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
        
        return {
          output: result,
          logs,
          memoryUsed,
        };
      }
      
      async function loadAgentCode(agent) {
        if (agent.entryPoint.startsWith('http')) {
          const response = await fetch(agent.entryPoint);
          return response.text();
        }
        return agent.entryPoint;
      }
    `;
  }

  async health(): Promise<HealthStatus> {
    const totalWorkers = this.workerPool.length;
    const busyWorkers = this.busyWorkers.size;
    const load = busyWorkers / totalWorkers;
    
    return {
      healthy: this.initialized && totalWorkers > 0,
      status: busyWorkers === totalWorkers ? 'busy' : 'idle',
      load,
    };
  }

  getMetrics() {
    return this.metrics;
  }
}
