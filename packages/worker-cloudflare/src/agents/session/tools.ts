import { Type } from "@sinclair/typebox";
import { ethers } from "ethers";
import type { Env } from "../../index";
import { CONTRACTS, USDC_ABI } from "../../config/contracts";
import { editSchema, executeSchema, EXECUTE_ENTRYPOINT, lsSchema, MODULE_SYNTAX_RE, readSchema, writeSchema } from "./constants";
import { sanitizePath } from "./pathUtils";
import { fetchRealtimePriceTextWithEnv } from "./pricing";
import { DOFileStore } from "./store";
import type { WorkerLoader } from "./types";

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

export function buildBusinessTools(store: DOFileStore, env: Env): any[] {
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

export function createWorkspaceFileTools(store: DOFileStore): any[] {
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

export function createLocalExecuteTool(loader: WorkerLoader, store: DOFileStore, env: Env): any {
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

export function buildAgentTools(store: DOFileStore, env: Env): any[] {
  const customTools: any[] = [
    ...createWorkspaceFileTools(store),
    ...buildBusinessTools(store, env),
  ];

  if (env.LOADER) {
    customTools.push(createLocalExecuteTool(env.LOADER as WorkerLoader, store, env));
  }
  return customTools;
}
