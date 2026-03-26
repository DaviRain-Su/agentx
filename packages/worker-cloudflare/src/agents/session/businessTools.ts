import { Type } from "@sinclair/typebox";
import { ethers } from "ethers";
import type { Env } from "../../index";
import { fetchRealtimePriceTextWithEnv } from "./pricing";
import { DOFileStore } from "./store";
import { payAgent } from "./payment";

const EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

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
      description: "Hire PriceMonitorAgent via A2A payment (0.001 OKB on X Layer).",
      parameters: Type.Object({ token: Type.String() }),
      execute: async (_id: string, { token }: { token: string }) => {
        const lines: string[] = [];
        if (env.NODE_PRIVATE_KEY && env.XLAYER_RPC_URL) {
          const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
          const seed = ethers.keccak256(ethers.toUtf8Bytes(`${env.NODE_PRIVATE_KEY}:orchestrator`));
          const orchestrator = new ethers.Wallet(seed, provider);
          const payment = await payAgent(orchestrator, "price-oracle", "0.001", provider);
          lines.push(payment.paid
            ? `✅ A2A Payment confirmed: ${payment.txHash}\n   Explorer: ${EXPLORER}/${payment.txHash}`
            : `⚠️ Payment skipped: ${payment.reason}`);
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
      description: "Hire TradeStrategyAgent via A2A payment (0.005 OKB on X Layer).",
      parameters: Type.Object({
        token: Type.String(),
        price: Type.Number(),
        condition: Type.String(),
      }),
      execute: async (_id: string, { token, price, condition }: { token: string; price: number; condition: string }) => {
        const lines: string[] = [];
        if (env.NODE_PRIVATE_KEY && env.XLAYER_RPC_URL) {
          const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
          const seed = ethers.keccak256(ethers.toUtf8Bytes(`${env.NODE_PRIVATE_KEY}:orchestrator`));
          const orchestrator = new ethers.Wallet(seed, provider);
          const payment = await payAgent(orchestrator, "trade-strategy", "0.005", provider);
          lines.push(payment.paid
            ? `✅ A2A Payment confirmed: ${payment.txHash}\n   Explorer: ${EXPLORER}/${payment.txHash}`
            : `⚠️ Payment skipped: ${payment.reason}`);
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
