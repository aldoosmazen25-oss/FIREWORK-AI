import type { Part } from '@google/genai';
import * as queries from '../db/queries.ts';
import type { ToolExecutionTrace } from '../db/schema.ts';
import {
  classifyGeminiError,
  createRequestId,
  getGeminiClient,
  LENS_MODELS,
  logAiDiagnostic,
  withGeminiRetry,
} from './gemini-service.ts';
import { buildLensApplicationContext, formatLensSystemInstruction } from './lens-context.ts';
import {
  executeLensTool,
  lensToolDeclarations,
  type LensClientAction,
  type PendingConfirmation,
} from './lens-tools.ts';

export { executeLensTool, lensToolDeclarations };
export type { LensClientAction, PendingConfirmation };

const MAX_AGENT_STEPS = 6;

export interface LensAgentTurnInput {
  uid: string;
  conversationId?: number;
  message: string;
  language: 'en' | 'ar';
  currentPage?: string;
  selectedProjectId?: number | null;
  signal?: AbortSignal;
}

export type LensStreamEvent =
  | { type: 'meta'; requestId: string; conversationId: number; model: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; trace: ToolExecutionTrace }
  | { type: 'client_action'; action: LensClientAction }
  | {
      type: 'done';
      requestId: string;
      conversationId: number;
      message: Awaited<ReturnType<typeof queries.saveAiMessage>>;
      toolTraces: ToolExecutionTrace[];
      clientActions: LensClientAction[];
      pendingConfirmations: PendingConfirmation[];
      status: 'completed' | 'cancelled';
    }
  | {
      type: 'error';
      requestId: string;
      conversationId?: number;
      errorCategory: string;
      message: string;
      retryable: boolean;
    };

/**
 * Multi-step streaming Lens AI agent runner.
 * Streams Gemini text tokens progressively while executing structured function calls
 * against Firework AI's PostgreSQL services and emitting live UI sync events.
 */
