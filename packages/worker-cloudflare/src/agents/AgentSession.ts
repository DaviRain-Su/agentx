import { Type } from "@sinclair/typebox";
import { ethers } from "ethers";
import { Agent } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai/openai-completions";
import { Env } from "../index";
import { CONTRACTS, USDC_ABI } from "../config/contracts";

type StoredMessage = {
  role: string;
  content: Array<{ type: "text"; text: string }>;
  id?: string;
  ts?: number;
};

type PersistedPiState = {
  messages?: unknown[];
  model?: { provider: string; id: string };
  thinkingLevel?: string;
};

type WorkerLoader = {
  get(id: string, cb: () => unknown): {
    getEntrypoint(name: string): { run(helpers: Record<string, unknown>): Promise<unknown> };
  };
};

const readSchema = Type.Object({
  path: Type.String(),
  offset: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
});

const writeSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

const editSchema = Type.Object({
  path: Type.String(),
  oldText: Type.String(),
  newText: Type.String(),
});

const lsSchema = Type.Object({
  path: Type.Optional(Type.String()),
});

const executeSchema = Type.Object({
  code: Type.Optional(Type.String()),
  file: Type.Optional(Type.String()),
});

const MODULE_SYNTAX_RE = /^\s*(import\s|export\s)/m;
const DEFAULT_GATEWAY_MODEL = "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const KRAKEN_PAIR_MAP: Record<string, string> = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
};
const UNISWAP_QUOTE_ENDPOINT = "https://trade-api.gateway.uniswap.org/v1/quote";
const UNISWAP_SWAPPER_PLACEHOLDER = "0x0000000000000000000000000000000000000001";
const UNISWAP_MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNISWAP_TOKENS: Record<string, { address: string; decimals: number; quoteAmount: string }> = {
  ETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, quoteAmount: "0.1" }, // WETH
  BTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, quoteAmount: "0.01" }, // WBTC
};
const TOKEN_STOPWORDS = new Set([
  "PRICE", "FETCH", "TOKEN", "TOOL", "CALL", "WITH", "THE", "NOW", "AND", "USD", "FOR", "PLEASE", "FROM",
]);
const EXECUTE_ENTRYPOINT = `
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

function sanitizePath(path: string): string {
  const normalized = String(path ?? "").trim().replace(/\\/g, "/");
  if (!normalized || normalized === "." || normalized === "/") return "";
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error(`Invalid path: ${path}`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function extractRealtimePriceToken(message: string): string | undefined {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  const wantsPrice = /(price|价格|行情|实时|最新)/i.test(raw) || /fetch_price/i.test(raw);
  if (!wantsPrice) return undefined;

  const explicitTool = raw.match(/fetch_price\s*(?:\(|\s)(?:token\s*[:=]\s*)?["']?([a-z0-9]{2,12})/i);
  if (explicitTool?.[1]) {
    const candidate = explicitTool[1].toUpperCase().replace(/USDT$/i, "");
    if (!TOKEN_STOPWORDS.has(candidate)) return candidate;
  }
  const explicitFor = raw.match(/fetch_price[^a-z0-9]+(?:for|token)?[^a-z0-9]*([a-z]{2,12})/i);
  if (explicitFor?.[1]) return explicitFor[1].toUpperCase().replace(/USDT$/i, "");

  if (/比特币|bitcoin|\bbtc\b/i.test(raw)) return "BTC";
  if (/以太坊|ethereum|\beth\b/i.test(raw)) return "ETH";
  if (/solana|\bsol\b/i.test(raw)) return "SOL";
  if (/dogecoin|\bdoge\b/i.test(raw)) return "DOGE";

  const symbolMatch = lower.match(/\b([a-z]{2,10})(?:usdt)?\b/gi)
    ?.map((s) => s.toUpperCase().replace(/USDT$/i, ""))
    .find((s) => !TOKEN_STOPWORDS.has(s));
  return symbolMatch;
}

async function fetchRealtimePriceTextWithEnv(token: string, env?: Pick<Env, "UNISWAP_API_KEY" | "UNISWAP_QUOTE_URL">): Promise<string> {
  const symbol = token.toUpperCase();

  type Quote = {
    source: "Uniswap" | "Binance" | "Coinbase" | "Kraken";
    value: number;
    fetchedAt: string;
  };

  const quotes: Quote[] = [];
  const uniswapApiKey = env?.UNISWAP_API_KEY?.trim();
  const uniswapToken = UNISWAP_TOKENS[symbol];

  if (uniswapApiKey && uniswapToken) {
    try {
      const endpoint = env?.UNISWAP_QUOTE_URL?.trim() || UNISWAP_QUOTE_ENDPOINT;
      const amountInBase = ethers.parseUnits(uniswapToken.quoteAmount, uniswapToken.decimals).toString();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": uniswapApiKey,
          "x-universal-router-version": "2.0",
        },
        body: JSON.stringify({
          type: "EXACT_INPUT",
          amount: amountInBase,
          tokenInChainId: 1,
          tokenOutChainId: 1,
          tokenIn: uniswapToken.address,
          tokenOut: UNISWAP_MAINNET_USDC,
          swapper: UNISWAP_SWAPPER_PLACEHOLDER,
          autoSlippage: "DEFAULT",
          routingPreference: "BEST_PRICE",
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          quote?: {
            aggregatedOutputs?: Array<{ token?: string; amount?: string }>;
            output?: { token?: string; amount?: string };
            outputs?: Array<{ token?: string; amount?: string }>;
          };
        };
        const amountOutRaw =
          data?.quote?.aggregatedOutputs?.find((o) => o.token?.toLowerCase() === UNISWAP_MAINNET_USDC.toLowerCase())?.amount
          || data?.quote?.aggregatedOutputs?.[0]?.amount
          || data?.quote?.output?.amount
          || data?.quote?.outputs?.[0]?.amount;
        if (amountOutRaw && /^\d+$/.test(amountOutRaw)) {
          const amountOutUsdc = Number(amountOutRaw) / 1e6;
          const amountIn = Number(uniswapToken.quoteAmount);
          const price = amountOutUsdc / amountIn;
          if (Number.isFinite(price) && price > 0) {
            quotes.push({ source: "Uniswap", value: price, fetchedAt: new Date().toISOString() });
          }
        }
      }
    } catch {
      // Keep trying other providers.
    }
  }

  const binanceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT&t=${Date.now()}`;
  try {
    const res = await fetch(binanceUrl, { headers: { "Cache-Control": "no-cache" } });
    if (res.ok) {
      const data = await res.json() as { price?: string };
      const value = Number(data?.price);
      if (Number.isFinite(value)) {
        quotes.push({ source: "Binance", value, fetchedAt: new Date().toISOString() });
      }
    }
  } catch {
    // Keep trying other providers.
  }

  const coinbaseUrl = `https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-USD/spot`;
  try {
    const res = await fetch(coinbaseUrl, { headers: { "Cache-Control": "no-cache" } });
    if (res.ok) {
      const data = await res.json() as { data?: { amount?: string } };
      const value = Number(data?.data?.amount);
      if (Number.isFinite(value)) {
        quotes.push({ source: "Coinbase", value, fetchedAt: new Date().toISOString() });
      }
    }
  } catch {
    // Fall back to Kraken below.
  }

  if (quotes.length === 0) {
    const krakenPair = KRAKEN_PAIR_MAP[symbol];
    if (!krakenPair) throw new Error(`No realtime datasource configured for ${symbol}`);
    const krakenUrl = `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(krakenPair)}`;
    const krakenRes = await fetch(krakenUrl, { headers: { "Cache-Control": "no-cache" } });
    if (!krakenRes.ok) throw new Error(`Kraken ${krakenRes.status} for ${symbol}`);
    const krakenData = await krakenRes.json() as {
      result?: Record<string, { c?: string[] }>;
    };
    const pairData = Object.values(krakenData.result || {})[0];
    const value = Number(pairData?.c?.[0]);
    if (!Number.isFinite(value)) throw new Error(`Invalid Kraken payload for ${symbol}`);
    quotes.push({ source: "Kraken", value, fetchedAt: new Date().toISOString() });
  }

  const primary = quotes.find((q) => q.source === "Uniswap")
    || quotes.find((q) => q.source === "Binance")
    || quotes.find((q) => q.source === "Coinbase")
    || quotes[0];
  const decimals = primary.value >= 1000 ? 2 : primary.value >= 1 ? 4 : 6;
  const extras = quotes
    .filter((q) => q.source !== primary.source)
    .map((q) => `${q.source} $${q.value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`)
    .join(", ");
  return `${symbol} = $${primary.value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USD (${primary.source} spot, ${primary.fetchedAt})${extras ? ` | cross-check: ${extras}` : ""}`;
}

