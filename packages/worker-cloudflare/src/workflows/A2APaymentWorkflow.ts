/**
 * A2APaymentWorkflow — Cloudflare Workflow for atomic A2A payment execution.
 *
 * Uses native OKB (X Layer gas token) for all payments — no ERC-20 approve needed.
 *
 * Steps:
 *   1. validate     — derive agent addresses via SDK
 *   2. price_query  — orchestrator.payAgent(→ priceOracle, 0.001 OKB) + fetch price
 *   3. strategy     — (conditional) orchestrator.payAgent(→ tradeStrategy, 0.005 OKB) + analyze
 *   4. refund       — orchestrator sends remaining OKB back to caller
 *
 * Each step is retried independently by Cloudflare on failure.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { ethers } from "ethers";
import { WorkflowOrchestrator } from "@agentx/agent-sdk";
import { PriceOracleAgent } from "@agentx/agent-sdk";
import { TradeStrategyAgent } from "@agentx/agent-sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface A2AWorkflowParams {
  symbol: string;
  budget: number;
  callerAddress: string;
  type?: "price_only" | "price_alert" | "auto_trade";
  condition?: string;
  threshold?: number;
  riskLevel?: "low" | "medium" | "high";
}

export interface A2AWorkflowResult {
  status: "completed" | "partial" | "failed";
  symbol: string;
  currentPrice: number;
  priceSource: string;
  conditionMet?: boolean;
  action?: "BUY" | "SELL" | "HOLD";
  totalSpent: string;
  refunded: string;
  payments: PaymentRecord[];
  explorerBase: string;
}

interface PaymentRecord {
  step: string;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
}

interface WalletAddresses {
  orchestrator: string;
  priceOracle: string;
  tradeStrategy: string;
}

interface Env {
  NODE_PRIVATE_KEY: string;
  XLAYER_RPC_URL: string;
}

const EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

// ─── Workflow ─────────────────────────────────────────────────────────────────

export class A2APaymentWorkflow extends WorkflowEntrypoint<Env, A2AWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<A2AWorkflowParams>>,
    step: WorkflowStep
  ): Promise<A2AWorkflowResult> {
    const params = event.payload;
    const payments: PaymentRecord[] = [];

    // ── Step 1: Validate + derive addresses via SDK ───────────────────────────
    const addresses: WalletAddresses = await step.do("validate", async () => {
      if (!this.env.NODE_PRIVATE_KEY) throw new Error("NODE_PRIVATE_KEY not configured");
      if (!params.callerAddress) throw new Error("callerAddress is required");

      const provider = new ethers.JsonRpcProvider(this.env.XLAYER_RPC_URL);
      const orchestrator = new WorkflowOrchestrator(this.env.NODE_PRIVATE_KEY, provider);
      const priceAgent   = new PriceOracleAgent(this.env.NODE_PRIVATE_KEY, provider);
      const tradeAgent   = new TradeStrategyAgent(this.env.NODE_PRIVATE_KEY, provider);

      // Verify orchestrator has enough OKB
      const balance = await orchestrator.getBalance();
      if (parseFloat(balance) < 0.02) {
        throw new Error(`Orchestrator OKB balance too low: ${balance}. Need at least 0.02 OKB`);
      }

      return {
        orchestrator:  orchestrator.getAddress(),
        priceOracle:   priceAgent.getAddress(),
        tradeStrategy: tradeAgent.getAddress(),
      };
    });

    // ── Step 2: Pay PriceOracleAgent (A2A) + fetch price via SDK ─────────────
    const priceResult = await step.do(
      "price_query",
      { retries: { limit: 3, delay: "3 seconds" } },
      async () => {
        const provider = new ethers.JsonRpcProvider(this.env.XLAYER_RPC_URL);
        const orchestrator = new WorkflowOrchestrator(this.env.NODE_PRIVATE_KEY, provider);
        const priceAgent   = new PriceOracleAgent(this.env.NODE_PRIVATE_KEY, provider);

        // A2A: Orchestrator → PriceOracleAgent (0.001 OKB)
        const fee = await orchestrator.payAgent(addresses.priceOracle, "0.001");

        // PriceOracleAgent fetches live price (Binance → CoinGecko fallback)
        const { price, source } = await priceAgent.getPriceDirect(params.symbol);

        return { txHash: fee.txHash, blockNumber: fee.blockNumber, price, source };
      }
    );

    payments.push({
      step: "Orchestrator → PriceOracleAgent: A2A payment",
      from: addresses.orchestrator,
      to: addresses.priceOracle,
      amount: "0.001 OKB",
      txHash: priceResult.txHash,
      blockNumber: priceResult.blockNumber,
      explorerUrl: `${EXPLORER}/${priceResult.txHash}`,
    });

    // ── Step 3 (conditional): Pay TradeStrategyAgent (A2A) + get strategy ────
    let action: "BUY" | "SELL" | "HOLD" | undefined;
    let conditionMet: boolean | undefined;
    let totalSpent = 0.001;

    if (params.type !== "price_only") {
      const threshold = params.threshold ?? 0;
      conditionMet = threshold > 0 ? priceResult.price > threshold : true;

      if (conditionMet) {
        const tradeResult = await step.do(
          "strategy",
          { retries: { limit: 2, delay: "5 seconds" } },
          async () => {
            const provider = new ethers.JsonRpcProvider(this.env.XLAYER_RPC_URL);
            const orchestrator = new WorkflowOrchestrator(this.env.NODE_PRIVATE_KEY, provider);
            const tradeAgent   = new TradeStrategyAgent(this.env.NODE_PRIVATE_KEY, provider);

            // A2A: Orchestrator → TradeStrategyAgent (0.005 OKB)
            const fee = await orchestrator.payAgent(addresses.tradeStrategy, "0.005");

            // TradeStrategyAgent analyzes strategy
            const analysis = await tradeAgent.analyzeStrategyDirect({
              holdings: [params.symbol],
              currentPrices: { [params.symbol.toUpperCase()]: priceResult.price },
              riskLevel: params.riskLevel || "medium",
              condition: params.condition,
            });

            return {
              txHash: fee.txHash,
              blockNumber: fee.blockNumber,
              action: analysis.action,
              strategy: analysis.strategy,
              confidence: analysis.confidence,
            };
          }
        );

        payments.push({
          step: "Orchestrator → TradeStrategyAgent: A2A payment",
          from: addresses.orchestrator,
          to: addresses.tradeStrategy,
          amount: "0.005 OKB",
          txHash: tradeResult.txHash,
          blockNumber: tradeResult.blockNumber,
          explorerUrl: `${EXPLORER}/${tradeResult.txHash}`,
        });

        action = tradeResult.action;
        totalSpent += 0.005;
      }
    }

    // ── Step 4: Refund remaining balance to caller via SDK ────────────────────
    const refundResult = await step.do(
      "refund",
      { retries: { limit: 3, delay: "5 seconds" } },
      async () => {
        const provider = new ethers.JsonRpcProvider(this.env.XLAYER_RPC_URL);
        const orchestrator = new WorkflowOrchestrator(this.env.NODE_PRIVATE_KEY, provider);

        const refund = await orchestrator.refundAll(params.callerAddress);
        if (!refund) return { refunded: "0", txHash: "", blockNumber: 0 };

        return { refunded: refund.amount, txHash: refund.txHash, blockNumber: refund.blockNumber };
      }
    );

    if (refundResult.txHash) {
      payments.push({
        step: "Orchestrator → User: refund unspent OKB",
        from: addresses.orchestrator,
        to: params.callerAddress,
        amount: `${refundResult.refunded} OKB`,
        txHash: refundResult.txHash,
        blockNumber: refundResult.blockNumber,
        explorerUrl: `${EXPLORER}/${refundResult.txHash}`,
      });
    }

    return {
      status: "completed",
      symbol: params.symbol.toUpperCase(),
      currentPrice: priceResult.price,
      priceSource: priceResult.source,
      conditionMet,
      action,
      totalSpent: totalSpent.toFixed(4),
      refunded: refundResult.refunded,
      payments,
      explorerBase: EXPLORER,
    };
  }
}
