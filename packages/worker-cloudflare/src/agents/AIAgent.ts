/**
 * AIAgent - LLM-powered agent using Cloudflare Workers AI
 *
 * Each agent step is handled by an LLM that reasons about the task
 * and calls tools (fetch_price, evaluate_condition, prepare_trade).
 * This replaces the hardcoded PriceMonitorAgent / ConditionAgent / TradeExecutorAgent.
 */

import { Env } from "../index";
import { withApiRetry } from "../utils/retry";

export interface AIAgentResult {
  agentId: string;
  success: boolean;
  output?: Record<string, unknown>;
  reasoning?: string;
  toolsUsed?: string[];
  error?: string;
}

// Tool definitions for the LLM
const TOOLS: any[] = [
  {
    name: "fetch_token_price",
    description:
      "Fetch the current USD price of a cryptocurrency token from CoinGecko or Binance.",
    parameters: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token id (e.g. 'ethereum', 'bitcoin', 'solana')",
        },
        source: {
          type: "string",
          enum: ["coingecko", "binance"],
          description: "Price data source",
        },
      },
      required: ["token"],
    },
  },
  {
    name: "evaluate_condition",
    description:
      "Evaluate a numeric condition against a threshold and decide whether to proceed.",
    parameters: {
      type: "object",
      properties: {
        value: {
          type: "number",
          description: "The numeric value to check",
        },
        operator: {
          type: "string",
          enum: ["<", ">", "<=", ">=", "=="],
          description: "Comparison operator",
        },
        threshold: {
          type: "number",
          description: "Threshold to compare against",
        },
      },
      required: ["value", "operator", "threshold"],
    },
  },
  {
    name: "prepare_trade",
    description:
      "Prepare DEX trade calldata for a token swap. Returns transaction data for the user to sign.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["buy", "sell"],
          description: "Trade direction",
        },
        token: {
          type: "string",
          description: "Token symbol (e.g. 'ETH', 'BTC')",
        },
        amount: {
          type: "string",
          description: "Amount to trade (e.g. '0.1')",
        },
        price: {
          type: "number",
          description: "Current token price in USD",
        },
      },
      required: ["action", "token", "amount"],
    },
  },
];

export class AIAgent {
  private readonly MODEL = "@cf/meta/llama-3.1-8b-instruct";

  constructor(private env: Env) {}

  /**
   * Execute a workflow step:
   * 1. Run tools deterministically based on agentType (reliable)
   * 2. Use LLM to reason about the result (AI layer)
   */
  async execute(
    agentType: string,
    config: Record<string, unknown>,
    previousResults: Record<string, unknown>[]
  ): Promise<AIAgentResult> {
    try {
      // Step 1: Execute tool deterministically
      const toolResult = await this.runTool(agentType, config, previousResults);
      const toolsUsed = [this.agentTypeToTool(agentType)];

      // Step 2: Ask LLM to reason about the result
      const reasoning = await this.reason(agentType, config, toolResult);

      return {
        agentId: agentType,
        success: true,
        output: { ...toolResult as object, aiReasoning: reasoning },
        reasoning,
        toolsUsed,
      };
    } catch (error: any) {
      console.error(`[AIAgent:${agentType}] Error:`, error);
      return {
        agentId: agentType,
        success: false,
        error: error.message || "AI agent execution failed",
      };
    }
  }

  /** Map agentType to primary tool name */
  private agentTypeToTool(agentType: string): string {
    const map: Record<string, string> = {
      "price-monitor": "fetch_token_price",
      "condition-eval": "evaluate_condition",
      "trade-executor": "prepare_trade",
    };
    return map[agentType] || agentType;
  }

