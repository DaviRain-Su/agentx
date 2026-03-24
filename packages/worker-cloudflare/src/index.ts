/**
 * Gradience Worker - Cloudflare Worker for Decentralized Agent Execution Network
 *
 * Features:
 * - Runtime abstraction supporting multiple execution environments
 * - Node registration with capability discovery
 * - Task execution with sandboxed agents
 * - P2P communication with other nodes
 * - On-chain settlement and verification
 */

import { ethers } from "ethers";
import { CloudflareRuntime, RuntimeFactory, ExecutionNode, NodeConfig } from "@gradience/shared-orchestrator";
import { CONTRACTS } from "./config/contracts";

export interface Env {
  // Node identity
  NODE_ID: string;
  NODE_PRIVATE_KEY: string;
  
  // Network
  XLAYER_RPC_URL: string;
  REGISTRY_CONTRACT: string;
  
  // External APIs
  ANTHROPIC_API_KEY: string;
  COINGECKO_API_KEY?: string;
  XURL_API_KEY?: string;
  XURL_ENDPOINT?: string;
  
  // Cloudflare services
  GRADIENCE_KV: KVNamespace;
  AI: Ai;
  
  // Feature flags
  DEMO_MODE?: string;
}

// Node instance
let node: ExecutionNode | null = null;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Initialize node on first request
    if (!node) {
      node = await initializeNode(env);
    }
    
    return node.handleRequest(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    console.log("[Worker] Scheduled heartbeat");
    
    if (!node) {
      node = await initializeNode(env);
    }
    
    // Health check and metrics reporting
    const health = await node.health();
    console.log(`[Worker] Health: ${JSON.stringify(health)}`);
  },
};

async function initializeNode(env: Env): Promise<ExecutionNode> {
  const config: NodeConfig = {
    nodeId: env.NODE_ID || `cf-worker-${crypto.randomUUID()}`,
    privateKey: env.NODE_PRIVATE_KEY,
    endpoint: "https://worker.gradience.io", // Will be set from request
    registryContract: env.REGISTRY_CONTRACT,
    provider: new ethers.JsonRpcProvider(env.XLAYER_RPC_URL),
    capabilities: {
      runtime: 'cloudflare-worker',
      resources: {
        memory: 128,
        cpu: 1,
      },
      agentTypes: [
        'price-monitor',
        'condition-checker',
        'trade-executor',
        'llm-inference',
      ],
      region: 'global',
      network: {
        latency: 50,
        bandwidth: 100,
      },
      pricing: {
        perExecution: '0.005',
        perSecond: '0.0001',
      },
    },
  };

  const runtime = RuntimeFactory.create('cloudflare-worker', {
    maxMemoryMB: 128,
    maxCpuMs: 50,
    timeoutMs: 30000,
    allowNetwork: true,
    allowedHosts: [
      'api.coingecko.com',
      'api.anthropic.com',
      'rpc.xlayer.tech',
      'xlayertestrpc.okx.com',
    ],
  });

  const executionNode = new ExecutionNode(runtime, config);
  await executionNode.initialize();
  
  console.log(`[Worker] Node ${config.nodeId} initialized`);
  
  return executionNode;
}
