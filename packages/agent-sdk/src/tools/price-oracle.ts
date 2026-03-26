/**
 * createPriceOracleTool — Fetch live crypto prices.
 *
 * Queries Binance (primary) with CoinGecko fallback.
 * For paid use, pair with createA2APaymentTool to send 0.001 USDC
 * to the PriceOracle agent's wallet before calling this tool.
 */

import { Type, type Static } from "@sinclair/typebox";

const priceSchema = Type.Object({
  symbol: Type.String({ description: "Crypto symbol, e.g. 'ETH', 'BTC', 'OKB'" }),
  currency: Type.Optional(Type.String({ description: "Quote currency (default: USDT)" })),
});

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  OKB: "okb",
  BNB: "binancecoin",
  USDC: "usd-coin",
  USDT: "tether",
};

async function fetchBinance(symbol: string, currency: string): Promise<number | null> {
  try {
    const pair = `${symbol.toUpperCase()}${currency.toUpperCase()}`;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
    if (!res.ok) return null;
    const data = await res.json() as { price: string };
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

async function fetchCoinGecko(symbol: string): Promise<number | null> {
  try {
    const id = COINGECKO_IDS[symbol.toUpperCase()];
    if (!id) return null;
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { usd: number }>;
    return data[id]?.usd ?? null;
  } catch {
    return null;
  }
}

export function createPriceOracleTool() {
  return {
    name: "get_price" as const,
    label: "get_price",
    description:
      "Fetch the current live price of a cryptocurrency from Binance or CoinGecko. " +
      "Returns price in USD/USDT and the data source. " +
      "For production use, pay the PriceOracle agent 0.001 USDC before calling.",
    parameters: priceSchema,
    execute: async (_id: string, { symbol, currency = "USDT" }: Static<typeof priceSchema>) => {
      const sym = symbol.toUpperCase();

      // Try Binance first
      const binancePrice = await fetchBinance(sym, currency);
      if (binancePrice !== null) {
        return {
          content: [{
            type: "text" as const,
            text: `${sym} price: $${binancePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (source: Binance)`,
          }],
          details: { symbol: sym, price: binancePrice, currency, source: "binance" },
        };
      }

      // Fallback to CoinGecko
      const cgPrice = await fetchCoinGecko(sym);
      if (cgPrice !== null) {
        return {
          content: [{
            type: "text" as const,
            text: `${sym} price: $${cgPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (source: CoinGecko)`,
          }],
          details: { symbol: sym, price: cgPrice, currency: "USD", source: "coingecko" },
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Unable to fetch price for ${sym}. Symbol may not be supported by Binance or CoinGecko.`,
        }],
        details: { symbol: sym, price: null, error: "not_found" },
      };
    },
  };
}