  /** Execute the primary tool for this agentType */
  private async runTool(
    agentType: string,
    config: Record<string, unknown>,
    previousResults: Record<string, unknown>[]
  ): Promise<unknown> {
    switch (agentType) {
      case "price-monitor":
        return this.toolFetchPrice(
          config.token as string,
          (config.source as string) || "binance"
        );
      case "condition-eval": {
        // Get price from previous step
        const prevPrice = this.extractPrice(previousResults);
        return this.toolEvaluateCondition(
          prevPrice ?? (config.value as number) ?? 0,
          (config.operator as string) || ">",
          (config.threshold as number) || 0
        );
      }
      case "trade-executor": {
        const prevPrice = this.extractPrice(previousResults);
        return this.toolPrepareTrade(
          (config.action as string) || "buy",
          (config.token as string) || "ETH",
          (config.amount as string) || "0.1",
          prevPrice ?? undefined
        );
      }
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  /** Extract price value from previous step results */
  private extractPrice(previousResults: Record<string, unknown>[]): number | null {
    for (const r of previousResults) {
      const output = (r as any)?.output;
      if (output?.price) return Number(output.price);
      if (output?.value) return Number(output.value);
    }
    return null;
  }

  /** Use LLM to add reasoning/analysis to the tool result */
  private async reason(
    agentType: string,
    config: Record<string, unknown>,
    toolResult: unknown
  ): Promise<string> {
    try {
      const prompt = `You are an AI agent in a decentralized network. You just executed a ${agentType} task.

Config: ${JSON.stringify(config)}
Result: ${JSON.stringify(toolResult)}

Provide a brief 1-2 sentence analysis of this result and what it means for the workflow.`;

      const response = await this.env.AI.run(this.MODEL as any, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      });

      return (response as any).response || "Task completed successfully.";
    } catch {
      return "Task completed successfully.";
    }
  }

  // ─── Tool Implementations ────────────────────────────────────────────────────

  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "fetch_token_price":
        return this.toolFetchPrice(
          args.token as string,
          (args.source as string) || "binance"
        );
      case "evaluate_condition":
        return this.toolEvaluateCondition(
          args.value as number,
          args.operator as string,
          args.threshold as number
        );
      case "prepare_trade":
        return this.toolPrepareTrade(
          args.action as string,
          args.token as string,
          args.amount as string,
          args.price as number
        );
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private async toolFetchPrice(
    token: string,
    source: string
  ): Promise<unknown> {
    return withApiRetry(async () => {
      // CoinGecko blocks Cloudflare IPs without paid key — always use Binance
      if (source === "coingecko" && !this.env.COINGECKO_API_KEY) {
        source = "binance";
      }
      if (source === "binance") {
        // Map CoinGecko IDs to Binance tickers
        const TICKER_MAP: Record<string, string> = {
          ethereum: "ETH", bitcoin: "BTC", solana: "SOL",
          "binancecoin": "BNB", "matic-network": "MATIC",
          avalanche: "AVAX", polkadot: "DOT", chainlink: "LINK",
        };
        const ticker = TICKER_MAP[token.toLowerCase()] || token.toUpperCase();
        const symbol = `${ticker}USDT`;
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
        );
        if (!res.ok) throw new Error(`Binance error: ${res.status}`);
        const data = (await res.json()) as { price: string };
        return {
          token: token.toUpperCase(),
          price: parseFloat(data.price),
          source: "binance",
          timestamp: Date.now(),
          currency: "USD",
        };
      }

      // Default: CoinGecko
      const headers: Record<string, string> = {};
      if (this.env.COINGECKO_API_KEY) {
        headers["x-cg-demo-api-key"] = this.env.COINGECKO_API_KEY;
      }
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${token.toLowerCase()}&vs_currencies=usd`,
        { headers }
      );
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = (await res.json()) as Record<string, { usd: number }>;
      const price = data[token.toLowerCase()]?.usd;
      if (!price) throw new Error(`Token "${token}" not found`);
      return {
        token: token.toUpperCase(),
        price,
        source: "coingecko",
        timestamp: Date.now(),
        currency: "USD",
      };
    });
  }

  private toolEvaluateCondition(
    value: number,
    operator: string,
    threshold: number
  ): unknown {
    const ops: Record<string, (a: number, b: number) => boolean> = {
      "<": (a, b) => a < b,
      ">": (a, b) => a > b,
      "<=": (a, b) => a <= b,
      ">=": (a, b) => a >= b,
      "==": (a, b) => a === b,
    };
    const fn = ops[operator];
    if (!fn) return { error: `Unknown operator: ${operator}` };
    const result = fn(value, threshold);
    return {
      value,
      operator,
      threshold,
      result,
      shouldProceed: result,
    };
  }

  private toolPrepareTrade(
    action: string,
    token: string,
    amount: string,
    price?: number
  ): unknown {
    const estimatedPrice = price || 0;
    return {
      executed: false,
      requiresSignature: true,
      action,
      token,
      amount,
      estimatedPrice,
      estimatedValue: parseFloat(amount) * estimatedPrice,
      tradeData: {
        to: "0x0000000000000000000000000000000000000000", // DEX router placeholder
        calldata: "0x", // Real calldata would be built via DEX SDK
        value: action === "buy" ? "0" : "0",
      },
      note: "Human approval required before signing",
    };
  }

  // ─── Prompt Builders ─────────────────────────────────────────────────────────

  private buildSystemPrompt(agentType: string): string {
    const descriptions: Record<string, string> = {
      "price-monitor":
        "You are a price monitoring agent. Your job is to fetch the current price of a cryptocurrency token and return the result.",
      "condition-eval":
        "You are a condition evaluation agent. Use the price from previous steps to evaluate whether a numeric condition is met.",
      "trade-executor":
        "You are a trade preparation agent. Prepare the DEX trade parameters based on the configuration and previous results. Always require human approval.",
    };

    return `${descriptions[agentType] || "You are an AI agent in the Gradience decentralized network."}

You have access to tools. Use them to complete your task. After using tools, summarize the result as JSON in this format:
{"success": true, "data": { ...result fields }}

If something fails, return: {"success": false, "error": "reason"}`;
  }

  private buildUserPrompt(
    agentType: string,
    config: Record<string, unknown>,
    previousResults: Record<string, unknown>[]
  ): string {
    const parts = [`Execute task: ${agentType}`, `Config: ${JSON.stringify(config)}`];
    if (previousResults.length > 0) {
      parts.push(`Previous step results: ${JSON.stringify(previousResults)}`);
    }
    parts.push("Use the available tools and return the result.");
    return parts.join("\n");
  }

  // ─── Output Parser ────────────────────────────────────────────────────────────

  private parseOutput(text: string): { success: boolean; data?: Record<string, unknown> } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success !== false,
          data: parsed.data || parsed,
        };
      }
    } catch {
      // ignore parse error
    }
    // Fallback: treat as successful with text output
    return { success: true, data: { response: text } };
  }
}
