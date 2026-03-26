/**
 * Pi-style backend: Claude + AgentX system prompt + inline price oracle tool.
 * Replicates the CF Worker agent experience in Node.js without pi-worker dependency.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage } from "./claude";

const PI_SYSTEM_PROMPT = `You are an AgentX node — a decentralized AI agent running on a local machine \
in the AgentX network. You help users with:

- Cryptocurrency prices (fetch live data from Binance/CoinGecko)
- Agent economy: explaining how A2A payments and agent workflows work
- Blockchain tasks on X Layer (OKB testnet)
- General AI assistance

When asked for a price, look for the ticker symbol in the user message and fetch it.
Always be concise and helpful. Format numbers clearly.`;

async function fetchPrice(symbol: string): Promise<string | null> {
  try {
    const sym = symbol.toUpperCase().replace(/USDT$/, "");
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`);
    if (!res.ok) return null;
    const data = (await res.json()) as { price: string };
    return parseFloat(data.price).toLocaleString("en-US", { maximumFractionDigits: 6 });
  } catch {
    return null;
  }
}

export class PiBackend {
  private client: Anthropic;
  readonly model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(history: ChatMessage[], userMessage: string): Promise<string> {
    // Detect price queries and prepend live data as context
    const tickerMatch = userMessage.match(
      /\b(BTC|ETH|SOL|BNB|OKB|USDC|XRP|ADA|DOGE|MATIC|AVAX|LINK|DOT|UNI|ATOM)\b/i
    );
    let contextNote = "";
    if (tickerMatch) {
      const price = await fetchPrice(tickerMatch[1]);
      if (price) {
        contextNote = `\n[Live data: ${tickerMatch[1].toUpperCase()}/USDT = $${price}]`;
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userMessage + contextNote },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8096,
      system: PI_SYSTEM_PROMPT,
      messages,
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response content type");
    return block.text;
  }
}
