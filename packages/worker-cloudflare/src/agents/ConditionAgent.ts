/**
 * ConditionAgent - Evaluate conditions
 */

import { Env } from "../index";

export interface ConditionResult {
  agentId: string;
  success: boolean;
  output?: {
    condition: string;
    price: number;
    threshold: number;
    operator: string;
    result: boolean;
    shouldExecute: boolean;
  };
  error?: string;
}

export class ConditionAgent {
  constructor(private env: Env) {}

  async execute(config: any, previousResults: any[]): Promise<ConditionResult> {
    const { condition, operator, threshold } = config;

    try {
      // Validate config
      if (!condition && (!operator || threshold === undefined)) {
        return {
          agentId: "condition-eval",
          success: false,
          error: "Missing condition. Provide either 'condition' string or 'operator' + 'threshold'",
        };
      }

      // Get previous price data
      const priceData = previousResults.find(
        (r) => r.agentId === "price-monitor" && r.success
      );

      if (!priceData) {
        throw new Error("No price data available from previous steps");
      }

      const price = priceData.output?.price;
      if (typeof price !== "number" || isNaN(price)) {
        throw new Error(`Invalid price data: ${price}`);
      }

      // Parse condition
      let op: string;
      let thresh: number;

      if (condition && typeof condition === "string") {
        // Parse from condition string (e.g., "price < 1800")
        const parsed = this.parseCondition(condition);
        op = parsed.operator;
        thresh = parsed.threshold;
      } else {
        // Use explicit operator and threshold
        op = operator;
        thresh = parseFloat(threshold);
      }

      // Validate operator
      const validOperators = ["<", ">", "<=", ">=", "==", "!="];
      if (!validOperators.includes(op)) {
        throw new Error(`Invalid operator: ${op}. Supported: ${validOperators.join(", ")}`);
      }

      // Validate threshold
      if (isNaN(thresh)) {
        throw new Error(`Invalid threshold: ${thresh}`);
      }

      // Evaluate condition
      const result = this.evaluate(op, price, thresh);

      return {
        agentId: "condition-eval",
        success: true,
        output: {
          condition: condition || `${op} ${thresh}`,
          price,
          threshold: thresh,
          operator: op,
          result,
          shouldExecute: result,
        },
      };
    } catch (error: any) {
      console.error(`[ConditionAgent] Evaluation failed:`, error);
      
      return {
        agentId: "condition-eval",
        success: false,
        error: `Condition evaluation failed: ${error.message}`,
      };
    }
  }

  /**
   * Parse condition string like "price < 1800"
   */
  private parseCondition(condition: string): { operator: string; threshold: number } {
    // Remove "price" prefix if present
    const cleanCondition = condition.replace(/^price\s*/, "").trim();
    
    // Match operator and number
    const match = cleanCondition.match(/^(<=|>=|==|!=|<|>)\s*(.+)$/);
    
    if (!match) {
      throw new Error(`Cannot parse condition: "${condition}". Expected format: "price < 1800" or "< 1800"`);
    }

    const operator = match[1];
    const threshold = parseFloat(match[2]);

    if (isNaN(threshold)) {
      throw new Error(`Invalid threshold in condition: "${condition}"`);
    }

    return { operator, threshold };
  }

  /**
   * Evaluate condition
   */
  private evaluate(operator: string, left: number, right: number): boolean {
    switch (operator) {
      case "<":
        return left < right;
      case ">":
        return left > right;
      case "<=":
        return left <= right;
      case ">=":
        return left >= right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }
}
