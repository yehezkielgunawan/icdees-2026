import type { CampaignManifest } from "./campaign.js";
import type { CandidateEvaluationResult } from "./evaluate.js";
import type { ReportRow } from "./report.js";
import type { TaskDefinition } from "./tasks.js";

export interface EvaluationRecord extends ReportRow {
  details?: CandidateEvaluationResult;
}

export function assertCompleteEvaluation(
  manifest: CampaignManifest,
  records: readonly EvaluationRecord[],
): void {
  const available = new Set(records.map((record) => record.generationId));
  const missing = manifest.schedule
    .map((item) => item.generationId)
    .filter((generationId) => !available.has(generationId));
  if (missing.length > 0) {
    throw new Error(`Missing evaluation records: ${missing.join(", ")}`);
  }
}

export function buildReportRows(
  manifest: CampaignManifest,
  tasks: readonly TaskDefinition[],
  records: readonly EvaluationRecord[],
): ReportRow[] {
  const taskCategories = new Map(tasks.map((task) => [task.id, task.category]));
  const byGeneration = new Map(records.map((record) => [record.generationId, record]));
  return manifest.schedule.flatMap((item) => {
    const record = byGeneration.get(item.generationId);
    if (!record) {
      return [];
    }
    return [{
      ...record,
      taskCategory: taskCategories.get(item.taskId) ?? record.taskCategory,
    }];
  });
}
