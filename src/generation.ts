import { withDeadline } from "./deadline.js";
import type { ModelConfig } from "./types.js";

export interface GenerationClient {
  session: {
    create(request: unknown): Promise<GenerationResponse<SessionData>>;
    prompt(request: unknown): Promise<GenerationResponse<PromptData>>;
    abort?(request: unknown): Promise<GenerationResponse<boolean>>;
    delete?(request: unknown): Promise<GenerationResponse<boolean>>;
  };
}

interface SessionData {
  id: string;
}

interface UsageData {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

interface AssistantData {
  cost?: number;
  tokens?: UsageData;
  error?: unknown;
}

interface PromptPart {
  type?: string;
  text?: string;
}

interface PromptData {
  info?: AssistantData;
  parts?: PromptPart[];
}

interface GenerationResponse<T> {
  data?: T;
  error?: unknown;
}

export type GenerationStatus =
  | "succeeded"
  | "provider-error"
  | "empty-output"
  | "timeout"
  | "error";

export interface GenerationUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  cost: number | null;
}

export interface GenerationResult {
  status: GenerationStatus;
  generationId: string;
  sessionId: string | null;
  rawResponse: unknown;
  rawText: string;
  usage: GenerationUsage;
  generationTimeMs: number;
  error?: string;
}

export interface GenerationOptions {
  client: GenerationClient;
  directory: string;
  generationId: string;
  prompt: string;
  model: ModelConfig;
  timeoutMs: number;
}

const emptyUsage: GenerationUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  cost: null,
};

function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(value);
}

function numberOrNull(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function usageFrom(info: AssistantData | undefined): GenerationUsage {
  const tokens = info?.tokens;
  const cache = tokens?.cache;
  return {
    inputTokens: numberOrNull(tokens?.input),
    outputTokens: numberOrNull(tokens?.output),
    reasoningTokens: numberOrNull(tokens?.reasoning),
    cacheReadTokens: numberOrNull(cache?.read),
    cacheWriteTokens: numberOrNull(cache?.write),
    cost: numberOrNull(info?.cost),
  };
}

function result(
  options: GenerationOptions,
  startedAt: number,
  values: Omit<GenerationResult, "generationId" | "generationTimeMs">,
): GenerationResult {
  return {
    generationId: options.generationId,
    generationTimeMs: Date.now() - startedAt,
    ...values,
  };
}

function extractText(parts: PromptPart[] | undefined): string {
  if (!parts) {
    return "";
  }
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

type PromptOutcome =
  | { kind: "response"; response: GenerationResponse<PromptData> }
  | { kind: "timeout"; error: string }
  | { kind: "error"; error: string };

async function requestPrompt(
  options: GenerationOptions,
  sessionId: string,
): Promise<PromptOutcome> {
  const prompt = options.client.session.prompt({
    path: { id: sessionId },
    query: { directory: options.directory },
    body: {
      agent: "benchmark",
      model: {
        providerID: options.model.providerID,
        modelID: options.model.modelID,
      },
      tools: { "*": false },
      parts: [{ type: "text", text: options.prompt }],
    },
  });

  try {
    return {
      kind: "response",
      response: await withDeadline(prompt, options.timeoutMs, "Generation timed out"),
    };
  } catch (error) {
    if (errorMessage(error) === "Generation timed out") {
      try {
        await options.client.session.abort?.({
          path: { id: sessionId },
          query: { directory: options.directory },
        });
      } catch {
        // The timeout remains the primary outcome even if cleanup fails.
      }
      return { kind: "timeout", error: "Generation timed out" };
    }
    return { kind: "error", error: errorMessage(error) };
  }
}

function classifyPrompt(
  options: GenerationOptions,
  startedAt: number,
  sessionId: string,
  prompt: GenerationResponse<PromptData>,
): GenerationResult {
  if (!prompt.data) {
    return result(options, startedAt, {
      status: "provider-error",
      sessionId,
      rawResponse: prompt.error ?? null,
      rawText: "",
      usage: emptyUsage,
      error: errorMessage(prompt.error ?? "Generation failed"),
    });
  }

  const data = prompt.data;
  if (data.info?.error) {
    return result(options, startedAt, {
      status: "provider-error",
      sessionId,
      rawResponse: data,
      rawText: "",
      usage: usageFrom(data.info),
      error: errorMessage(data.info.error),
    });
  }

  const rawText = extractText(data.parts);
  if (rawText.length === 0) {
    return result(options, startedAt, {
      status: "empty-output",
      sessionId,
      rawResponse: data,
      rawText,
      usage: usageFrom(data.info),
      error: "No text part was returned",
    });
  }
  return result(options, startedAt, {
    status: "succeeded",
    sessionId,
    rawResponse: data,
    rawText,
    usage: usageFrom(data.info),
  });
}

async function deleteSession(options: GenerationOptions, sessionId: string): Promise<void> {
  try {
    await options.client.session.delete?.({
      path: { id: sessionId },
      query: { directory: options.directory },
    });
  } catch {
    // Session deletion is cleanup and must not overwrite the generation result.
  }
}

export async function generateWithClient(
  options: GenerationOptions,
): Promise<GenerationResult> {
  const startedAt = Date.now();
  let sessionId: string | null = null;
  try {
    const session = await options.client.session.create({
      query: { directory: options.directory },
      body: { title: `ICDEES ${options.generationId}` },
    });
    if (!session.data) {
      return result(options, startedAt, {
        status: "provider-error",
        sessionId,
        rawResponse: session.error ?? null,
        rawText: "",
        usage: emptyUsage,
        error: errorMessage(session.error ?? "Session creation failed"),
      });
    }
    sessionId = session.data.id;

    const prompt = await requestPrompt(options, sessionId);
    if (prompt.kind === "timeout") {
      return result(options, startedAt, {
        status: "timeout",
        sessionId,
        rawResponse: null,
        rawText: "",
        usage: emptyUsage,
        error: prompt.error,
      });
    }
    if (prompt.kind === "error") {
      return result(options, startedAt, {
        status: "error",
        sessionId,
        rawResponse: null,
        rawText: "",
        usage: emptyUsage,
        error: prompt.error,
      });
    }
    return classifyPrompt(options, startedAt, sessionId, prompt.response);
  } catch (error) {
    return result(options, startedAt, {
      status: "error",
      sessionId,
      rawResponse: null,
      rawText: "",
      usage: emptyUsage,
      error: errorMessage(error),
    });
  } finally {
    if (sessionId) {
      await deleteSession(options, sessionId);
    }
  }
}
