import { describe, expect, it } from "vitest";
import {
  generateWithClient,
  type GenerationClient,
} from "../src/generation.js";

const model = {
  key: "sol",
  label: "GPT-5.6 Sol",
  cohort: "primary" as const,
  providerID: "openai",
  modelID: "gpt-5.6-sol",
};

function generationOptions(client: GenerationClient) {
  return {
    client,
    directory: "/tmp/icdees-study",
    generationId: "campaign--sol--task-01--run-1",
    prompt: "Return TypeScript source.",
    model,
    timeoutMs: 1_000,
  };
}

describe("OpenCode generation adapter", () => {
  it("creates an isolated session and extracts text parts", async () => {
    let promptRequest: Record<string, unknown> | undefined;
    const client: GenerationClient = {
      session: {
        create: async () => ({ data: { id: "session-1" } }),
        prompt: async (request) => {
          promptRequest = request as unknown as Record<string, unknown>;
          return {
            data: {
              info: {
                cost: 0.01,
                tokens: {
                  input: 10,
                  output: 20,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              },
              parts: [
                { type: "reasoning", text: "internal" },
                { type: "text", text: "export const answer = 42;" },
              ],
            },
          };
        },
        delete: async () => ({ data: true }),
      },
    };

    const result = await generateWithClient(generationOptions(client));

    expect(result.status).toBe("succeeded");
    expect(result.rawText).toBe("export const answer = 42;");
    expect(result.sessionId).toBe("session-1");
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.01,
    });
    expect(promptRequest).toMatchObject({
      path: { id: "session-1" },
      query: { directory: "/tmp/icdees-study" },
      body: {
        agent: "benchmark",
        model: { providerID: "openai", modelID: "gpt-5.6-sol" },
        tools: { "*": false },
        parts: [{ type: "text", text: "Return TypeScript source." }],
      },
    });
  });

  it("records provider errors without pretending an output exists", async () => {
    const client: GenerationClient = {
      session: {
        create: async () => ({ data: { id: "session-2" } }),
        prompt: async () => ({ error: { message: "provider unavailable" } }),
        delete: async () => ({ data: true }),
      },
    };

    const result = await generateWithClient(generationOptions(client));

    expect(result.status).toBe("provider-error");
    expect(result.rawText).toBe("");
    expect(result.error).toContain("provider unavailable");
  });

  it("aborts a session when generation exceeds its timeout", async () => {
    let aborted = false;
    const client: GenerationClient = {
      session: {
        create: async () => ({ data: { id: "session-3" } }),
        prompt: async () => new Promise(() => undefined),
        abort: async () => {
          aborted = true;
          return { data: true };
        },
        delete: async () => ({ data: true }),
      },
    };

    const result = await generateWithClient({
      ...generationOptions(client),
      timeoutMs: 10,
    });

    expect(result.status).toBe("timeout");
    expect(aborted).toBe(true);
  });
});
