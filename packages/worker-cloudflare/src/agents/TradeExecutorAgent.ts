/**
 * TradeExecutorAgent - Prepare trade execution data
 */

import { Env } from "../index";

export interface TradeResult {
  agentId: string;
  success: boolean;
  output?: {
    executed: boolean;
    action?: string;
    token?: string;
    amount?: string;
    price?: number;
    estimatedValue?: number;
    reason?: string;
    tradeData?: {
      requiresSignature: boolean;
      calldata?: string;
      to?: string;
      value?: string;
    };
  };
  error?: string;
}

export class TradeExecutorAgent {
  constructor(private env: Env) {}

  async execute(config: any, previousResults: any[]): Promise<TradeResult> {
    const { action, amount, token = "ETH" } = config;

    try {
      // Validate config
      if (!action || !["buy", "sell"].includes(action.toLowerCase())) {
        return {
          agentId: "trade-executor",
          success: false,
          error: `Invalid action: ${action}. Must be "buy" or "sell"`,
        };
      }

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return {
          agentId: "trade-executor",
          success: false,
          error: `Invalid amount: ${amount}. Must be a positive number`,
        };
      }

      // Check condition result from previous step
      const conditionResult = previousResults.find(
        (r) => r.agentId === "condition-eval" && r.success
      );

      if (!conditionResult) {
        // No condition step - proceed with trade preparation
        console.log("[TradeExecutorAgent] No condition result found, proceeding with trade prep");
      } else if (!conditionResult.output?.shouldExecute) {
        // Condition evaluated to false - skip trade
        return {
          agentId: "trade-executor",
          success: true,
          output: {
            executed: false,
            reason: "Condition not met",
            action,
            token,
            amount,
          },
        };
      }

      // Get price data
      const priceData = previousResults.find(
        (r) => r.agentId === "price-monitor" && r.success
      );

      const price = priceData?.output?.price;
      const estimatedValue = price ? parseFloat(amount) * price : undefined;

      // Prepare trade data
      // In production, this would:
      // 1. Call DEX router (Uniswap, SushiSwap, etc.) to get quote
      // 2. Prepare transaction calldata
      // 3. Return data for user signature
      
      const tradeData = await this.prepareTradeData(action, token, amount);

      return {
        agentId: "trade-executor",
        success: true,
        output: {
          executed: true,
          action: action.toLowerCase(),
          token: token.toUpperCase(),
          amount,
          price,
          estimatedValue,
          tradeData,
        },
      };
    } catch (error: any) {
      console.error(`[TradeExecutorAgent] Trade preparation failed:`, error);
      
      return {
        agentId: "trade-executor",
        success: false,
        error: `Trade preparation failed: ${error.message}`,
      };
    }
  }

  /**
   * Prepare trade transaction data
   * 
   * In production, this would interact with DEX contracts
   */
  private async prepareTradeData(
    action: string,
    token: string,
    amount: string
  ): Promise<{ requiresSignature: boolean; calldata?: string; to?: string; value?: string }> {
    // Mock implementation for demo
    // In production:
    // 1. Get quote from DEX router
    // 2. Build swap transaction
    // 3. Return unsigned transaction for user to sign

    console.log(`[TradeExecutorAgent] Preparing ${action} trade: ${amount} ${token}`);

    // Return mock trade data
    return {
      requiresSignature: true,
      calldata: "0x...", // Encoded swap function call
      to: "0x...", // DEX router address
      value: action.toLowerCase() === "buy" ? "1000000000000000" : "0", // ETH value for buy
    };
  }

  /**
   * Validate trade parameters
   */
  private validateTradeParams(action: string, amount: string, token: string): void {
    const validActions = ["buy", "sell"];
    if (!validActions.includes(action.toLowerCase())) {
      throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`);
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error(`Invalid amount: ${amount}. Must be a positive number`);
    }

    if (!token || token.length < 2) {
      throw new Error(`Invalid token symbol: ${token}`);
    }
  }
}