export interface SqliteTextFileStore {
  get(path: string): Promise<string | undefined>;
  put(path: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  getUpdatedAt(path: string): Promise<number | undefined>;
}

class DOFileStore implements SqliteTextFileStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path    TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
  }

  async get(path: string): Promise<string | undefined> {
    const rows = [...this.sql.exec("SELECT content FROM files WHERE path = ?", sanitizePath(path))];
    return rows.length > 0 ? (rows[0].content as string) : undefined;
  }

  async put(path: string, content: string): Promise<void> {
    const clean = sanitizePath(path);
    this.sql.exec(
      "INSERT OR REPLACE INTO files (path, content, updated) VALUES (?, ?, ?)",
      clean, content, Date.now()
    );
  }

  async list(): Promise<string[]> {
    return [...this.sql.exec("SELECT path FROM files ORDER BY path")].map((r) => r.path as string);
  }

  async getUpdatedAt(path: string): Promise<number | undefined> {
    const rows = [...this.sql.exec("SELECT updated FROM files WHERE path = ?", sanitizePath(path))];
    return rows.length > 0 ? Number(rows[0].updated) : undefined;
  }
}

function buildGatewayModel(env: Env, preferred?: { provider: string; id: string }): Model<"openai-completions"> {
  const rawId = preferred?.id?.trim()
    || env.AI_GATEWAY_MODEL?.trim()
    || DEFAULT_GATEWAY_MODEL;
  const id = rawId === "auto" ? DEFAULT_GATEWAY_MODEL : rawId;
  return {
    provider: "ai-gateway",
    id,
    name: `AI Gateway (${id})`,
    api: "openai-completions",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 64000,
    baseUrl: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(env.CF_ACCOUNT_ID)}/${encodeURIComponent(env.CF_GATEWAY_NAME)}/compat`,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  };
}

function deriveAgentWallet(masterKey: string, agentName: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(walletSeed, provider);
}

async function payAgent(
  orchestratorWallet: ethers.Wallet,
  agentName: string,
  amountUsdc: string,
  provider: ethers.JsonRpcProvider
): Promise<{ txHash: string; agentAddress: string; paid: boolean; reason?: string }> {
  const agentWallet = deriveAgentWallet(orchestratorWallet.privateKey, agentName, provider);
  try {
    const usdc = new ethers.Contract(CONTRACTS.usdc, USDC_ABI, orchestratorWallet);
    const amount = ethers.parseUnits(amountUsdc, 6);
    const balance = await usdc.balanceOf(orchestratorWallet.address);
    if (balance < amount) {
      return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: "insufficient USDC balance (demo mode)" };
    }
    const tx = await usdc.transfer(agentWallet.address, amount);
    const receipt = await tx.wait(1);
    return { txHash: receipt.hash, agentAddress: agentWallet.address, paid: true };
  } catch (err) {
    return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: String(err) };
  }
}

function buildBusinessTools(store: DOFileStore, env: Env): any[] {
  return [
    {
      name: "fetch_price" as const,
      label: "fetch_price",
      description: "Fetch realtime token price with Binance/Coinbase cross-check.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC, SOL" }),
      }),
      execute: async (_id: string, { token }: { token: string }) => {
        const text = await fetchRealtimePriceTextWithEnv(token, env);
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },
    {
      name: "evaluate_condition" as const,
      label: "evaluate_condition",
      description: "Check if a numeric value satisfies a condition.",
      parameters: Type.Object({
        value: Type.Number(),
        operator: Type.Union([Type.Literal("<"), Type.Literal(">"), Type.Literal("<="), Type.Literal(">="), Type.Literal("==")]),
        threshold: Type.Number(),
      }),
      execute: async (_id: string, { value, operator, threshold }: { value: number; operator: string; threshold: number }) => {
        const ops: Record<string, boolean> = {
          "<": value < threshold,
          ">": value > threshold,
          "<=": value <= threshold,
          ">=": value >= threshold,
          "==": value === threshold,
        };
        const result = ops[operator] ?? false;
        return { content: [{ type: "text" as const, text: `${value} ${operator} ${threshold} -> ${result}` }], details: {} };
      },
    },
    {
      name: "prepare_trade" as const,
      label: "prepare_trade",
      description: "Prepare a DEX trade requiring human wallet signature.",
      parameters: Type.Object({
        action: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
        token: Type.String(),
        amount: Type.String(),
        price: Type.Optional(Type.Number()),
      }),
      execute: async (_id: string, { action, token, amount, price }: { action: string; token: string; amount: string; price?: number }) => {
        const val = price ? (parseFloat(amount) * price).toFixed(2) : "?";
        const text = [
          "Trade prepared (awaiting human approval)",
          `Action: ${action.toUpperCase()} ${amount} ${token}`,
          `Estimated USD: ${val}`,
        ].join("\n");
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },
    {
      name: "call_price_agent" as const,
      label: "call_price_agent",
      description: "Hire PriceMonitorAgent via A2A payment (1.5 USDC).",
      parameters: Type.Object({ token: Type.String() }),
      execute: async (_id: string, { token }: { token: string }) => {
        const lines: string[] = [];
        if (env.NODE_PRIVATE_KEY && env.XLAYER_RPC_URL) {
          const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
          const orchestrator = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);
          const payment = await payAgent(orchestrator, "price-agent", "1.5", provider);
          lines.push(payment.paid ? `Payment confirmed: ${payment.txHash}` : `Payment skipped: ${payment.reason}`);
        } else {
          lines.push("NODE_PRIVATE_KEY missing, payment skipped.");
        }
        lines.push(await fetchRealtimePriceTextWithEnv(token, env));
        return { content: [{ type: "text" as const, text: lines.join("\n") }], details: {} };
      },
    },
    {
      name: "call_trade_agent" as const,
      label: "call_trade_agent",
      description: "Hire TradeExecutorAgent via A2A payment (2.5 USDC).",
      parameters: Type.Object({
        token: Type.String(),
        price: Type.Number(),
        condition: Type.String(),
      }),
      execute: async (_id: string, { token, price, condition }: { token: string; price: number; condition: string }) => {
        const lines: string[] = [];
        if (env.NODE_PRIVATE_KEY && env.XLAYER_RPC_URL) {
          const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
          const orchestrator = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);
          const payment = await payAgent(orchestrator, "trade-agent", "2.5", provider);
          lines.push(payment.paid ? `Payment confirmed: ${payment.txHash}` : `Payment skipped: ${payment.reason}`);
        } else {
          lines.push("NODE_PRIVATE_KEY missing, payment skipped.");
        }
        const cond = condition.toLowerCase();
        let action = "HOLD";
        if ((cond.includes(">") || cond.includes("above")) && price > 3000) action = "BUY";
        if ((cond.includes("<") || cond.includes("below")) && price < 3000) action = "SELL";
        lines.push(`Decision: ${action} for ${token.toUpperCase()} @ ${price}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { action } };
      },
    },
    {
      name: "write_note" as const,
      label: "write_note",
      description: "Save a note in persistent workspace.",
      parameters: Type.Object({ filename: Type.String(), content: Type.String() }),
      execute: async (_id: string, { filename, content }: { filename: string; content: string }) => {
        await store.put(filename, content);
        return { content: [{ type: "text" as const, text: `Saved ${filename}` }], details: {} };
      },
    },
    {
      name: "read_note" as const,
      label: "read_note",
      description: "Read note from workspace.",
      parameters: Type.Object({ filename: Type.String() }),
      execute: async (_id: string, { filename }: { filename: string }) => {
        const text = await store.get(filename);
        if (!text) throw new Error(`File not found: ${filename}`);
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },
    {
      name: "list_notes" as const,
      label: "list_notes",
      description: "List saved files in workspace.",
      parameters: Type.Object({}),
      execute: async () => {
        const files = await store.list();
        return { content: [{ type: "text" as const, text: files.length ? files.join("\n") : "(empty workspace)" }], details: {} };
      },
    },
  ];
}

