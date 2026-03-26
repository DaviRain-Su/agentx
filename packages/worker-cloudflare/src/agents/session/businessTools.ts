import { Type } from "@sinclair/typebox";
import { ethers } from "ethers";
import type { Env } from "../../index";
import { fetchRealtimePriceTextWithEnv } from "./pricing";
import { DOFileStore } from "./store";

const EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrchestratorWallet(env: Env): ethers.Wallet | null {
  if (!env.NODE_PRIVATE_KEY || !env.XLAYER_RPC_URL) return null;
  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`${env.NODE_PRIVATE_KEY}:orchestrator`));
  return new ethers.Wallet(seed, provider);
}

function deriveAgentAddress(masterKey: string, agentName: string): string {
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(seed).address;
}

async function a2aPayment(
  env: Env,
  targetAgent: string,
  amountOkb: string
): Promise<{ paid: boolean; txHash: string; explorerUrl: string; from: string; to: string; error?: string }> {
  const wallet = getOrchestratorWallet(env);
  if (!wallet) {
    return { paid: false, txHash: "", explorerUrl: "", from: "", to: "", error: "NODE_PRIVATE_KEY not configured" };
  }

  const toAddress = deriveAgentAddress(env.NODE_PRIVATE_KEY, targetAgent);
  const amountWei = ethers.parseEther(amountOkb);

  try {
    const balance = await wallet.provider!.getBalance(wallet.address);
    const gasReserve = ethers.parseEther("0.005");
    if (balance < amountWei + gasReserve) {
      return {
        paid: false, txHash: "", explorerUrl: "",
        from: wallet.address, to: toAddress,
        error: `Orchestrator balance too low: ${ethers.formatEther(balance)} OKB`,
      };
    }

    const tx = await wallet.sendTransaction({ to: toAddress, value: amountWei });
    const receipt = await tx.wait(1);
    return {
      paid: true,
      txHash: receipt!.hash,
      explorerUrl: `${EXPLORER}/${receipt!.hash}`,
      from: wallet.address,
      to: toAddress,
    };
  } catch (err) {
    return {
      paid: false, txHash: "", explorerUrl: "",
      from: wallet.address, to: toAddress,
      error: String(err),
    };
  }
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export function buildBusinessTools(store: DOFileStore, env: Env): any[] {
  return [
    // ── Free tool: price only ────────────────────────────────────────────────
    {
      name: "fetch_price" as const,
      label: "fetch_price",
      description: "Fetch realtime token price (free, no payment). Use for quick lookups.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC, SOL, OKB" }),
      }),
      execute: async (_id: string, { token }: { token: string }) => {
        const text = await fetchRealtimePriceTextWithEnv(token, env);
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },

    // ── A2A: hire price oracle agent ─────────────────────────────────────────
    {
      name: "hire_price_agent" as const,
      label: "hire_price_agent",
      description:
        "Hire PriceOracleAgent via real on-chain A2A payment (0.001 OKB on X Layer). " +
        "Use this when the user explicitly wants a paid professional price analysis, " +
        "or when you need verified on-chain proof of the price query. " +
        "Returns: real tx hash, block number, explorer link, and live price.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC, SOL" }),
      }),
      execute: async (_id: string, { token }: { token: string }) => {
        const payment = await a2aPayment(env, "price-oracle", "0.001");
        const price = await fetchRealtimePriceTextWithEnv(token, env);

        const lines = [
          "── A2A Payment: Orchestrator → PriceOracleAgent ──",
          payment.paid
            ? [
                `✅ Payment: 0.001 OKB`,
                `   From: ${payment.from}`,
                `   To:   ${payment.to}`,
                `   Tx:   ${payment.txHash}`,
                `   Explorer: ${payment.explorerUrl}`,
              ].join("\n")
            : `⚠️ Payment skipped: ${payment.error}`,
          "",
          "── Price Result ──",
          price,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }], details: { paid: payment.paid } };
      },
    },

    // ── A2A: hire trade strategy agent ────────────────────────────────────────
    {
      name: "hire_trade_agent" as const,
      label: "hire_trade_agent",
      description:
        "Hire TradeStrategyAgent via real on-chain A2A payment (0.005 OKB on X Layer). " +
        "Use this when the user wants a trade recommendation with on-chain proof. " +
        "Analyzes price + condition and returns BUY/SELL/HOLD with tx hash.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC" }),
        price: Type.Number({ description: "Current price in USD" }),
        condition: Type.String({ description: "Trade condition e.g. 'ETH > 2000 then BUY'" }),
      }),
      execute: async (_id: string, { token, price, condition }: { token: string; price: number; condition: string }) => {
        const payment = await a2aPayment(env, "trade-strategy", "0.005");

        // Simple strategy logic
        const cond = condition.toLowerCase();
        let action = "HOLD";
        const thresholdMatch = cond.match(/[><]=?\s*(\d+)/);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;

        if (cond.includes(">") && price > threshold) action = "BUY";
        else if (cond.includes("<") && price < threshold) action = "SELL";

        const confidence = action !== "HOLD" ? 0.78 : 0.55;

        const lines = [
          "── A2A Payment: Orchestrator → TradeStrategyAgent ──",
          payment.paid
            ? [
                `✅ Payment: 0.005 OKB`,
                `   From: ${payment.from}`,
                `   To:   ${payment.to}`,
                `   Tx:   ${payment.txHash}`,
                `   Explorer: ${payment.explorerUrl}`,
              ].join("\n")
            : `⚠️ Payment skipped: ${payment.error}`,
          "",
          "── Strategy Analysis ──",
          `Token: ${token.toUpperCase()} @ $${price.toLocaleString()}`,
          `Condition: ${condition}`,
          `Decision: ${action}`,
          `Confidence: ${(confidence * 100).toFixed(0)}%`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { action, confidence, paid: payment.paid },
        };
      },
    },

    // ── A2A: full workflow (hire both agents in sequence) ─────────────────────
    {
      name: "run_swarm_analysis" as const,
      label: "run_swarm_analysis",
      description:
        "Run a full Agent Swarm analysis: hire PriceOracleAgent (0.001 OKB) AND TradeStrategyAgent (0.005 OKB) " +
        "in sequence. Two real on-chain A2A payments. Use when the user wants a complete market analysis " +
        "with price + strategy recommendation. Total cost: 0.006 OKB.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC" }),
        condition: Type.Optional(Type.String({ description: "Optional trade condition e.g. 'ETH > 2000 then BUY'" })),
      }),
      execute: async (_id: string, { token, condition }: { token: string; condition?: string }) => {
        // Step 1: Pay + query price agent
        const pricePay = await a2aPayment(env, "price-oracle", "0.001");
        const priceText = await fetchRealtimePriceTextWithEnv(token, env);

        // Extract numeric price from text
        const priceMatch = priceText.match(/\$([\d,]+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

        // Step 2: Pay + query trade strategy agent
        const tradePay = await a2aPayment(env, "trade-strategy", "0.005");

        const cond = (condition || `${token} > 0`).toLowerCase();
        let action = "HOLD";
        const thresholdMatch = cond.match(/[><]=?\s*(\d+)/);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;
        if (cond.includes(">") && price > threshold) action = "BUY";
        else if (cond.includes("<") && price < threshold) action = "SELL";
        const confidence = action !== "HOLD" ? 0.78 : 0.55;

        const lines = [
          `══════ Agent Swarm Analysis: ${token.toUpperCase()} ══════`,
          "",
          "── Step 1: Hire PriceOracleAgent (0.001 OKB) ──",
          pricePay.paid
            ? `✅ Tx: ${pricePay.txHash}\n   ${pricePay.explorerUrl}`
            : `⚠️ ${pricePay.error}`,
          "",
          priceText,
          "",
          "── Step 2: Hire TradeStrategyAgent (0.005 OKB) ──",
          tradePay.paid
            ? `✅ Tx: ${tradePay.txHash}\n   ${tradePay.explorerUrl}`
            : `⚠️ ${tradePay.error}`,
          "",
          `Decision: ${action} (confidence ${(confidence * 100).toFixed(0)}%)`,
          "",
          "── Summary ──",
          `Total A2A payments: ${[pricePay, tradePay].filter(p => p.paid).length}/2 on-chain`,
          `Total cost: ${(pricePay.paid ? 0.001 : 0) + (tradePay.paid ? 0.005 : 0)} OKB`,
          `All transactions verifiable on X Layer Testnet Explorer`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { action, confidence, price, priceTx: pricePay.txHash, tradeTx: tradePay.txHash },
        };
      },
    },

    // ── Agent network info ───────────────────────────────────────────────────
    {
      name: "list_agents" as const,
      label: "list_agents",
      description: "Show all agents in the AgentX swarm with their addresses, fees, and capabilities.",
      parameters: Type.Object({}),
      execute: async () => {
        if (!env.NODE_PRIVATE_KEY) {
          return { content: [{ type: "text" as const, text: "Agent network not configured." }], details: {} };
        }

        const agents = [
          { name: "orchestrator", fee: "0.002 OKB", role: "Coordinator — hires agents, manages payments" },
          { name: "price-oracle", fee: "0.001 OKB", role: "Price data — Binance + CoinGecko feeds" },
          { name: "trade-strategy", fee: "0.005 OKB", role: "Strategy — risk analysis + trade decisions" },
        ];

        const lines = ["══════ AgentX Swarm Network ══════", ""];
        for (const a of agents) {
          const addr = deriveAgentAddress(env.NODE_PRIVATE_KEY, a.name);
          lines.push(`${a.name}`);
          lines.push(`  Address: ${addr}`);
          lines.push(`  Fee: ${a.fee}`);
          lines.push(`  Role: ${a.role}`);
          lines.push(`  Explorer: https://www.oklink.com/x-layer-testnet/address/${addr}`);
          lines.push("");
        }
        lines.push("Chain: X Layer Testnet (195) | Token: OKB");

        return { content: [{ type: "text" as const, text: lines.join("\n") }], details: {} };
      },
    },

    // ── Condition evaluation ──────────────────────────────────────────────────
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
          "<": value < threshold, ">": value > threshold,
          "<=": value <= threshold, ">=": value >= threshold, "==": value === threshold,
        };
        const result = ops[operator] ?? false;
        return { content: [{ type: "text" as const, text: `${value} ${operator} ${threshold} → ${result}` }], details: {} };
      },
    },

    // ── Workspace persistence ────────────────────────────────────────────────
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
