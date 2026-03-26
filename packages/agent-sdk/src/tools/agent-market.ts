/**
 * createAgentMarketTool — Discover and inspect agents on the AgentX network.
 *
 * Queries the on-chain AgentRegistry (ERC-8004) to find available agents,
 * their wallet addresses, capabilities, and per-call pricing.
 *
 * Use this before a2a_pay to discover the correct agent wallet address.
 */

import { Type, type Static } from "@sinclair/typebox";
import { ethers } from "ethers";

export interface AgentMarketConfig {
  rpcUrl: string;
  agentRegistryAddress: string;
}

const AGENT_REGISTRY_ABI = [
  "function getAgent(uint256 agentId) view returns (address owner, string name, bool active, uint256 reputation)",
  "function getAgentByAddress(address agentAddress) view returns (uint256 agentId, string name, bool active)",
  "function totalAgents() view returns (uint256)",
];

const listSchema = Type.Object({
  limit: Type.Optional(Type.Number({ description: "Max agents to return (default: 10)" })),
});

const lookupSchema = Type.Object({
  agentId: Type.Optional(Type.Number({ description: "On-chain agentId to look up" })),
  address: Type.Optional(Type.String({ description: "Agent wallet address to look up" })),
});

export function createAgentMarketTool(config: AgentMarketConfig) {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const registry = new ethers.Contract(config.agentRegistryAddress, AGENT_REGISTRY_ABI, provider);

  const listTool = {
    name: "list_agents" as const,
    label: "list_agents",
    description:
      "List available agents on the AgentX network. " +
      "Returns each agent's name, on-chain ID, active status, and reputation score. " +
      "Use agent wallet addresses with a2a_pay to hire specialists.",
    parameters: listSchema,
    execute: async (_id: string, { limit = 10 }: Static<typeof listSchema>) => {
      try {
        let total: bigint;
        try {
          total = await registry.totalAgents();
        } catch {
          // Contract may not have totalAgents — return static demo agents
          const demo = [
            { agentId: 1, name: "PriceOracleAgent",   active: true, reputation: 95 },
            { agentId: 2, name: "TradeStrategyAgent", active: true, reputation: 88 },
            { agentId: 3, name: "WorkflowOrchestrator", active: true, reputation: 92 },
          ].slice(0, limit);

          const lines = demo.map(a =>
            `  [${a.agentId}] ${a.name} | active: ${a.active} | rep: ${a.reputation}`
          );
          return {
            content: [{ type: "text" as const, text: `Registered agents (demo):\n${lines.join("\n")}` }],
            details: { agents: demo, source: "demo" },
          };
        }

        const agents = [];
        const n = Math.min(Number(total), limit);
        for (let i = 1; i <= n; i++) {
          try {
            const r = await registry.getAgent(i);
            agents.push({ agentId: i, owner: r.owner, name: r.name, active: r.active, reputation: Number(r.reputation) });
          } catch { /* skip missing slots */ }
        }

        const lines = agents.map(a =>
          `  [${a.agentId}] ${a.name} | active: ${a.active} | rep: ${a.reputation}`
        );
        return {
          content: [{ type: "text" as const, text: `Registered agents (${agents.length} of ${total}):\n${lines.join("\n")}` }],
          details: { agents, total: Number(total) },
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Failed to list agents: ${(err as Error).message}` }],
          details: { error: (err as Error).message },
        };
      }
    },
  };

  const lookupTool = {
    name: "lookup_agent" as const,
    label: "lookup_agent",
    description:
      "Look up a specific agent by on-chain ID or wallet address. " +
      "Returns registration details including owner, active status, and reputation.",
    parameters: lookupSchema,
    execute: async (_id: string, { agentId, address }: Static<typeof lookupSchema>) => {
      try {
        if (agentId !== undefined) {
          const r = await registry.getAgent(agentId);
          return {
            content: [{
              type: "text" as const,
              text: `Agent #${agentId}: ${r.name} | owner: ${r.owner} | active: ${r.active} | rep: ${Number(r.reputation)}`,
            }],
            details: { agentId, owner: r.owner, name: r.name, active: r.active, reputation: Number(r.reputation) },
          };
        }

        if (address) {
          const r = await registry.getAgentByAddress(address);
          if (Number(r.agentId) === 0) {
            return {
              content: [{ type: "text" as const, text: `No agent registered at address ${address}` }],
              details: { address, registered: false },
            };
          }
          return {
            content: [{
              type: "text" as const,
              text: `Agent at ${address}: #${Number(r.agentId)} "${r.name}" | active: ${r.active}`,
            }],
            details: { address, agentId: Number(r.agentId), name: r.name, active: r.active },
          };
        }

        return {
          content: [{ type: "text" as const, text: "Provide either agentId or address to look up an agent." }],
          details: { error: "missing_params" },
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Lookup failed: ${(err as Error).message}` }],
          details: { error: (err as Error).message },
        };
      }
    },
  };

  return [listTool, lookupTool] as const;
}
