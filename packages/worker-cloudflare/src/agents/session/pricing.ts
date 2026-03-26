import { ethers } from "ethers";
import type { Env } from "../../index";
import {
  KRAKEN_PAIR_MAP,
  TOKEN_STOPWORDS,
  UNISWAP_MAINNET_USDC,
  UNISWAP_QUOTE_ENDPOINT,
  UNISWAP_SWAPPER_PLACEHOLDER,
  UNISWAP_TOKENS,
} from "./constants";

export function extractRealtimePriceToken(message: string): string | undefined {
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
  if (/dogecoin|\bdoge\b/i.test(raw)) return "DOGE";

  const symbolMatch = lower.match(/\b([a-z]{2,10})(?:usdt)?\b/gi)
    ?.map((s) => s.toUpperCase().replace(/USDT$/i, ""))
    .find((s) => !TOKEN_STOPWORDS.has(s));
  return symbolMatch;
}

export async function fetchRealtimePriceTextWithEnv(
  token: string,
  env?: Pick<Env, "UNISWAP_API_KEY" | "UNISWAP_QUOTE_URL">
): Promise<string> {
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

  // OKX — primary source (X Layer hackathon partner)
  const okxUrl = `https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`;
  try {
    const res = await fetch(okxUrl, { headers: { "Cache-Control": "no-cache" } });
    if (res.ok) {
      const data = await res.json() as { code: string; data: Array<{ last: string }> };
      const value = Number(data?.data?.[0]?.last);
      if (data.code === "0" && Number.isFinite(value)) {
        quotes.push({ source: "OKX" as any, value, fetchedAt: new Date().toISOString() });
      }
    }
  } catch { /* fallthrough */ }

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

  const primary = quotes.find((q) => q.source === "OKX")
    || quotes.find((q) => q.source === "Uniswap")
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
