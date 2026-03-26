/**
 * WorkflowOrchestrator — Multi-agent A2A payment coordinator.
 *
 * Implements the x402-style A2A payment protocol:
 * 1. Receives user budget (real USDC transferFrom)
 * 2. Pays PriceOracleAgent (0.001 USDC) → gets price
 * 3. If condition met, pays TradeStrategyAgent (0.005 USDC) → gets strategy
 * 4. Returns unspent budget to user
 *
 * Every payment produces a real transaction hash verifiable on X Layer Explorer.
 */

import { ethers } from "ethers";
import { AgentX } from "../core/AgentX";
import { PriceOracleAgent } from "./PriceOracleAgent";
import { TradeStrategyAgent } from "./TradeStrategyAgent";

export interface PaymentRecord {
  step: string;
  from: string;
  to: string;
  agentName?: string;
  amount: string;
  type: "user_to_orchestrator" | "a2a_payment" | "refund";
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
}

export interface WorkflowParams {
  type: "price_alert" | "auto_trade" | "price_only";
  symbol: string;               // e.g. "ETH"
  condition?: string;           // e.g. "ETH > 3000 then BUY"
  threshold?: number;           // e.g. 3000
  holdings?: string[];          // e.g. ["ETH", "BTC"]
  riskLevel?: "low" | "medium" | "high";
  budget: number;               // Total USDC budget
}

export interface WorkflowResult {
  status: "completed" | "partial" | "failed";
  symbol: string;
  currentPrice?: number;
  priceSource?: string;
  conditionMet?: boolean;
  strategy?: string;
  action?: "BUY" | "SELL" | "HOLD";
  confidence?: number;
  // Full A2A payment trail — each entry is a real on-chain tx
  payments: PaymentRecord[];
  totalSpent: string;
  refunded: string;
  summary: string;
}

const XLAYER_EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

export class WorkflowOrchestrator extends AgentX {
  private readonly priceAgent: PriceOracleAgent;
  private readonly tradeAgent: TradeStrategyAgent;

  constructor(masterKey: string, provider: ethers.JsonRpcProvider) {
    // Orchestrator earns 20% commission, passes 80% to specialists
    super(masterKey, "orchestrator", { perCall: "0.002", currency: "USDC" }, provider, {
      owner: 80, platform: 15, stakers: 5,
    });
    this.priceAgent = new PriceOracleAgent(masterKey, provider);
    this.tradeAgent = new TradeStrategyAgent(masterKey, provider);
  }

  protected getCapabilities() {
    return ["coordinate_workflow", "a2a_payment", "hire_agent", "settle_payments"];
  }

  /** PriceOracleAgent's wallet address (for display in UI) */
  getPriceAgentAddress(): string { return this.priceAgent.getAddress(); }

  /** TradeStrategyAgent's wallet address (for display in UI) */
  getTradeAgentAddress(): string { return this.tradeAgent.getAddress(); }

