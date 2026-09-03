import { readFile, readdir, rm } from "node:fs/promises";
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
        publicationDirectory: join(campaignDirectory, "report", "publication"),
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
      expect(await readFile(
        join(campaignDirectory, "report/publication/tables/table-1-task-set.md"),
        "utf8",
      )).toContain("Table 1. Task set");
      expect(await readFile(
        join(campaignDirectory, "report/publication/tables/table-2-main-results.tex"),
        "utf8",
      )).toContain("tab:main-results");
      expect(await readFile(
        join(campaignDirectory, "report/publication/figures/figure-1-quality-gates.svg"),
        "utf8",
      )).toContain("Quality-gate survival by model");
      expect((await readFile(
        join(campaignDirectory, "report/publication/figures/figure-1-quality-gates.png"),
      )).subarray(0, 8)).toEqual(Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]));
      expect((await readdir(
        join(campaignDirectory, "report/publication/tables"),
      )).sort()).toEqual([
        "table-1-task-set.md",
        "table-1-task-set.tex",
        "table-2-main-results.md",
        "table-2-main-results.tex",
        "table-3-failure-characteristics.md",
        "table-3-failure-characteristics.tex",
      ]);
      expect((await readdir(
        join(campaignDirectory, "report/publication/figures"),
      )).sort()).toEqual([
        "figure-1-quality-gates.png",
        "figure-1-quality-gates.svg",
      ]);
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });

  it("labels publication outputs when partial reporting is explicitly allowed", async () => {
    const campaignId = "test-report-partial";
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
      const item = manifest.schedule[0];
      if (!item) {
        throw new Error("Expected a scheduled generation");
      }
      const model = manifest.models.find((candidate) => candidate.key === item.modelKey);
      await writeJsonAtomically(
        evaluationRecordPath(campaignDirectory, item),
        recordFor(item, `${model?.providerID}/${model?.modelID}`),
      );

      await expect(runReportCampaign({
        projectRoot: process.cwd(),
        campaignId,
        allowPartial: true,
      })).resolves.toMatchObject({ complete: false, rows: 1 });

      expect(await readFile(
        join(campaignDirectory, "report/publication/tables/table-2-main-results.md"),
        "utf8",
      )).toContain("Partial report: 1 of 3 expected generations were evaluated.");
      expect(await readFile(
        join(campaignDirectory, "report/publication/figures/figure-1-quality-gates.svg"),
        "utf8",
      )).toContain("Partial report: 1 of 3 expected generations were evaluated.");
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });
});
