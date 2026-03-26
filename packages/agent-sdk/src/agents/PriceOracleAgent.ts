/**
 * PriceOracleAgent — Real-time crypto price oracle with on-chain payment.
 *
 * Fee: 0.001 OKB per call
 * Flow: payAgent(orchestrator → agentWallet, 0.001 OKB) → fetch Binance → return price + txHash
 *
 * All payments verifiable on X Layer Explorer.
 */

import { ethers } from "ethers";
import { AgentX } from "../core/AgentX";

export interface PriceResult {
  symbol: string;
  price: number;
  source: "binance" | "coingecko";
  timestamp: number;
  // On-chain payment proof
  payment: {
    txHash: string;
    blockNumber: number;
    amount: string;
    from: string;
    agentAddress: string;
  };
}

export class PriceOracleAgent extends AgentX {
  constructor(masterKey: string, provider: ethers.JsonRpcProvider) {
    super(masterKey, "price-oracle", { perCall: "0.001", currency: "OKB" }, provider);
  }

  protected getCapabilities() {
    return ["fetch_price", "multi_token_price", "price_history"];
  }

  /**
   * Get live price with on-chain payment.
   *
   * @param callerAddress - Caller's address (pays 0.001 OKB)
   * @param symbol - Token symbol e.g. "ETH", "BTC", "OKB"
   */
  async getPrice(callerAddress: string, symbol: string): Promise<PriceResult> {
    // 1. Collect fee (real on-chain transfer)
    const fee = await this.collectFee(callerAddress);

    // 2. Fetch live price from Binance
    const { price, source } = await this.fetchPrice(symbol);

    return {
      symbol: symbol.toUpperCase(),
      price,
      source,
      timestamp: Date.now(),
      payment: {
        txHash: fee.txHash,
        blockNumber: fee.blockNumber,
        amount: fee.amount,
        from: callerAddress,
        agentAddress: this.wallet.address,
      },
    };
  }

  /**
   * Direct price fetch (no payment) — for internal A2A calls where Orchestrator
   * already paid this agent via payAgent() separately.
   */
  async getPriceDirect(symbol: string): Promise<{ price: number; symbol: string; source: string }> {
    const { price, source } = await this.fetchPrice(symbol);
    return { price, symbol: symbol.toUpperCase(), source };
  }

  /**
   * Get multiple prices in one call (caller pays once).
   */
  async getMultiplePrices(
    callerAddress: string,
    symbols: string[]
  ): Promise<{ prices: Record<string, number>; payment: { txHash: string; amount: string } }> {
    const fee = await this.collectFee(callerAddress, "0.001");
    const prices: Record<string, number> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        const { price } = await this.fetchPrice(sym);
        prices[sym.toUpperCase()] = price;
      })
    );

    return {
      prices,
      payment: { txHash: fee.txHash, amount: fee.amount },
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async fetchPrice(symbol: string): Promise<{ price: number; source: "binance" | "coingecko" }> {
    const ticker = symbol.toUpperCase();

    // Primary: Binance
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${ticker}USDT`);
      if (res.ok) {
        const data = await res.json() as { price: string };
        return { price: parseFloat(data.price), source: "binance" };
      }
    } catch { /* fallthrough */ }

    // Fallback: CoinGecko
    const cgMap: Record<string, string> = {
      ETH: "ethereum", BTC: "bitcoin",
      BNB: "binancecoin", AVAX: "avalanche-2",
    };
    const cgId = cgMap[ticker];
    if (cgId) {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
      if (res.ok) {
        const data = await res.json() as Record<string, { usd: number }>;
        return { price: data[cgId]?.usd || 0, source: "coingecko" };
      }
    }

    throw new Error(`Could not fetch price for ${ticker}`);
  }
}
