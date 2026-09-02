import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCampaignOnDisk } from "../src/campaign-store.js";
import {
  runGenerationCampaign,
  type GenerationRunnerDependencies,
} from "../src/generation-campaign.js";
import type { GenerationClient } from "../src/generation.js";
import type { ProviderSnapshot, RuntimeInfo } from "../src/opencode-runtime.js";

const runtimeInfo: RuntimeInfo = {
  baseUrl: "http://127.0.0.1:43123",
  version: "1.18.26",
  pid: 123,
};

const providers: ProviderSnapshot = {
  providers: [{
    id: "openai",
    models: {
      "gpt-5.6-sol": {
        name: "GPT Sol",
        capabilities: { temperature: false },
        status: "active",
      },
      "gpt-5.6-terra": {
        name: "GPT Terra",
        capabilities: { temperature: false },
        status: "active",
      },
      "gpt-5.6-luna": {
        name: "GPT Luna",
        capabilities: { temperature: false },
        status: "active",
      },
    },
  }],
  default: {},
};

describe("generation campaign runner", () => {
  it("writes one immutable record per schedule item and resumes completed work", async () => {
    const campaignId = "test-generation-runner";
    const campaignDirectory = join(process.cwd(), "campaigns", campaignId);
    await rm(campaignDirectory, { recursive: true, force: true });
    let starts = 0;
    let stops = 0;
    let generated = 0;
    const runtime = {
      generationClient: {} as GenerationClient,
      get runtimeInfo() {
        return runtimeInfo;
      },
      async start() {
        starts += 1;
        return runtimeInfo;
      },
      async providers() {
        return providers;
      },
      async stop() {
        stops += 1;
      },
    };
    const dependencies: GenerationRunnerDependencies = {
      createRuntime: () => runtime,
      generate: async (options) => {
        generated += 1;
        const taskId = options.generationId.match(/(task-\d+)/)?.[1];
        if (!taskId) {
          throw new Error(`Could not identify task in ${options.generationId}`);
        }
        return {
          status: "succeeded",
          generationId: options.generationId,
          sessionId: `session-${generated}`,
          rawResponse: { parts: [{ type: "text", text: "reference" }] },
          rawText: await readFile(join(process.cwd(), "tasks", taskId, "reference.ts"), "utf8"),
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cost: 0,
          },
          generationTimeMs: 4,
        };
      },
    };

    try {
      await createCampaignOnDisk({
        projectRoot: process.cwd(),
        purpose: "pilot",
        campaignId,
        taskIds: ["task-01"],
      });
      const runtimeStateDirectory = join(campaignDirectory, ".opencode-state");
      await mkdir(runtimeStateDirectory, { recursive: true });

      await expect(runGenerationCampaign({
        projectRoot: process.cwd(),
        campaignId,
        dependencies,
      })).resolves.toMatchObject({ generated: 3, skipped: 0 });
      expect(generated).toBe(3);
      expect(starts).toBe(1);
      expect(stops).toBe(1);

      const recordPath = join(
        campaignDirectory,
        "generations",
        "primary",
        "sol",
        "task-01",
        "run-1",
        "generation-record.json",
      );
      expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
        generationId: `${campaignId}--sol--task-01--run-1`,
        temperatureSupported: false,
        temperatureApplied: null,
        maxOutputTokens: 4096,
        runtime: runtimeInfo,
      });
      expect(JSON.parse(await readFile(
        join(campaignDirectory, "runtime/provider-snapshot.json"),
        "utf8",
      ))).toMatchObject({
        providers,
      });
      await expect(access(runtimeStateDirectory)).rejects.toThrow();

      await expect(runGenerationCampaign({
        projectRoot: process.cwd(),
        campaignId,
        resume: true,
        dependencies,
      })).resolves.toMatchObject({ generated: 0, skipped: 3 });
      expect(generated).toBe(3);
      expect(starts).toBe(1);
      expect(stops).toBe(1);
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });
});
