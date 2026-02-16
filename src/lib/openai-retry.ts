import { APIError } from "openai";

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status ?? 0);
  }
  // Network errors (ECONNRESET, ETIMEDOUT, etc.)
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED";
  }
  return false;
}

function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof APIError) {
    const retryAfter = error.headers?.["retry-after"];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts - 1 || !isRetryableError(error)) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const delay = retryAfterMs ?? calculateDelay(attempt, baseDelayMs, maxDelayMs);

      const status = error instanceof APIError ? error.status : "network";
      console.warn(
        `OpenAI request failed (${status}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxAttempts})`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
