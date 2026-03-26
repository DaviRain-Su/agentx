/**
 * createXAgentTools — Main entry point for the XAgent SDK.
 *
 * Returns all tools needed for a pi-worker Agent to participate in
 * the XAgent decentralized agent economy:
 *
 *   - a2a_pay:        Pay another agent in USDC (A2A micro-payment)
 *   - get_price:      Fetch live crypto prices (Binance/CoinGecko)
 *   - list_agents:    Discover agents on the XAgent network
 *   - lookup_agent:   Look up agent details by ID or wallet address
 *   - create_task:    Submit an on-chain AI task with USDC budget
 *   - get_task:       Read on-chain task status
 *   - list_tasks:     List on-chain tasks for a wallet
 *
 * Usage (in a Cloudflare Durable Object):
 * ```typescript
 * import { createSqliteTools } from "pi-worker";
 * import { createAgentSession } from "pi-coding-agent-worker";
 * import { createXAgentTools, XAGENT_SYSTEM_PROMPT } from "@xagent/agent-sdk";
 *
 * const fileTools = createSqliteTools(getSqliteStore(this.sql));
 * const paymentTools = createXAgentTools({
 *   masterKey: env.NODE_PRIVATE_KEY,
 *   agentName: "orchestrator",
 *   rpcUrl: env.XLAYER_RPC_URL,
 * });
 *
 * await createAgentSession({
 *   systemPrompt: XAGENT_SYSTEM_PROMPT,
 *   tools: [...fileTools, ...paymentTools],
 *   ...
 * });
 * ```
 */

import { ethers } from "ethers";
import { createA2APaymentTool } from "./a2a-payment.js";
import { createPriceOracleTool } from "./price-oracle.js";
import { createAgentMarketTool } from "./agent-market.js";
import { createTaskManagerTool } from "./task-manager.js";
import { XLAYER_TESTNET } from "../constants.js";

export type { A2APaymentResult } from "./a2a-payment.js";

export interface XAgentToolConfig {
  /** Master private key — agent wallets are derived from this */
  masterKey: string;
  /** This agent's name (used to derive its wallet: keccak256(masterKey:agentName)) */
  agentName: string;
  /** X Layer RPC URL */
  rpcUrl?: string;
  /** Override contract addresses (defaults to X Layer Testnet) */
  contracts?: {
    usdc?: string;
    taskManager?: string;
    agentRegistry?: string;
    paymentHub?: string;
  };
}

/** Derive a deterministic private key from masterKey + agentName */
function derivePrivateKey(masterKey: string, agentName: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
}

/**
 * Create all XAgent payment/market/task tools for a pi-worker Agent.
 * Drop the returned array directly into createAgentSession({ tools: [...fileTools, ...xagentTools] }).
 */
export function createXAgentTools(config: XAgentToolConfig) {
  const rpcUrl = config.rpcUrl ?? XLAYER_TESTNET.rpc;
  const contracts = {
    usdc:          config.contracts?.usdc          ?? XLAYER_TESTNET.contracts.usdc,
    taskManager:   config.contracts?.taskManager   ?? XLAYER_TESTNET.contracts.taskManager,
    agentRegistry: config.contracts?.agentRegistry ?? XLAYER_TESTNET.contracts.agentRegistry,
    paymentHub:    config.contracts?.paymentHub    ?? XLAYER_TESTNET.contracts.paymentHub,
  };

  const privateKey = derivePrivateKey(config.masterKey, config.agentName);

  const a2aTool        = createA2APaymentTool({ privateKey, rpcUrl, usdcAddress: contracts.usdc });
  const priceTool      = createPriceOracleTool();
  const [listAgents, lookupAgent] = createAgentMarketTool({ rpcUrl, agentRegistryAddress: contracts.agentRegistry });
  const [createTask, getTask, listTasks] = createTaskManagerTool({
    privateKey,
    rpcUrl,
    taskManagerAddress: contracts.taskManager,
    usdcAddress: contracts.usdc,
    paymentHubAddress: contracts.paymentHub,
  });

  return [a2aTool, priceTool, listAgents, lookupAgent, createTask, getTask, listTasks] as const;
}

/**
 * System prompt for an XAgent.
 * Paste into createAgentSession({ systemPrompt: XAGENT_SYSTEM_PROMPT }).
 */
export const XAGENT_SYSTEM_PROMPT = `You are an XAgent operating in the decentralized AI agent economy on X Layer.

## Your Tools

**Payment tools:**
- \`a2a_pay\`: Pay another agent in USDC before calling their service (Agent-to-Agent micro-payment). Always do this before hiring a specialist.

**Market tools:**
- \`list_agents\`: Discover available specialist agents and their wallet addresses.
- \`lookup_agent\`: Get details about a specific agent by ID or wallet address.

**Price tools:**
- \`get_price\`: Fetch the live price of any cryptocurrency from Binance or CoinGecko.

**Task tools:**
- \`create_task\`: Submit a new AI task on-chain with a USDC budget.
- \`get_task\`: Check the status of an existing task.
- \`list_tasks\`: See all tasks for a wallet address.

## The A2A Payment Protocol

Before calling a specialist agent's service, you MUST pay them first:
1. Use \`list_agents\` to find the specialist's wallet address.
2. Use \`a2a_pay\` to send the required USDC fee to their wallet.
3. After the payment confirms (txHash received), proceed with the service call.
4. Report the txHash to the user as proof of payment.

This payment protocol ensures every agent interaction is verifiable on-chain.

## Payment Amounts (X Layer Testnet)
- PriceOracleAgent: 0.001 USDC per price query
- TradeStrategyAgent: 0.005 USDC per strategy analysis
- WorkflowOrchestrator: 0.002 USDC orchestration fee

## Key Principle
Every transaction produces a real on-chain txHash verifiable at https://www.oklink.com/x-layer-testnet
Never simulate or fake payments — always use real USDC transfers.`;
