/**
 * PriceMonitorAgent - Monitor token prices
 */

import { Env } from "../index";
import { withApiRetry } from "../utils/retry";

export interface PriceResult {
  agentId: string;
  success: boolean;
  output?: {
    token: string;
    price: number;
    source: string;
    timestamp: number;
    currency: string;
  };
  error?: string;
}

export class PriceMonitorAgent {
  private readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  constructor(private env: Env) {}

  async execute(config: any, previousResults: any[]): Promise<PriceResult> {
    const { token, source = "coingecko" } = config;

    // Validate input
    if (!token || typeof token !== "string") {
      return {
        agentId: "price-monitor",
        success: false,
        error: "Missing or invalid token parameter",
      };
    }

    try {
      let price: number;

      if (source === "coingecko") {
        price = await this.fetchFromCoinGecko(token);
      } else if (source === "binance") {
        price = await this.fetchFromBinance(token);
      } else {
        throw new Error(`Unknown price source: ${source}. Supported: coingecko, binance`);
      }

      // Validate price
      if (!price || price <= 0) {
        throw new Error(`Invalid price received: ${price}`);
      }

      return {
        agentId: "price-monitor",
        success: true,
        output: {
          token: token.toUpperCase(),
          price,
          source,
          timestamp: Date.now(),
          currency: "USD",
        },
      };
    } catch (error: any) {
      console.error(`[PriceMonitorAgent] Error fetching ${token}:`, error);
      
      return {
        agentId: "price-monitor",
        success: false,
        error: `Price fetch failed: ${error.message}`,
      };
    }
  }

  private async fetchFromCoinGecko(token: string): Promise<number> {
    return withApiRetry(async () => {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${token.toLowerCase()}&vs_currencies=usd`;
      
      const headers: Record<string, string> = {};
      if (this.env.COINGECKO_API_KEY) {
        headers["x-cg-demo-api-key"] = this.env.COINGECKO_API_KEY;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);
      
      try {
        const response = await fetch(url, { 
          headers,
          signal: controller.signal 
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as Record<string, { usd: number }>;
        const price = data[token.toLowerCase()]?.usd;
        
        if (price === undefined) {
          throw new Error(`Token "${token}" not found on CoinGecko`);
        }
        
        return price;
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    }, { maxRetries: 3, baseDelay: 1000 });
  }

  private async fetchFromBinance(token: string): Promise<number> {
    return withApiRetry(async () => {
      const symbol = `${token.toUpperCase()}USDT`;
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { price: string };
        const price = parseFloat(data.price);
        
        if (isNaN(price)) {
          throw new Error(`Invalid price data from Binance for ${symbol}`);
        }
        
        return price;
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    }, { maxRetries: 3, baseDelay: 1000 });
  }
}
