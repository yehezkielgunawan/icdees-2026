import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCampaignOnDisk, readCampaignManifest } from "../src/campaign-store.js";
import {
  evaluationRecordPath,
} from "../src/evaluation-campaign.js";
import {
  runReportCampaign,
} from "../src/report-campaign.js";
import { writeJsonAtomically } from "../src/storage.js";
import type { EvaluationRecord } from "../src/campaign-report.js";

function recordFor(item: {
  generationId: string;
  cohort: "primary" | "exploratory";
  modelKey: string;
  taskId: string;
  run: number;
}, model: string): EvaluationRecord {
  return {
    generationId: item.generationId,
    cohort: item.cohort,
    modelKey: item.modelKey,
    model,
    taskId: item.taskId,
    taskCategory: "data-transformation",
    run: item.run,
    generationStatus: "succeeded",
    extractionStatus: "succeeded",
    compileStatus: "passed",
    compilerErrorCount: 0,
    testStatus: "passed",
    testsPassed: 4,
    testsTotal: 4,
    testPassRatio: 1,
    fullyCorrect: true,
    eslintErrors: 0,
    eslintWarnings: 0,
    explicitAnyCount: 0,
    qualityGatePass: true,
  };
}

describe("report campaign runner", () => {
  it("loads complete evaluation records and creates report files", async () => {
    const campaignId = "test-report-runner";
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
      for (const item of manifest.schedule) {
        const model = manifest.models.find((candidate) => candidate.key === item.modelKey);
        await writeJsonAtomically(
          evaluationRecordPath(campaignDirectory, item),
          recordFor(item, `${model?.providerID}/${model?.modelID}`),
        );
      }

      await expect(runReportCampaign({
        projectRoot: process.cwd(),
        campaignId,
      })).resolves.toMatchObject({
        rows: 3,
        complete: true,
      });

      expect(await readFile(join(campaignDirectory, "report/results.csv"), "utf8"))
        .toContain("generation_id,cohort,model_key");
      expect(JSON.parse(await readFile(
        join(campaignDirectory, "report/summary.json"),
        "utf8",
      ))).toHaveProperty("primary/sol");
      expect(JSON.parse(await readFile(
        join(campaignDirectory, "report/completeness.json"),
        "utf8",
      )).complete).toBe(true);
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });
});