function createWorkspaceFileTools(store: DOFileStore): any[] {
  return [
    {
      name: "read",
      label: "read",
      description: "Read a file from the workspace.",
      parameters: readSchema,
      execute: async (_id: string, { path, offset, limit }: { path: string; offset?: number; limit?: number }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        const content = await store.get(key);
        if (content === undefined) throw new Error(`File not found: ${key}`);
        const start = Math.max(0, Math.floor(offset ?? 0));
        const max = limit === undefined ? undefined : Math.max(1, Math.floor(limit));
        const lines = content.split("\n");
        const slice = max === undefined ? lines.slice(start) : lines.slice(start, start + max);
        return { content: [{ type: "text" as const, text: slice.join("\n") }], details: { path: key, offset: start, limit: max } };
      },
    },
    {
      name: "write",
      label: "write",
      description: "Write text content to a workspace file.",
      parameters: writeSchema,
      execute: async (_id: string, { path, content }: { path: string; content: string }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        await store.put(key, content);
        return { content: [{ type: "text" as const, text: `Wrote ${content.length} bytes to ${key}` }], details: {} };
      },
    },
    {
      name: "edit",
      label: "edit",
      description: "Edit text in a workspace file by replacing oldText with newText once.",
      parameters: editSchema,
      execute: async (_id: string, { path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        const current = await store.get(key);
        if (current === undefined) throw new Error(`File not found: ${key}`);
        const idx = current.indexOf(oldText);
        if (idx === -1) throw new Error(`oldText not found in ${key}`);
        const next = `${current.slice(0, idx)}${newText}${current.slice(idx + oldText.length)}`;
        await store.put(key, next);
        return { content: [{ type: "text" as const, text: `Edited ${key}` }], details: {} };
      },
    },
    {
      name: "ls",
      label: "ls",
      description: "List files and directories under a workspace path.",
      parameters: lsSchema,
      execute: async (_id: string, { path }: { path?: string }) => {
        const clean = path ? sanitizePath(path) : "";
        const prefix = clean ? `${clean}/` : "";
        const entries = new Set<string>();
        for (const key of await store.list()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          if (!rest) continue;
          const slashIdx = rest.indexOf("/");
          entries.add(slashIdx === -1 ? rest : `${rest.slice(0, slashIdx)}/`);
        }
        const list = [...entries].sort((a, b) => a.localeCompare(b));
        return { content: [{ type: "text" as const, text: list.length ? list.join("\n") : "(empty)" }], details: {} };
      },
    },
  ];
}

function createLocalExecuteTool(loader: WorkerLoader, store: DOFileStore, env: Env): any {
  return {
    name: "execute",
    label: "execute",
    description: "Execute JavaScript in an isolated worker sandbox.",
    parameters: executeSchema,
    execute: async (_id: string, { code, file }: { code?: string; file?: string }) => {
      if (!code && !file) throw new Error("Provide either 'code' or 'file'");
      const helperNames = ["readFile", "writeFile", "listFiles"];
      const helpers = {
        readFile: async (path: string) => {
          const key = sanitizePath(path);
          const content = await store.get(key);
          if (content === undefined) throw new Error(`File not found: ${key}`);
          return content;
        },
        writeFile: async (path: string, content: string) => {
          const key = sanitizePath(path);
          await store.put(key, String(content));
          return `Wrote ${String(content).length} bytes to ${key}`;
        },
        listFiles: async (path = ".") => {
          const clean = path === "." || path === "/" ? "" : sanitizePath(path);
          const prefix = clean ? `${clean}/` : "";
          const entries = new Set<string>();
          for (const key of await store.list()) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            if (!rest) continue;
            const slashIdx = rest.indexOf("/");
            entries.add(slashIdx === -1 ? rest : `${rest.slice(0, slashIdx)}/`);
          }
          return [...entries].sort((a, b) => a.localeCompare(b));
        },
      };

      let userCode = code || "";
      if (file) {
        const key = sanitizePath(file);
        const content = await store.get(key);
        if (content === undefined) throw new Error(`File not found: ${key}`);
        userCode = content;
      }

      if (!MODULE_SYNTAX_RE.test(userCode)) {
        userCode = `export default async function({ ${helperNames.join(", ")} }) {\n${userCode}\n}`;
      }

      const modules = {
        "main.js": EXECUTE_ENTRYPOINT,
        "user-code.js": userCode,
      };
      const id = `exec-${Date.now()}-${crypto.randomUUID()}`;
      const stub = loader.get(`sandbox-${id}`, () => ({
        compatibilityDate: "2025-06-01",
        compatibilityFlags: ["nodejs_compat"],
        mainModule: "main.js",
        modules,
        ...(env.OUTBOUND ? { globalOutbound: env.OUTBOUND } : {}),
        env: env.OUTBOUND ? { OUTBOUND: env.OUTBOUND } : {},
      }));
      const runner = stub.getEntrypoint("Runner");
      const result = await Promise.race([
        runner.run(helpers),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Execution timed out after 60000ms")), 60_000)),
      ]);
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text" as const, text: text || "(no return value)" }], details: {} };
    },
  };
}