  /**
   * Execute a complete A2A workflow.
   *
   * The caller sends a budget; the Orchestrator:
   * 1. Receives budget (transferFrom)
   * 2. Pays PriceOracleAgent 0.001 USDC via A2A
   * 3. Fetches price using PriceOracleAgent
   * 4. If condition met, pays TradeStrategyAgent 0.005 USDC via A2A
   * 5. Returns unspent budget to caller
   *
   * @param callerAddress - User's wallet address
   * @param params - Workflow parameters
   */
  async executeWorkflow(
    callerAddress: string,
    params: WorkflowParams
  ): Promise<WorkflowResult> {
    const payments: PaymentRecord[] = [];
    let totalSpentWei = 0n;

    // ── Step 1: Receive user budget ──────────────────────────────────────────
    const budgetFee = await this.collectFee(callerAddress, params.budget.toString());
    totalSpentWei = ethers.parseUnits(params.budget.toString(), 6);

    payments.push({
      step: "User → Orchestrator: budget deposit",
      from: callerAddress,
      to: this.wallet.address,
      agentName: "WorkflowOrchestrator",
      amount: params.budget.toString(),
      type: "user_to_orchestrator",
      txHash: budgetFee.txHash,
      blockNumber: budgetFee.blockNumber,
      explorerUrl: `${XLAYER_EXPLORER}/${budgetFee.txHash}`,
    });

    // ── Step 2: Pay PriceOracleAgent (A2A) ──────────────────────────────────
    const priceFee = await this.payAgent(this.priceAgent.getAddress(), "0.001");

    payments.push({
      step: "Orchestrator → PriceOracleAgent: hire for price query",
      from: this.wallet.address,
      to: this.priceAgent.getAddress(),
      agentName: "PriceOracleAgent",
      amount: "0.001",
      type: "a2a_payment",
      txHash: priceFee.txHash,
      blockNumber: priceFee.blockNumber,
      explorerUrl: `${XLAYER_EXPLORER}/${priceFee.txHash}`,
    });

    // ── Step 3: Get price from PriceOracleAgent ──────────────────────────────
    const priceResult = await this.priceAgent.getPriceDirect(params.symbol);

    let spentSoFar = 0.001;
    let strategy: string | undefined;
    let action: "BUY" | "SELL" | "HOLD" | undefined;
    let confidence: number | undefined;
    let conditionMet: boolean | undefined;

    // ── Step 4: Check condition ──────────────────────────────────────────────
    if (params.type !== "price_only") {
      const threshold = params.threshold ?? 0;
      conditionMet = threshold > 0
        ? priceResult.price > threshold
        : true; // no threshold → always proceed

      if (conditionMet) {
        // ── Step 5: Pay TradeStrategyAgent (A2A) ─────────────────────────────
        const tradeFee = await this.payAgent(this.tradeAgent.getAddress(), "0.005");

        payments.push({
          step: "Orchestrator → TradeStrategyAgent: hire for strategy analysis",
          from: this.wallet.address,
          to: this.tradeAgent.getAddress(),
          agentName: "TradeStrategyAgent",
          amount: "0.005",
          type: "a2a_payment",
          txHash: tradeFee.txHash,
          blockNumber: tradeFee.blockNumber,
          explorerUrl: `${XLAYER_EXPLORER}/${tradeFee.txHash}`,
        });

        spentSoFar += 0.005;

        // ── Step 6: Get strategy from TradeStrategyAgent ──────────────────────
        const tradeResult = await this.tradeAgent.analyzeStrategyDirect({
          holdings: params.holdings || [params.symbol],
          currentPrices: { [params.symbol.toUpperCase()]: priceResult.price },
          riskLevel: params.riskLevel || "medium",
          condition: params.condition,
        });

        strategy = tradeResult.strategy;
        action = tradeResult.action;
        confidence = tradeResult.confidence;
      }
    }

    // ── Step 7: Refund unspent budget ────────────────────────────────────────
    const balance = await this.usdc.balanceOf(this.wallet.address);
    let refundedStr = "0";

    if (balance > 0n) {
      const refundTx = await this.usdc.transfer(callerAddress, balance);
      const refundReceipt = await refundTx.wait(1);
      refundedStr = ethers.formatUnits(balance, 6);

      payments.push({
        step: "Orchestrator → User: refund unspent budget",
        from: this.wallet.address,
        to: callerAddress,
        amount: refundedStr,
        type: "refund",
        txHash: refundReceipt.hash,
        blockNumber: refundReceipt.blockNumber,
        explorerUrl: `${XLAYER_EXPLORER}/${refundReceipt.hash}`,
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const summary = [
      `${params.symbol} price: $${priceResult.price.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${priceResult.source})`,
      conditionMet !== undefined ? `Condition met: ${conditionMet ? "YES ✓" : "NO ✗"}` : "",
      action ? `Decision: ${action} (confidence: ${((confidence || 0) * 100).toFixed(0)}%)` : "",
      `Total A2A payments: ${payments.filter(p => p.type === "a2a_payment").length} transactions`,
      `All payments verifiable on X Layer Explorer`,
    ].filter(Boolean).join(" | ");

    return {
      status: "completed",
      symbol: params.symbol.toUpperCase(),
      currentPrice: priceResult.price,
      priceSource: priceResult.source,
      conditionMet,
      strategy,
      action,
      confidence,
      payments,
      totalSpent: spentSoFar.toFixed(4),
      refunded: refundedStr,
      summary,
    };
  }
}
