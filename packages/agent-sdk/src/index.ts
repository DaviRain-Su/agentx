/**
 * @gradience/agent-sdk — Gradience Agent Economy SDK for pi-worker
 *
 * Extends pi-worker with on-chain payments, agent discovery, and task management
 * on X Layer. Tools follow pi-worker's TypeBox + execute pattern and plug directly
 * into createAgentSession({ customTools }).
 *
 * ── Quick start (one call does everything) ───────────────────────────────────
 * ```typescript
 * import { DurableObject } from "cloudflare:workers";
 * import { getSqliteStore } from "pi-worker";
 * import { createGradienceSession } from "@gradience/agent-sdk";
 *
 * export class MyAgent extends DurableObject {
 *   async chat(msg: string) {
 *     const { session } = await createGradienceSession({
 *       sqliteStore: getSqliteStore(this.ctx.storage.sql),
 *       masterKey: this.env.NODE_PRIVATE_KEY,
 *       agentName: "my-agent",
 *       cfGatewayToken: this.env.CF_GATEWAY_TOKEN,
 *       cfAccountId:    this.env.CF_ACCOUNT_ID,
 *       cfGatewayName:  this.env.CF_GATEWAY_NAME,
 *     });
 *     return session;
 *   }
 * }
 * ```
 *
 * ── Manual assembly (bring your own pi-worker setup) ─────────────────────────
 * ```typescript
 * import { createSqliteTools } from "pi-worker";
 * import { createAgentSession } from "pi-coding-agent-worker";
 * import { createGradienceTools, GRADIENCE_SYSTEM_PROMPT } from "@gradience/agent-sdk";
 *
 * const fileTools    = createSqliteTools(getSqliteStore(this.ctx.storage.sql));
 * const paymentTools = createGradienceTools({
 *   masterKey: env.NODE_PRIVATE_KEY,
 *   agentName: "orchestrator",
 * });
 *
 * const { session } = await createAgentSession({
 *   customTools: [...fileTools, ...paymentTools],
 *   resourceLoader: { getSystemPrompt: () => GRADIENCE_SYSTEM_PROMPT, ... },
 *   ...
 * });
 * ```
 */

// ── Main integration helpers ─────────────────────────────────────────────────
export { createGradienceSession }        from "./session.js";
export type { GradienceSessionConfig }   from "./session.js";

// ── Tool factories (for manual assembly) ─────────────────────────────────────
export { createGradienceTools, GRADIENCE_SYSTEM_PROMPT } from "./tools/index.js";
export type { GradienceToolConfig, A2APaymentResult }    from "./tools/index.js";

export { createA2APaymentTool }   from "./tools/a2a-payment.js";
export { createPriceOracleTool }  from "./tools/price-oracle.js";
export { createAgentMarketTool }  from "./tools/agent-market.js";
export { createTaskManagerTool }  from "./tools/task-manager.js";

// ── Agent classes (extend GradienceAgent or use directly) ────────────────────
export { GradienceAgent }         from "./core/GradienceAgent.js";
export type { AgentInfo, AgentPricing, FeeCollectionResult } from "./core/GradienceAgent.js";
export { WorkflowOrchestrator }   from "./agents/WorkflowOrchestrator.js";
export { PriceOracleAgent }       from "./agents/PriceOracleAgent.js";
export { TradeStrategyAgent }     from "./agents/TradeStrategyAgent.js";

// ── On-chain registry service ─────────────────────────────────────────────────
export { AgentRegistryService }   from "./registry/AgentRegistryService.js";
export type { RegisteredAgent }   from "./registry/AgentRegistryService.js";

// ── Chain constants ───────────────────────────────────────────────────────────
export { XLAYER_TESTNET } from "./constants.js";

// ── Wallet utilities ──────────────────────────────────────────────────────────
import { ethers } from "ethers";

/** Derive a deterministic agent wallet address from master key + agent name */
export function deriveAgentAddress(masterKey: string, agentName: string): string {
  const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(walletSeed).address;
}

/** Get wallet addresses for all standard Gradience agents */
export function getAgentWallets(masterKey: string): Record<string, string> {
  return {
    orchestrator:      deriveAgentAddress(masterKey, "orchestrator"),
    "price-oracle":    deriveAgentAddress(masterKey, "price-oracle"),
    "trade-strategy":  deriveAgentAddress(masterKey, "trade-strategy"),
  };
}
