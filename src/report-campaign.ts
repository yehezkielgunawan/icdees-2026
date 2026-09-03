import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCompleteEvaluation,
  buildReportRows,
  type EvaluationRecord,
} from "./campaign-report.js";
import { readCampaignManifest } from "./campaign-store.js";
import { evaluationRecordPath } from "./evaluation-campaign.js";
import { loadTasks } from "./tasks.js";
import {
  summarizeByModel,
  writeReportFiles,
} from "./report.js";
import { writePublicationFiles } from "./publication.js";
import { buildPublicationReport } from "./publication-report.js";
import { writeJsonAtomically } from "./storage.js";

export interface ReportCampaignOptions {
  projectRoot: string;
  campaignId: string;
  allowPartial?: boolean;
}

export interface ReportCampaignSummary {
  campaignId: string;
  reportDirectory: string;
  publicationDirectory: string;
  rows: number;
  complete: boolean;
  missing: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runReportCampaign(
  options: ReportCampaignOptions,
): Promise<ReportCampaignSummary> {
  const manifest = await readCampaignManifest(options.projectRoot, options.campaignId, {
    allowLockfileChanges: true,
  });
  const tasks = await loadTasks(join(options.projectRoot, "tasks"));
  const campaignDirectory = join(options.projectRoot, "campaigns", options.campaignId);
  const records: EvaluationRecord[] = [];
  const missing: string[] = [];

  for (const item of manifest.schedule) {
    const path = evaluationRecordPath(campaignDirectory, item);
    if (!(await exists(path))) {
      missing.push(item.generationId);
      continue;
    }
    records.push(JSON.parse(await readFile(path, "utf8")) as EvaluationRecord);
  }
  if (missing.length > 0 && !options.allowPartial) {
    assertCompleteEvaluation(manifest, records);
  }

  const rows = buildReportRows(manifest, tasks, records);
  const reportDirectory = join(campaignDirectory, "report");
  await writeReportFiles(reportDirectory, {
    rows,
    summaries: summarizeByModel(rows),
  });
  await writeJsonAtomically(join(reportDirectory, "completeness.json"), {
    schemaVersion: 1,
    expected: manifest.expectedGenerations,
    evaluated: records.length,
    missing,
    complete: missing.length === 0,
    generatedAt: new Date().toISOString(),
  });
  const publicationReport = buildPublicationReport({
    manifest,
    tasks,
    rows,
    complete: missing.length === 0,
  });
  const publicationDirectory = await writePublicationFiles(reportDirectory, publicationReport);

  return {
    campaignId: options.campaignId,
    reportDirectory,
    publicationDirectory,
    rows: rows.length,
    complete: missing.length === 0,
    missing,
  };
}
