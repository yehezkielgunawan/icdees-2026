import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCampaignOnDisk, readCampaignManifest } from "../src/campaign-store.js";
import { persistGenerationArtifacts } from "../src/artifacts.js";
import {
  evaluationRecordPath,
  runEvaluationCampaign,
} from "../src/evaluation-campaign.js";

describe("evaluation campaign runner", () => {
  it("evaluates persisted generations and resumes completed records", async () => {
    const campaignId = "test-evaluation-runner";
    const campaignDirectory = join(process.cwd(), "campaigns", campaignId);
    await rm(campaignDirectory, { recursive: true, force: true });

    try {
      await createCampaignOnDisk({
        projectRoot: process.cwd(),
        purpose: "pilot",
        campaignId,
        taskIds: ["task-01"],
      });
      const manifest = await readCampaignManifest(process.cwd(), campaignId);
      const reference = await readFile(join(process.cwd(), "tasks/task-01/reference.ts"), "utf8");
      for (const item of manifest.schedule) {
        await persistGenerationArtifacts(campaignDirectory, {
          generationId: item.generationId,
          cohort: item.cohort,
          modelKey: item.modelKey,
          taskId: item.taskId,
          run: item.run,
          prompt: "test prompt",
          result: {
            status: "succeeded",
            generationId: item.generationId,
            sessionId: `session-${item.generationId}`,
            rawResponse: { text: reference },
            rawText: reference,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              reasoningTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              cost: 0,
            },
            generationTimeMs: 1,
          },
        });
      }

      await expect(runEvaluationCampaign({
        projectRoot: process.cwd(),
        campaignId,
      })).resolves.toMatchObject({ evaluated: 3, skipped: 0 });

      const record = JSON.parse(await readFile(
        evaluationRecordPath(campaignDirectory, manifest.schedule[0]!),
        "utf8",
      )) as { qualityGatePass: boolean; details: { taskId: string } };
      expect(record.qualityGatePass).toBe(true);
      expect(record.details.taskId).toBe("task-01");

      await expect(runEvaluationCampaign({
        projectRoot: process.cwd(),
        campaignId,
        resume: true,
      })).resolves.toMatchObject({ evaluated: 0, skipped: 3 });
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });
});
