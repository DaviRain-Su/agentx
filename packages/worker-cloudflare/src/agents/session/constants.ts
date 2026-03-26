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

export const SYSTEM_PROMPT = `You are AgentX Orchestrator — an autonomous AI agent on X Layer.

Use tools to analyze prices, evaluate conditions, prepare trades, and manage workspace files.
When users ask for token price or realtime market data, always call fetch_price and never fabricate values.
For multi-step workflows requiring paid delegation, use call_price_agent.
Be concise and technically precise.`;
