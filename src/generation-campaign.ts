import { access, mkdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { loadStudyConfig } from "./config.js";
import {
  readCampaignManifest,
  type StoredCampaignManifest,
} from "./campaign-store.js";
import { buildPrompt } from "./prompts.js";
import {
  generateWithClient,
  type GenerationClient,
  type GenerationOptions,
  type GenerationResult,
} from "./generation.js";
import {
  generationArtifactDirectory,
  persistGenerationArtifacts,
} from "./artifacts.js";
import {
  ManagedOpenCodeRuntime,
  resolveConfiguredModel,
  type ProviderSnapshot,
  type ResolvedModel,
  type RuntimeInfo,
  type RuntimeOptions,
} from "./opencode-runtime.js";
import { writeJsonAtomically } from "./storage.js";
import { loadTasks, type TaskDefinition } from "./tasks.js";
import type { ModelConfig } from "./types.js";

export interface CampaignRuntime {
  readonly generationClient: GenerationClient;
  readonly runtimeInfo: RuntimeInfo;
  start(): Promise<RuntimeInfo>;
  providers(): Promise<ProviderSnapshot>;
  stop(): Promise<void>;
}

export interface GenerationRunnerDependencies {
  createRuntime?: (options: RuntimeOptions) => CampaignRuntime;
  generate?: (options: GenerationOptions) => Promise<GenerationResult>;
}

export interface GenerationRecord {
  schemaVersion: 1;
  generationId: string;
  campaignId: string;
  taskId: string;
  taskCategory: string;
  modelKey: string;
  model: string;
  label: string;
  cohort: string;
  run: number;
  prompt: string;
  status: GenerationResult["status"];
  requestedTemperature: number;
  temperatureApplied: number | null;
  temperatureSupported: boolean;
  maxOutputTokens: number;
  runtime: RuntimeInfo;
  usage: GenerationResult["usage"];
  generationTimeMs: number;
  error: string | null;
  artifacts: Record<string, string>;
  createdAt: string;
}

export interface GenerationCampaignOptions {
  projectRoot: string;
  campaignId: string;
  resume?: boolean;
  openCodeBinary?: string;
  dependencies?: GenerationRunnerDependencies;
}

export interface GenerationCampaignSummary {
  campaignId: string;
  generated: number;
  skipped: number;
  statuses: Record<string, number>;
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

function modelFor(models: readonly ModelConfig[], modelKey: string): ModelConfig {
  const model = models.find((item) => item.key === modelKey);
  if (!model) {
    throw new Error(`Campaign references missing model: ${modelKey}`);
  }
  return model;
}

function incrementStatus(
  statuses: Record<string, number>,
  status: GenerationResult["status"],
): void {
  statuses[status] = (statuses[status] ?? 0) + 1;
}

async function pendingSchedule(
  schedule: StoredCampaignManifest["schedule"],
  campaignDirectory: string,
  resume: boolean,
  summary: GenerationCampaignSummary,
): Promise<StoredCampaignManifest["schedule"]> {
  const pending: StoredCampaignManifest["schedule"] = [];
  for (const item of schedule) {
    const metadataPath = join(
      generationArtifactDirectory(campaignDirectory, item),
      "metadata.json",
    );
    if (await exists(metadataPath)) {
      if (!resume) {
        throw new Error(`Generation already exists: ${item.generationId}`);
      }
      summary.skipped += 1;
      continue;
    }
    pending.push(item);
  }
  return pending;
}

function buildGenerationRecord(
  manifest: StoredCampaignManifest,
  task: TaskDefinition,
  model: ModelConfig,
  resolved: ResolvedModel,
  item: StoredCampaignManifest["schedule"][number],
  prompt: string,
  result: GenerationResult,
  runtime: CampaignRuntime,
  paths: Awaited<ReturnType<typeof persistGenerationArtifacts>>,
  projectRoot: string,
  requestedTemperature: number,
  maxOutputTokens: number,
): GenerationRecord {
  return {
    schemaVersion: 1,
    generationId: item.generationId,
    campaignId: manifest.campaignId,
    taskId: task.id,
    taskCategory: task.category,
    modelKey: model.key,
    model: `${model.providerID}/${model.modelID}`,
    label: model.label,
    cohort: model.cohort,
    run: item.run,
    prompt,
    status: result.status,
    requestedTemperature,
    temperatureApplied: resolved.temperatureSupported ? requestedTemperature : null,
    temperatureSupported: resolved.temperatureSupported,
    maxOutputTokens,
    runtime: runtime.runtimeInfo,
    usage: result.usage,
    generationTimeMs: result.generationTimeMs,
    error: result.error ?? null,
    artifacts: {
      rawResponse: relative(projectRoot, paths.rawResponsePath),
      rawText: relative(projectRoot, paths.rawTextPath),
      source: relative(projectRoot, paths.sourcePath),
      metadata: relative(projectRoot, paths.metadataPath),
    },
    createdAt: new Date().toISOString(),
  };
}

interface GeneratePendingOptions {
  pending: StoredCampaignManifest["schedule"];
  manifest: StoredCampaignManifest;
  tasks: readonly TaskDefinition[];
  runtime: CampaignRuntime;
  resolvedModels: ReadonlyMap<string, ResolvedModel>;
  campaignDirectory: string;
  projectRoot: string;
  timeoutMs: number;
  requestedTemperature: number;
  maxOutputTokens: number;
  generate: (options: GenerationOptions) => Promise<GenerationResult>;
  summary: GenerationCampaignSummary;
}

async function generatePending(options: GeneratePendingOptions): Promise<void> {
  for (const item of options.pending) {
    const task = taskFor(options.tasks, item.taskId);
    const model = modelFor(options.manifest.models, item.modelKey);
    const resolved = options.resolvedModels.get(model.key);
    if (!resolved) {
      throw new Error(`Model resolution missing: ${model.key}`);
    }
    const prompt = buildPrompt(options.manifest.promptTemplate, task);
    const inferenceDirectory = join(options.campaignDirectory, "inference", item.generationId);
    await mkdir(inferenceDirectory, { recursive: true });
    try {
      const result = await options.generate({
        client: options.runtime.generationClient,
        directory: inferenceDirectory,
        generationId: item.generationId,
        prompt,
        model,
        timeoutMs: options.timeoutMs,
      });
      const paths = await persistGenerationArtifacts(options.campaignDirectory, {
        generationId: item.generationId,
        cohort: item.cohort,
        modelKey: item.modelKey,
        taskId: item.taskId,
        run: item.run,
        prompt,
        result,
      });
      await writeJsonAtomically(
        join(paths.directory, "generation-record.json"),
        buildGenerationRecord(
          options.manifest,
          task,
          model,
          resolved,
          item,
          prompt,
          result,
          options.runtime,
          paths,
          options.projectRoot,
          options.requestedTemperature,
          options.maxOutputTokens,
        ),
      );
      options.summary.generated += 1;
      incrementStatus(options.summary.statuses, result.status);
    } finally {
      await rm(inferenceDirectory, { recursive: true, force: true });
    }
  }
}

export async function runGenerationCampaign(
  options: GenerationCampaignOptions,
): Promise<GenerationCampaignSummary> {
  const manifest = await readCampaignManifest(options.projectRoot, options.campaignId);
  const config = await loadStudyConfig(join(options.projectRoot, "config/study.json"));
  const tasks = await loadTasks(join(options.projectRoot, "tasks"));
  const campaignDirectory = join(options.projectRoot, "campaigns", options.campaignId);
  const summary: GenerationCampaignSummary = {
    campaignId: options.campaignId,
    generated: 0,
    skipped: 0,
    statuses: {},
  };
  const pending = await pendingSchedule(
    manifest.schedule,
    campaignDirectory,
    options.resume === true,
    summary,
  );
  if (pending.length === 0) {
    return summary;
  }

  const runtimeOptions: RuntimeOptions = {
    projectRoot: options.projectRoot,
    configPath: join(options.projectRoot, "config/opencode/opencode.json"),
    stateDirectory: join(campaignDirectory, ".opencode-state"),
    ...(options.openCodeBinary === undefined ? {} : { openCodeBinary: options.openCodeBinary }),
  };
  const runtime = options.dependencies?.createRuntime?.(runtimeOptions)
    ?? new ManagedOpenCodeRuntime(runtimeOptions);
  const generate = options.dependencies?.generate ?? generateWithClient;

  try {
    await runtime.start();
    try {
      const providers = await runtime.providers();
      await writeJsonAtomically(
        join(campaignDirectory, "runtime/provider-snapshot.json"),
        {
          schemaVersion: 1,
          capturedAt: new Date().toISOString(),
          runtime: runtime.runtimeInfo,
          providers,
        },
      );
      const resolvedModels = new Map(
        manifest.models.map((model) => [model.key, resolveConfiguredModel(providers, model)]),
      );
      await generatePending({
        pending,
        manifest,
        tasks,
        runtime,
        resolvedModels,
        campaignDirectory,
        projectRoot: options.projectRoot,
        timeoutMs: config.generation.timeoutMs,
        requestedTemperature: config.generation.requestedTemperature,
        maxOutputTokens: config.generation.maxOutputTokens,
        generate,
        summary,
      });
    } finally {
      await runtime.stop();
    }
  } finally {
    await rm(runtimeOptions.stateDirectory, { recursive: true, force: true });
  }
  return summary;
}