export async function runLensAgentStream(
  params: LensAgentTurnInput,
  emit: (event: LensStreamEvent) => void,
) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  let conversationId = params.conversationId;

  try {
    const appContext = await buildLensApplicationContext({
      uid: params.uid,
      language: params.language,
      currentPage: params.currentPage,
      selectedProjectId: params.selectedProjectId ?? null,
    });

    if (!conversationId) {
      const conv = await queries.createAiConversation(params.uid, params.message.slice(0, 72));
      conversationId = conv.id;
    }

    await queries.saveAiMessage({
      conversationId,
      role: 'user',
      content: params.message,
    });

    emit({
      type: 'meta',
      requestId,
      conversationId,
      model: LENS_MODELS.chat,
    });

    logAiDiagnostic({
      requestId,
      conversationId,
      model: LENS_MODELS.chat,
      streamingStatus: 'started',
    });

    const priorMessages = await queries.getAiMessages(conversationId, params.uid);
    const historySlice = priorMessages.slice(-16);
    const systemInstruction = formatLensSystemInstruction(appContext, false);

    const contents: Array<{ role: 'user' | 'model'; parts: Part[] }> = historySlice.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const ai = getGeminiClient();
    const toolTraces: ToolExecutionTrace[] = [];
    const clientActions: LensClientAction[] = [];
    const pendingConfirmations: PendingConfirmation[] = [];

    let accumulatedText = '';
    let wasCancelled = false;

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      if (params.signal?.aborted) {
        wasCancelled = true;
        break;
      }

      const stream = await withGeminiRetry(
        () =>
          ai.models.generateContentStream({
            model: LENS_MODELS.chat,
            contents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: lensToolDeclarations }],
            },
          }),
        {
          requestId,
          timeoutMs: 45_000,
          maxRetries: 2,
          signal: params.signal,
        },
      );

      let stepText = '';
      const stepModelParts: Part[] = [];
      const stepFunctionCalls: Array<{
        id?: string;
        name: string;
        args: Record<string, unknown>;
      }> = [];

      for await (const chunk of stream) {
        if (params.signal?.aborted) {
          wasCancelled = true;
          break;
        }

        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          // Preserve exact parts (including thoughtSignature / functionCall) for multi-turn fidelity
          stepModelParts.push(part);
          if (part.functionCall?.name) {
            stepFunctionCalls.push({
              id: part.functionCall.id,
              name: part.functionCall.name,
              args: (part.functionCall.args as Record<string, unknown>) ?? {},
            });
          }
        }

        const deltaText = chunk.text;
        if (deltaText) {
          stepText += deltaText;
          accumulatedText += deltaText;
          emit({ type: 'delta', text: deltaText });
        }
      }

      if (wasCancelled) {
        break;
      }

      if (stepFunctionCalls.length === 0) {
        break;
      }

      // Append exact model turn preserving thoughtSignature & functionCall parts
      contents.push({
        role: 'model',
        parts: stepModelParts.length > 0 ? stepModelParts : [{ text: stepText }],
      });

      // Execute each tool call against live PostgreSQL services
      const functionResponseParts: Part[] = [];
      for (const call of stepFunctionCalls) {
        if (params.signal?.aborted) {
          wasCancelled = true;
          break;
        }

        emit({ type: 'tool_start', toolName: call.name, args: call.args });

        const prevActionLen = clientActions.length;
        const { trace, result } = await executeLensTool({
          uid: params.uid,
          conversationId,
          requestId,
          name: call.name,
          rawArgs: call.args,
          clientActions,
          pendingConfirmations,
        });

        toolTraces.push(trace);
        emit({ type: 'tool_result', trace });

        for (let i = prevActionLen; i < clientActions.length; i += 1) {
          emit({ type: 'client_action', action: clientActions[i] });
        }

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: result,
          },
        });
      }

      if (wasCancelled) {
        break;
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      // Add a paragraph break if the model emitted introductory text before tools and now generates final text
      if (accumulatedText.trim().length > 0 && !accumulatedText.endsWith('\n\n')) {
        accumulatedText += '\n\n';
        emit({ type: 'delta', text: '\n\n' });
      }
    }

    const finalContent =
      accumulatedText.trim() ||
      (wasCancelled
        ? 'Generation stopped.'
        : toolTraces.length > 0
          ? toolTraces.map((t) => `${t.toolName}: ${t.summary}`).join('\n')
          : 'No response returned from Gemini.');

    const savedModelMsg = await queries.saveAiMessage({
      conversationId,
      role: 'model',
      content: finalContent,
      toolCalls: toolTraces,
    });

    logAiDiagnostic({
      requestId,
      conversationId,
      model: LENS_MODELS.chat,
      durationMs: Date.now() - startedAt,
      streamingStatus: wasCancelled ? 'cancelled' : 'completed',
      httpStatus: 200,
    });

    emit({
      type: 'done',
      requestId,
      conversationId,
      message: savedModelMsg,
      toolTraces,
      clientActions,
      pendingConfirmations,
      status: wasCancelled ? 'cancelled' : 'completed',
    });

    return {
      requestId,
      conversationId,
      message: savedModelMsg,
      toolTraces,
      clientActions,
      pendingConfirmations,
      status: wasCancelled ? ('cancelled' as const) : ('completed' as const),
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    logAiDiagnostic({
      requestId,
      conversationId: conversationId ?? null,
      model: LENS_MODELS.chat,
      durationMs: Date.now() - startedAt,
      streamingStatus: classified.category === 'cancelled' ? 'cancelled' : 'failed',
      errorCategory: classified.category,
      httpStatus: classified.httpStatus,
      detail: classified.message,
    });

    emit({
      type: 'error',
      requestId,
      conversationId,
      errorCategory: classified.category,
      message: classified.message,
      retryable: classified.retryable,
    });

    throw Object.assign(new Error(classified.message), {
      httpStatus: classified.httpStatus,
      errorCategory: classified.category,
      retryable: classified.retryable,
      requestId,
    });
  }
}

/**
 * Non-streaming JSON wrapper around the exact same multi-step agent engine.
 */
export async function runLensAgentTurn(params: LensAgentTurnInput) {
  return runLensAgentStream(params, () => {
    // Non-streaming caller consumes final return payload
  });
}
