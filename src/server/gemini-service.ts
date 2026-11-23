import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

/**
 * Validated Gemini model identifiers supported by @google/genai >= 3.x.
 * Never invent model names or use deprecated gemini-1.5-* / gemini-2.0-* identifiers.
 */
export const LENS_MODELS = {
  chat: 'gemini-4-hydrogen',
  live: 'gemini-3.8-live',
} as const;

export type AiErrorCategory =
  | 'config'
  | 'auth'
  | 'validation'
  | 'rate_limit'
  | 'timeout'
  | 'gemini_api'
  | 'stream'
  | 'live_session'
  | 'database'
  | 'tool'
  | 'cancelled'
  | 'unknown';

export interface StructuredAiError {
  category: AiErrorCategory;
  httpStatus: number;
  message: string;
  retryable: boolean;
  code?: string;
}

export interface AiDiagnosticEvent {
  requestId: string;
  conversationId?: number | null;
  model?: string;
  durationMs?: number;
  streamingStatus?: 'started' | 'chunk' | 'completed' | 'cancelled' | 'failed';
  toolName?: string;
  toolStatus?: string;
  errorCategory?: AiErrorCategory;
  httpStatus?: number;
  liveSessionState?: string;
  detail?: string;
}

export function createRequestId(): string {
  return `lens_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export function hasConfiguredGeminiKey(): boolean {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return key.length > 0 && key !== 'MY_GEMINI_API_KEY';
}

export function getGeminiClient(): GoogleGenAI {
  if (!hasConfiguredGeminiKey()) {
    const err = new Error(
      'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
    ) as Error & { code?: string; status?: number };
    err.code = 'MISSING_API_KEY';
    err.status = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Structured non-secret diagnostic logger for Lens AI operations.
 * Never logs API keys, Bearer tokens, or private message payloads.
 */
export function logAiDiagnostic(event: AiDiagnosticEvent) {
  const safePayload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    subsystem: 'lens-ai',
    requestId: event.requestId,
  };
  if (event.conversationId !== undefined) safePayload.conversationId = event.conversationId;
  if (event.model) safePayload.model = event.model;
  if (event.durationMs !== undefined) safePayload.durationMs = Math.round(event.durationMs);
  if (event.streamingStatus) safePayload.streamingStatus = event.streamingStatus;
  if (event.toolName) safePayload.toolName = event.toolName;
  if (event.toolStatus) safePayload.toolStatus = event.toolStatus;
  if (event.errorCategory) safePayload.errorCategory = event.errorCategory;
  if (event.httpStatus !== undefined) safePayload.httpStatus = event.httpStatus;
  if (event.liveSessionState) safePayload.liveSessionState = event.liveSessionState;
  if (event.detail) safePayload.detail = event.detail.slice(0, 240);

  if (event.errorCategory) {
    console.error(JSON.stringify(safePayload));
  } else {
    console.info(JSON.stringify(safePayload));
  }
}

export function classifyGeminiError(error: unknown): StructuredAiError {
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      category: 'cancelled',
      httpStatus: 499,
      message: 'Generation was stopped by the user.',
      retryable: false,
      code: 'ABORTED',
    };
  }

  const errObj = error as {
    status?: number;
    code?: string | number;
    message?: string;
  } | null;

  const rawMessage = errObj?.message || (error instanceof Error ? error.message : String(error ?? ''));
  const upper = rawMessage.toUpperCase();
  const status = typeof errObj?.status === 'number' ? errObj.status : undefined;

  if (errObj?.code === 'MISSING_API_KEY' || upper.includes('GEMINI_API_KEY') || upper.includes('API KEY SHOULD BE SET')) {
    return {
      category: 'config',
      httpStatus: 503,
      message: 'Gemini API key is not configured. Configure GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
      code: 'MISSING_API_KEY',
    };
  }

  if (
    status === 403 ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
  ) {
    return {
      category: 'auth',
      httpStatus: 403,
      message:
        'Gemini API authentication failed. Verify that a valid GEMINI_API_KEY is configured in Settings > Secrets.',
      retryable: false,
      code: 'GEMINI_AUTH_ERROR',
    };
  }

  if (status === 429 || upper.includes('RESOURCE_EXHAUSTED') || upper.includes('QUOTA') || upper.includes('RATE LIMIT')) {
    return {
      category: 'rate_limit',
      httpStatus: 429,
      message:
        'Gemini API rate limit or quota reached. Wait a moment and try again, or verify your billing tier in Settings > Secrets.',
      retryable: true,
      code: 'RATE_LIMITED',
    };
  }

  if (status === 404 || upper.includes('NOT_FOUND') || upper.includes('IS NOT FOUND')) {
    return {
      category: 'config',
      httpStatus: 502,
      message: `Configured Gemini model (${LENS_MODELS.chat}) was not found or is unavailable for this API key.`,
      retryable: false,
      code: 'MODEL_NOT_FOUND',
    };
  }

  if (
    errObj?.code === 'TIMEOUT' ||
    upper.includes('TIMED OUT') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ETIMEDOUT')
  ) {
    return {
      category: 'timeout',
      httpStatus: 504,
      message: 'Lens AI timed out while waiting for Gemini. Please try again.',
      retryable: true,
      code: 'TIMEOUT',
    };
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('OVERLOADED') ||
    upper.includes('ECONNRESET') ||
    upper.includes('FETCH FAILED')
  ) {
    return {
      category: 'gemini_api',
      httpStatus: 503,
      message: 'Gemini service is temporarily unavailable. Please retry in a few seconds.',
      retryable: true,
      code: 'UPSTREAM_TRANSIENT',
    };
  }

  if (status === 400 || upper.includes('INVALID_ARGUMENT')) {
    return {
      category: 'validation',
      httpStatus: 400,
      message: `Gemini rejected the request payload: ${rawMessage.slice(0, 180)}`,
      retryable: false,
      code: 'INVALID_ARGUMENT',
    };
  }

  return {
    category: 'gemini_api',
    httpStatus: 500,
    message: rawMessage ? `Lens AI error: ${rawMessage.slice(0, 200)}` : 'Lens AI encountered an unexpected error.',
    retryable: false,
    code: 'GEMINI_ERROR',
  };
}

/**
 * Executes a Gemini SDK call with timeout guard and exponential backoff retry
 * for transient failures (429 / 503 / network drops).
 */
export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  options: {
    requestId: string;
    timeoutMs?: number;
    maxRetries?: number;
    signal?: AbortSignal;
  },
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) {
      const abortErr = new Error('Operation cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race<T>([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const timeoutErr = new Error(`Gemini request timed out after ${timeoutMs}ms`) as Error & {
              code?: string;
            };
            timeoutErr.code = 'TIMEOUT';
            reject(timeoutErr);
          }, timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (error) {
      if (timer) clearTimeout(timer);
      lastError = error;
      const classified = classifyGeminiError(error);
      if (!classified.retryable || attempt === maxRetries || options.signal?.aborted) {
        throw error;
      }
      const delayMs = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      logAiDiagnostic({
        requestId: options.requestId,
        model: LENS_MODELS.chat,
        errorCategory: classified.category,
        detail: `Transient Gemini failure (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
