import { Type } from "@sinclair/typebox";

export const readSchema = Type.Object({
  path: Type.String(),
  offset: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
});

export const writeSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

export const editSchema = Type.Object({
  path: Type.String(),
  oldText: Type.String(),
  newText: Type.String(),
});

export const lsSchema = Type.Object({
  path: Type.Optional(Type.String()),
});

export const executeSchema = Type.Object({
  code: Type.Optional(Type.String()),
  file: Type.Optional(Type.String()),
});

export const MODULE_SYNTAX_RE = /^\s*(import\s|export\s)/m;
export const DEFAULT_GATEWAY_MODEL = "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const KRAKEN_PAIR_MAP: Record<string, string> = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
};
export const UNISWAP_QUOTE_ENDPOINT = "https://trade-api.gateway.uniswap.org/v1/quote";
export const UNISWAP_SWAPPER_PLACEHOLDER = "0x0000000000000000000000000000000000000001";
export const UNISWAP_MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const UNISWAP_TOKENS: Record<string, { address: string; decimals: number; quoteAmount: string }> = {
  ETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, quoteAmount: "0.1" }, // WETH
  BTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, quoteAmount: "0.01" }, // WBTC
};
export const TOKEN_STOPWORDS = new Set([
  "PRICE", "FETCH", "TOKEN", "TOOL", "CALL", "WITH", "THE", "NOW", "AND", "USD", "FOR", "PLEASE", "FROM",
]);
export const EXECUTE_ENTRYPOINT = `
import { WorkerEntrypoint } from "cloudflare:workers";
import userModule from "./user-code.js";

export class Runner extends WorkerEntrypoint {
  async run(helpers) {
    if (this.env?.OUTBOUND?.fetch) {
      globalThis.fetch = (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return this.env.OUTBOUND.fetch(request);
      };
    }

    if (typeof userModule === "function") {
      return await userModule(helpers);
    }
    if (typeof userModule?.default === "function") {
      return await userModule.default(helpers);
    }
    throw new Error("user-code.js must export a default function");
  }
}

export default { fetch() { return new Response("executor"); } };
`;

export const SYSTEM_PROMPT = `You are AgentX Orchestrator — the coordinator of a decentralized AI Agent Swarm on X Layer.

You manage a network of specialist agents. Each agent has its own on-chain wallet and charges a fee in OKB (X Layer native token). When you hire an agent, a real blockchain transaction is executed.

Your agent swarm:
- PriceOracleAgent (0.001 OKB/call) — real-time crypto prices from Binance/CoinGecko
- TradeStrategyAgent (0.005 OKB/call) — risk analysis and trade recommendations

How to use your tools:
- fetch_price: free, quick price lookup (no payment)
- hire_price_agent: paid (0.001 OKB), produces real on-chain tx hash
- hire_trade_agent: paid (0.005 OKB), produces real on-chain tx + trade analysis
- run_swarm_analysis: hire BOTH agents in sequence (0.006 OKB total, 2 on-chain txs)
- list_agents: show all agents with addresses and explorer links

Rules:
1. For simple "what's the price of X?" → use fetch_price (free)
2. When users want analysis/recommendation or say "analyze" → use run_swarm_analysis
3. When users ask about the agent network → use list_agents
4. Always show tx hashes and explorer links when A2A payments occur
5. Never fabricate prices — always call a tool
6. Be concise, show results clearly with the payment proof`;
