import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCampaignOnDisk } from "../src/campaign-store.js";
import {
  assertCompleteEvaluation,
  buildReportRows,
  type EvaluationRecord,
} from "../src/campaign-report.js";
import { loadStudyConfig } from "../src/config.js";
import { loadTasks } from "../src/tasks.js";

describe("campaign orchestration", () => {
  it("creates a frozen pilot campaign on disk", async () => {
    const campaignId = "test-pilot-orchestration";
    const campaignDirectory = join(process.cwd(), "campaigns", campaignId);
    await rm(campaignDirectory, { recursive: true, force: true });

    try {
      const created = await createCampaignOnDisk({
        projectRoot: process.cwd(),
        purpose: "pilot",
        campaignId,
      });

      expect(created.manifest.expectedGenerations).toBe(9);
      expect(created.manifest.taskIds).toEqual(["task-01", "task-02", "task-03"]);
      expect(created.manifest.models.every((model) => model.cohort === "primary")).toBe(true);
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });

  it("refuses an unsafe campaign ID", async () => {
    await expect(createCampaignOnDisk({
      projectRoot: process.cwd(),
      purpose: "pilot",
      campaignId: "../escape",
    })).rejects.toThrow(/campaign ID/i);
  });
});

describe("campaign report assembly", () => {
  it("rejects an incomplete final schedule", async () => {
    const config = await loadStudyConfig(join(process.cwd(), "config/study.json"));
    const tasks = await loadTasks(join(process.cwd(), "tasks"));
    const campaign = {
      schemaVersion: 1 as const,
      campaignId: "report-test",
      purpose: "pilot" as const,
      createdAt: "2026-09-02T00:00:00.000Z",
      seed: "seed",
      taskIds: ["task-01"],
      models: [config.models[0]!],
      runs: 1,
      expectedGenerations: 1,
      hashes: { study: "", tasks: "", prompt: "", lockfile: "" },
      schedule: [{
        campaignId: "report-test",
        generationId: "report-test--sol--task-01--run-1",
        taskId: "task-01",
        modelKey: "sol",
        cohort: "primary" as const,
        run: 1,
      }],
    };

    expect(() => assertCompleteEvaluation(campaign, [])).toThrow(/missing/i);
    const row = buildReportRows(campaign, tasks, [
      {
        generationId: "report-test--sol--task-01--run-1",
        cohort: "primary" as const,
        modelKey: "sol",
        model: "openai/gpt-5.6-sol",
        taskId: "task-01",
        taskCategory: "data-transformation",
        run: 1,
        generationStatus: "succeeded",
        extractionStatus: "succeeded",
        compileStatus: "passed",
        compilerErrorCount: 0,
        testStatus: "passed",
        testsPassed: 1,
        testsTotal: 1,
        testPassRatio: 1,
        fullyCorrect: true,
        eslintErrors: 0,
        eslintWarnings: 0,
        explicitAnyCount: 0,
        qualityGatePass: true,
      } satisfies EvaluationRecord,
    ]);

    expect(row).toHaveLength(1);
    expect(row[0]?.taskCategory).toBe("data-transformation");
  });
});
