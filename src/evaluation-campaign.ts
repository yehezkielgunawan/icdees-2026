import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readCampaignManifest } from "./campaign-store.js";
import { loadStudyConfig } from "./config.js";
import {
  generationArtifactDirectory,
} from "./artifacts.js";
import {
  evaluateCandidate,
  type CandidateEvaluationResult,
} from "./evaluate.js";
import { writeJsonAtomically } from "./storage.js";
import type { GenerationStatus } from "./generation.js";
import { loadTasks, type TaskDefinition } from "./tasks.js";
import type { ScheduleItem } from "./types.js";
import type { EvaluationRecord } from "./campaign-report.js";

const generationStatuses = new Set<GenerationStatus>([
  "succeeded",
  "provider-error",
  "empty-output",
  "timeout",
  "error",
]);

interface GenerationMetadata {
  status: GenerationStatus;
}

export interface EvaluationCampaignOptions {
  projectRoot: string;
  campaignId: string;
  resume?: boolean;
}

export interface EvaluationCampaignSummary {
  campaignId: string;
  evaluated: number;
  skipped: number;
  statuses: Record<string, number>;
}

export function evaluationRecordPath(
  campaignDirectory: string,
  item: Pick<ScheduleItem, "cohort" | "modelKey" | "taskId" | "run">,
): string {
  return join(
    campaignDirectory,
    "evaluations",
    item.cohort,
    item.modelKey,
    item.taskId,
    `run-${item.run}.json`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function taskFor(tasks: readonly TaskDefinition[], taskId: string): TaskDefinition {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(`Campaign references missing task: ${taskId}`);
  }
  return task;
}

function generationStatus(value: unknown): GenerationStatus {
  if (typeof value === "string" && generationStatuses.has(value as GenerationStatus)) {
    return value as GenerationStatus;
  }
  throw new Error("Generation metadata contains an invalid status");
}

function buildRecord(
  item: ScheduleItem,
  task: TaskDefinition,
  model: string,
  generationStatusValue: GenerationStatus,
  result: CandidateEvaluationResult,
): EvaluationRecord {
  return {
    generationId: item.generationId,
    cohort: item.cohort,
    modelKey: item.modelKey,
    model,
    taskId: item.taskId,
    taskCategory: task.category,
    run: item.run,
    generationStatus: generationStatusValue,
    extractionStatus: result.extractionStatus,
    compileStatus: result.compileStatus,
    compilerErrorCount: result.compilerErrorCount,
    testStatus: result.testStatus,
    testsPassed: result.testsPassed,
    testsTotal: result.testsTotal,
    testPassRatio: result.testPassRatio,
    fullyCorrect: result.fullyCorrect,
    eslintErrors: result.eslintErrors,
    eslintWarnings: result.eslintWarnings,
    explicitAnyCount: result.explicitAnyCount,
    qualityGatePass: result.qualityGatePass,
    details: result,
  };
}

function incrementStatus(
  statuses: Record<string, number>,
  result: CandidateEvaluationResult,
): void {
  const key = result.qualityGatePass ? "quality-gate-pass" : "quality-gate-fail";
  statuses[key] = (statuses[key] ?? 0) + 1;
}

export async function runEvaluationCampaign(
  options: EvaluationCampaignOptions,
): Promise<EvaluationCampaignSummary> {
  const manifest = await readCampaignManifest(options.projectRoot, options.campaignId);
  const config = await loadStudyConfig(join(options.projectRoot, "config/study.json"));
  const tasks = await loadTasks(join(options.projectRoot, "tasks"));
  const campaignDirectory = join(options.projectRoot, "campaigns", options.campaignId);
  const summary: EvaluationCampaignSummary = {
    campaignId: options.campaignId,
    evaluated: 0,
    skipped: 0,
    statuses: {},
  };

  for (const item of manifest.schedule) {
    const outputPath = evaluationRecordPath(campaignDirectory, item);
    if (await exists(outputPath)) {
      if (!options.resume) {
        throw new Error(`Evaluation already exists: ${item.generationId}`);
      }
      summary.skipped += 1;
      continue;
    }

    const task = taskFor(tasks, item.taskId);
    const model = manifest.models.find((candidate) => candidate.key === item.modelKey);
    if (!model) {
      throw new Error(`Campaign references missing model: ${item.modelKey}`);
    }
    const artifactDirectory = generationArtifactDirectory(campaignDirectory, item);
    const metadataPath = join(artifactDirectory, "metadata.json");
    if (!(await exists(metadataPath))) {
      throw new Error(`Missing generation artifacts: ${item.generationId}`);
    }
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as GenerationMetadata;
    const status = generationStatus(metadata.status);
    const source = status === "succeeded"
      ? await readFile(join(artifactDirectory, "source.ts"), "utf8")
      : "";
    const result = await evaluateCandidate({
      projectRoot: options.projectRoot,
      task,
      generationId: item.generationId,
      source,
      limits: config.evaluation,
    });
    await writeJsonAtomically(
      outputPath,
      buildRecord(
        item,
        task,
        `${model.providerID}/${model.modelID}`,
        status,
        result,
      ),
    );
    summary.evaluated += 1;
    incrementStatus(summary.statuses, result);
  }
  return summary;
}
