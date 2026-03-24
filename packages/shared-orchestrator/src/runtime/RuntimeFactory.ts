import { AgentRuntime, RuntimeConfig, RuntimeType } from './types';
import { CloudflareRuntime } from './CloudflareRuntime';
import { NodeRuntime } from './NodeRuntime';

/**
 * Factory for creating AgentRuntime instances
 * Automatically selects the appropriate runtime based on environment
 */
export class RuntimeFactory {
  private static runtimes: Map<string, AgentRuntime> = new Map();

  /**
   * Create a runtime instance
   */
  static create(type: RuntimeType, config: RuntimeConfig): AgentRuntime {
    const key = `${type}-${JSON.stringify(config)}`;
    
    if (this.runtimes.has(key)) {
      return this.runtimes.get(key)!;
    }

    let runtime: AgentRuntime;

    switch (type) {
      case 'cloudflare-worker':
        runtime = new CloudflareRuntime(config);
        break;
      case 'node':
        runtime = new NodeRuntime(config);
        break;
      // case 'deno':
      //   runtime = new DenoRuntime(config);
      //   break;
      // case 'docker':
      //   runtime = new DockerRuntime(config);
      //   break;
      default:
        throw new Error(`Unknown runtime type: ${type}`);
    }

    this.runtimes.set(key, runtime);
    return runtime;
  }

  /**
   * Auto-detect and create runtime based on environment
   */
  static autoDetect(config: RuntimeConfig): AgentRuntime {
    // Check for Cloudflare Workers environment
    if (typeof globalThis !== 'undefined' && 
        (globalThis as any).WebSocketPair !== undefined) {
      return this.create('cloudflare-worker', config);
    }

    // Check for Deno
    if (typeof globalThis !== 'undefined' && 
        (globalThis as any).Deno !== undefined) {
      // return this.create('deno', config);
      throw new Error('Deno runtime not yet implemented');
    }

    // Default to Node.js
    return this.create('node', config);
  }

  /**
   * Get all registered runtimes
   */
  static getAllRuntimes(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }

  /**
   * Clear all runtime instances
   */
  static clear(): void {
    this.runtimes.clear();
  }
}