function buildAgentTools(store: DOFileStore, env: Env): any[] {
  const customTools: any[] = [
    ...createWorkspaceFileTools(store),
    ...buildBusinessTools(store, env),
  ];

  if (env.LOADER) {
    customTools.push(createLocalExecuteTool(env.LOADER as WorkerLoader, store, env));
  }
  return customTools;
}

function seedMessagesFromHistory(history: Array<{ role: string; content: string; ts: number }>): StoredMessage[] {
  return history.map((entry) => ({
    role: entry.role,
    content: [{ type: "text", text: entry.content }],
    ts: entry.ts,
    id: crypto.randomUUID(),
  }));
}

export class AgentSession {
  private readonly sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        role    TEXT NOT NULL,
        content TEXT NOT NULL,
        ts      INTEGER NOT NULL
      );
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pi_state (
        id      INTEGER PRIMARY KEY CHECK(id = 1),
        state   TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      const { message } = (await request.json()) as { message: string };
      const reply = await this.chat(message);
      return cors(Response.json({ response: reply }));
    }

    if (url.pathname === "/history" && request.method === "GET") {
      return cors(Response.json({ history: this.loadHistory() }));
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      this.sql.exec("DELETE FROM history");
      this.sql.exec("DELETE FROM pi_state");
      return cors(Response.json({ ok: true }));
    }

    if (url.pathname === "/info" && request.method === "GET") {
      return cors(Response.json({
        model: this.env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL,
        gateway: `${this.env.CF_ACCOUNT_ID}/${this.env.CF_GATEWAY_NAME}`,
        messages: this.loadHistory().length,
      }));
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let data: { type: string; content?: string };
    try { data = JSON.parse(message); }
    catch { ws.send(JSON.stringify({ type: "error", content: "Invalid JSON" })); return; }

    if (data.type === "message" && data.content) {
      ws.send(JSON.stringify({ type: "start" }));
      try {
        const reply = await this.chat(data.content);
        ws.send(JSON.stringify({ type: "delta", content: reply }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", content: err instanceof Error ? err.message : String(err) }));
      } finally {
        ws.send(JSON.stringify({ type: "end" }));
      }
    } else if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (data.type === "clear") {
      this.sql.exec("DELETE FROM history");
      this.sql.exec("DELETE FROM pi_state");
      ws.send(JSON.stringify({ type: "cleared" }));
    }
  }

  async webSocketClose(): Promise<void> {}
  async webSocketError(_ws: WebSocket, err: unknown): Promise<void> {
    console.error("[AgentSession] WS error:", err);
  }

  private async fallbackGatewayReply(userMessage: string): Promise<string | null> {
    try {
      const modelId = this.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL;
      const endpoint = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(this.env.CF_ACCOUNT_ID)}/${encodeURIComponent(this.env.CF_GATEWAY_NAME)}/compat/chat/completions`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.env.CF_GATEWAY_TOKEN ? { Authorization: `Bearer ${this.env.CF_GATEWAY_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          model: modelId,
          max_tokens: 1200,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return `Gateway fallback failed (${res.status}): ${text.slice(0, 240)}`;
      }
      const completion = await res.json() as {
        result?: { choices?: Array<{ message?: { content?: string | null } }> };
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = completion.result?.choices?.[0]?.message?.content
        || completion.choices?.[0]?.message?.content
        || "";
      return content.trim() ? content : null;
    } catch {
      return null;
    }
  }

  private async chat(userMessage: string): Promise<string> {
    const store = new DOFileStore(this.sql);
    const persistedState = this.loadPersistedPiState();
    const history = this.loadHistory().slice(-20);
    const directPriceToken = extractRealtimePriceToken(userMessage);
    if (directPriceToken) {
      this.saveMsg("user", userMessage);
      try {
        const realtime = await fetchRealtimePriceTextWithEnv(directPriceToken, this.env);
        this.saveMsg("assistant", realtime);
        this.persistHistoryToPiState(persistedState);
        return realtime;
      } catch (error) {
        const message = `Realtime price unavailable for ${directPriceToken}: ${error instanceof Error ? error.message : String(error)}`;
        this.saveMsg("assistant", message);
        this.persistHistoryToPiState(persistedState);
        return message;
      }
    }

    const model = buildGatewayModel(this.env, persistedState?.model);
    const apiKey = this.env.CF_GATEWAY_TOKEN?.trim() || "cf-gateway-token-not-required";
    const messages = persistedState?.messages?.length
      ? persistedState.messages
      : seedMessagesFromHistory(history);
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: (persistedState?.thinkingLevel as any) || "medium",
        tools: buildAgentTools(store, this.env),
        messages: messages as any[],
      },
      streamFn: (m, context, options) => streamSimpleOpenAICompletions(m as any, context, {
        ...options,
        apiKey,
      }),
    });

    this.saveMsg("user", userMessage);
    try {
      await agent.prompt(userMessage);
    } catch (error) {
      const fallback = await this.fallbackGatewayReply(userMessage);
      const message = fallback || `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`;
      this.saveMsg("assistant", message);
      this.persistPiState(agent);
      return message;
    }

    const assistantMsgs = (agent.state.messages as any[]).filter((m) => m.role === "assistant");
    let response = "";
    for (let i = assistantMsgs.length - 1; i >= 0; i--) {
      const msg = assistantMsgs[i];
      const text = Array.isArray(msg?.content)
        ? msg.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("")
        : (typeof msg?.content === "string" ? msg.content : "");
      if (text.trim()) {
        response = text;
        break;
      }
    }

    if (!response.trim()) {
      const fallback = await this.fallbackGatewayReply(userMessage);
      response = fallback || "Agent returned an empty response. Check model/gateway credentials.";
    }

    this.saveMsg("assistant", response);
    this.persistPiState(agent);
    return response;
  }

  private loadPersistedPiState(): PersistedPiState | undefined {
    const rows = [...this.sql.exec("SELECT state FROM pi_state WHERE id = 1")];
    if (rows.length === 0) return undefined;
    try { return JSON.parse(rows[0].state as string) as PersistedPiState; }
    catch { return undefined; }
  }

  private persistPiState(agent: Agent): void {
    const model = agent.state.model;
    const state: PersistedPiState = {
      messages: agent.state.messages,
      model: model ? { provider: model.provider, id: model.id } : undefined,
      thinkingLevel: agent.state.thinkingLevel,
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO pi_state (id, state, updated) VALUES (1, ?, ?)",
      JSON.stringify(state), Date.now()
    );
  }

  private persistHistoryToPiState(existing?: PersistedPiState): void {
    const state: PersistedPiState = {
      messages: seedMessagesFromHistory(this.loadHistory().slice(-40)),
      model: existing?.model || {
        provider: "ai-gateway",
        id: this.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL,
      },
      thinkingLevel: existing?.thinkingLevel || "medium",
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO pi_state (id, state, updated) VALUES (1, ?, ?)",
      JSON.stringify(state), Date.now()
    );
  }

  private loadHistory(): Array<{ role: string; content: string; ts: number }> {
    return [...this.sql.exec("SELECT role, content, ts FROM history ORDER BY id")].map(
      (r) => ({ role: r.role as string, content: r.content as string, ts: r.ts as number })
    );
  }

  private saveMsg(role: string, content: string): void {
    this.sql.exec(
      "INSERT INTO history (role, content, ts) VALUES (?, ?, ?)",
      role, content, Date.now()
    );
  }
}

const SYSTEM_PROMPT = `You are Gradience Orchestrator — an autonomous AI agent on X Layer.

Use tools to analyze prices, evaluate conditions, prepare trades, and manage workspace files.
When users ask for token price or realtime market data, always call fetch_price and never fabricate values.
For multi-step workflows requiring paid delegation, use call_price_agent.
Be concise and technically precise.`;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function cors(r: Response): Response {
  const h = new Headers(r.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => h.set(k, v));
  return new Response(r.body, { status: r.status, headers: h });
}
