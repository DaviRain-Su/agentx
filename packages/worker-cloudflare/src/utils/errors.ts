/**
 * Error types for Worker execution
 */

export class WorkerError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export class WorkflowError extends WorkerError {
  constructor(message: string, retryable = false) {
    super(message, "WORKFLOW_ERROR", retryable);
    this.name = "WorkflowError";
  }
}

export class AgentExecutionError extends WorkerError {
  constructor(
    message: string,
    public stepId: string,
    public agentId: string,
    retryable = true
  ) {
    super(message, "AGENT_EXECUTION_ERROR", retryable);
    this.name = "AgentExecutionError";
  }
}

export class HumanLoopTimeoutError extends WorkerError {
  constructor(stepId: string) {
    super(
      `Human approval timeout for step ${stepId}`,
      "HUMAN_LOOP_TIMEOUT",
      false
    );
    this.name = "HumanLoopTimeoutError";
  }
}

export class ContractError extends WorkerError {
  constructor(message: string, retryable = true) {
    super(message, "CONTRACT_ERROR", retryable);
    this.name = "ContractError";
  }
}

export class ValidationError extends WorkerError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", false);
    this.name = "ValidationError";
  }
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof WorkerError) {
    return error.retryable;
  }
  
  // Network errors are retryable
  if (error instanceof Error) {
    const retryablePatterns = [
      "network",
      "timeout",
      "ECONNRESET",
      "ETIMEDOUT",
      "rate limit",
      "429",
      "503",
      "502",
    ];
    return retryablePatterns.some((pattern) =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }
  
  return false;
}
