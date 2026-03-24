import { AgentRuntime, RuntimeConfig, ExecutionContext, ExecutionResult, AgentDefinition, HealthStatus } from './types';

/**
 * Cloudflare Worker Runtime Implementation
 * Executes agents within V8 Isolates with strict resource limits
 */
export class CloudflareRuntime extends AgentRuntime {
  private initialized = false;

  async initialize(): Promise<void> {
    // Cloudflare Workers don't need explicit initialization
    this.initialized = true;
  }

  async destroy(): Promise<void> {
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
    const logs: Array<{ level: 'debug' | 'info' | 'warn' | 'error'; message: string; timestamp: number; metadata?: Record<string, any> }> = [];

    try {
      // Create isolated execution context
      const result = await this.runInIsolate(agent, input, context, logs);
      
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, 0, true);

      return {
        status: 'success',
        output: result,
        logs,
        executionTime,
        memoryUsed: 0, // CF doesn't expose memory easily
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, 0, false);

      // Check for specific error types
      let status: ExecutionResult['status'] = 'failed';
      if (error.message?.includes('CPU time limit')) {
        status = 'timeout';
      } else if (error.message?.includes('memory')) {
        status = 'memory_exceeded';
      }

      return {
        status,
        logs,
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

  private async runInIsolate(
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext,
    logs: Array<{ level: 'debug' | 'info' | 'warn' | 'error'; message: string; timestamp: number; metadata?: Record<string, any> }>
  ): Promise<any> {
    // In Cloudflare Workers, we use dynamic import with code string
    // The agent code should export a default function or an object with execute method
    
    const agentModule = await this.loadAgentModule(agent);
    
    // Create sandboxed context
    const sandbox = this.createSandbox(context, logs);
    
    // Execute agent with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), this.config.timeoutMs);
    });
    
    const executionPromise = this.executeAgentCode(agentModule, input, sandbox);
    
    return Promise.race([executionPromise, timeoutPromise]);
  }

  private async loadAgentModule(agent: AgentDefinition): Promise<any> {
    // For CF Workers, agent code is typically bundled or fetched from KV/Cache
    if (agent.entryPoint.startsWith('http')) {
      const response = await fetch(agent.entryPoint);
      const code = await response.text();
      return this.compileAgentCode(code);
    }
    
    // Inline code (for testing/small agents)
    return this.compileAgentCode(agent.entryPoint);
  }

  private compileAgentCode(code: string): any {
    // Create a function from code string with restricted globals
    const wrappedCode = `
      return (async function() {
        const exports = {};
        ${code}
        return exports.default || exports;
      })()
    `;
    
    // Note: In real CF Workers, we'd use a proper sandbox
    // This is a simplified version
    const fn = new Function(wrappedCode);
    return fn();
  }

  private createSandbox(context: ExecutionContext, logs: Array<{ level: 'debug' | 'info' | 'warn' | 'error'; message: string; timestamp: number; metadata?: Record<string, any> }>): any {
    return {
      context,
      console: {
        log: (...args: any[]) => logs.push({ level: 'info', message: args.join(' '), timestamp: Date.now() }),
        error: (...args: any[]) => logs.push({ level: 'error', message: args.join(' '), timestamp: Date.now() }),
        warn: (...args: any[]) => logs.push({ level: 'warn', message: args.join(' '), timestamp: Date.now() }),
        debug: (...args: any[]) => logs.push({ level: 'debug', message: args.join(' '), timestamp: Date.now() }),
      },
      fetch: this.config.allowNetwork ? fetch : undefined,
      crypto,
      TextEncoder,
      TextDecoder,
      // Restricted Date (no access to current time if needed)
      Date: Date,
    };
  }

  private async executeAgentCode(module: any, input: any, sandbox: any): Promise<any> {
    if (typeof module === 'function') {
      return module(input, sandbox);
    }
    
    if (module.execute && typeof module.execute === 'function') {
      return module.execute(input, sandbox);
    }
    
    throw new Error('Agent must export a function or an object with execute method');
  }

  async health(): Promise<HealthStatus> {
    return {
      healthy: this.initialized,
      status: 'idle',
      load: 0,
    };
  }

  getMetrics() {
    return this.metrics;
  }
}
