import { NodeRuntime, RuntimeFactory, ExecutionNode, NodeConfig } from '@xagent/shared-orchestrator';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Configuration from environment
  const config: NodeConfig = {
    nodeId: process.env.NODE_ID || `local-node-${Date.now()}`,
    privateKey: process.env.NODE_PRIVATE_KEY!,
    endpoint: process.env.NODE_ENDPOINT || 'http://localhost:8080',
    registryContract: process.env.REGISTRY_CONTRACT!,
    provider: new ethers.JsonRpcProvider(process.env.RPC_URL),
    capabilities: {
      runtime: 'node',
      resources: {
        memory: 2048,  // 2GB
        cpu: 4,
      },
      agentTypes: [
        'price-monitor',
        'trade-executor',
        'condition-checker',
        'llm-inference',
      ],
      region: process.env.NODE_REGION || 'local',
      network: {
        latency: 10,
        bandwidth: 1000,
      },
      pricing: {
        perExecution: process.env.PRICE_PER_EXECUTION || '0.01',
        perSecond: process.env.PRICE_PER_SECOND || '0.001',
      },
    },
  };

  // Validate configuration
  if (!config.privateKey) {
    console.error('Error: NODE_PRIVATE_KEY is required');
    process.exit(1);
  }

  if (!config.registryContract) {
    console.error('Error: REGISTRY_CONTRACT is required');
    process.exit(1);
  }

  // Create runtime
  const runtime = RuntimeFactory.create('node', {
    maxMemoryMB: config.capabilities.resources.memory,
    timeoutMs: 30000,
    allowNetwork: true,
  });

  // Create and start node
  const node = new ExecutionNode(runtime, config);

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Gradience Execution Node                             ║
║                                                           ║
║   Node ID: ${config.nodeId.padEnd(46)}║
║   Endpoint: ${config.endpoint.padEnd(45)}║
║   Region: ${config.capabilities.region.padEnd(47)}║
║   Memory: ${String(config.capabilities.resources.memory + 'MB').padEnd(47)}║
║   CPU: ${String(config.capabilities.resources.cpu + ' cores').padEnd(50)}║
║                                                           ║
║   Supported Agents:                                       ║
║   ${config.capabilities.agentTypes.join(', ').padEnd(55)}║
║                                                           ║
║   Pricing:                                                ║
║   - Per Execution: ${config.capabilities.pricing.perExecution.padEnd(37)}║
║   - Per Second: ${config.capabilities.pricing.perSecond.padEnd(40)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  try {
    await node.initialize();
    console.log('✅ Node registered and listening for tasks\n');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down node...');
      await node.stop();
      console.log('✅ Node stopped');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down node...');
      await node.stop();
      console.log('✅ Node stopped');
      process.exit(0);
    });

    // Keep process running
    setInterval(async () => {
      const health = await node.health();
      const metrics = node.getMetrics();
      
      console.log(`[${new Date().toISOString()}] Status: ${health.status}, Load: ${(health.load * 100).toFixed(1)}%, Executions: ${metrics.totalExecutions}`);
    }, 60000);

  } catch (error) {
    console.error('❌ Failed to start node:', error);
    process.exit(1);
  }
}

main();
