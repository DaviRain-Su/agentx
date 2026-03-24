/**
 * Retry utility with exponential backoff
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  factor: number; // exponential factor
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  factor: 2,
};

/**
 * Sleep for given milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.factor, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === finalConfig.maxRetries) {
        break;
      }

      if (!shouldRetry(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, finalConfig);
      console.log(`Retry ${attempt + 1}/${finalConfig.maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry wrapper for contract calls
 */
export async function withContractRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  return withRetry(
    fn,
    (error) => {
      // Retry on network/timeout errors
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
          msg.includes("network") ||
          msg.includes("timeout") ||
          msg.includes("rate limit") ||
          msg.includes("nonce") // Nonce errors can be retried
        );
      }
      return false;
    },
    config
  );
}

/**
 * Retry wrapper for external API calls
 */
export async function withApiRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  return withRetry(
    fn,
    (error) => {
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
          msg.includes("rate limit") ||
          msg.includes("429") ||
          msg.includes("503") ||
          msg.includes("502") ||
          msg.includes("timeout")
        );
      }
      return false;
    },
    { maxRetries: 5, baseDelay: 2000, ...config }
  );
}
