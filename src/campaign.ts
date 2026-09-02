import type { Cohort, ModelConfig, ScheduleItem } from "./types.js";
import { buildSchedule } from "./schedule.js";

export type CampaignPurpose = "pilot" | "final" | "exploratory";

export interface CampaignHashes {
  study: string;
  tasks: string;
  prompt: string;
  lockfile: string;
}

export interface CampaignManifest {
  schemaVersion: 1;
  campaignId: string;
  purpose: CampaignPurpose;
  createdAt: string;
  seed: string;
  taskIds: string[];
  models: ModelConfig[];
  runs: number;
  expectedGenerations: number;
  hashes: CampaignHashes;
  lockfileName?: string;
  schedule: ScheduleItem[];
}

export interface CampaignScope {
  taskIds: string[];
  models: ModelConfig[];
}

export function assertCampaignHashes(
  expected: CampaignHashes,
  actual: CampaignHashes,
): void {
  for (const key of ["study", "tasks", "prompt", "lockfile"] as const) {
    if (expected[key] !== actual[key]) {
      throw new Error(`Campaign input hash changed: ${key}`);
    }
  }
}

export function selectCampaignScope(
  models: readonly ModelConfig[],
  taskIds: readonly string[],
  cohort: Cohort,
): CampaignScope {
  const selectedModels = models.filter((model) => model.cohort === cohort);
  if (selectedModels.length === 0) {
    throw new Error(`No models configured for ${cohort} cohort`);
  }
  if (taskIds.length === 0) {
    throw new Error("Campaign must contain at least one task");
  }
  return { taskIds: [...taskIds], models: selectedModels };
}

export interface BuildCampaignManifestOptions {
  campaignId: string;
  purpose: CampaignPurpose;
  seed: string;
  taskIds: readonly string[];
  models: readonly ModelConfig[];
  runs: number;
  hashes: CampaignHashes;
  lockfileName?: string;
  createdAt?: string;
}

export function buildCampaignManifest(
  options: BuildCampaignManifestOptions,
): CampaignManifest {
  const schedule = buildSchedule({
    campaignId: options.campaignId,
    seed: options.seed,
    runs: options.runs,
    tasks: options.taskIds,
    models: options.models,
  });
  return {
    schemaVersion: 1,
    campaignId: options.campaignId,
    purpose: options.purpose,
    createdAt: options.createdAt ?? new Date().toISOString(),
    seed: options.seed,
    taskIds: [...options.taskIds],
    models: options.models.map((model) => ({ ...model })),
    runs: options.runs,
    expectedGenerations: schedule.length,
    hashes: { ...options.hashes },
    ...(options.lockfileName === undefined ? {} : { lockfileName: options.lockfileName }),
    schedule,
  };
}
