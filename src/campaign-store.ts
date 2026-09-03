import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCampaignHashes,
  buildCampaignManifest,
  selectCampaignScope,
  type CampaignHashes,
  type CampaignManifest,
  type CampaignPurpose,
} from "./campaign.js";
import { loadStudyConfig } from "./config.js";
import { sha256, sha256File } from "./hash.js";
import { resolveProjectLockfile, type ProjectLockfile } from "./lockfile.js";
import { buildPrompt } from "./prompts.js";
import { writeJsonAtomically } from "./storage.js";
import { loadTasks, validateTaskSet, type TaskDefinition } from "./tasks.js";

export interface CreateCampaignOptions {
  projectRoot: string;
  purpose: CampaignPurpose;
  campaignId: string;
  taskIds?: readonly string[];
  runs?: number;
}

export interface CreatedCampaign {
  directory: string;
  manifestPath: string;
  manifest: CampaignManifest;
}

export interface StoredCampaignManifest extends CampaignManifest {
  promptTemplate: string;
  taskCount: number;
  generatedPromptExample: string;
}

function assertCampaignId(campaignId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(campaignId)) {
    throw new Error("Campaign ID may contain only letters, numbers, dots, underscores, and hyphens");
  }
}

async function hashTaskInputs(tasks: readonly TaskDefinition[]): Promise<string> {
  const contents: string[] = [];
  for (const task of tasks) {
    for (const path of [task.testPath, task.referencePath, join(task.directory, "task.json")]) {
      contents.push(`${path}\n${await readFile(path, "utf8")}`);
    }
  }
  return sha256(contents.join("\n"));
}

async function campaignHashes(
  projectRoot: string,
  tasks: readonly TaskDefinition[],
  lockfile: ProjectLockfile,
): Promise<CampaignHashes> {
  return {
    study: await sha256File(join(projectRoot, "config/study.json")),
    tasks: await hashTaskInputs(tasks),
    prompt: await sha256File(join(projectRoot, "prompts/code-generation.txt")),
    lockfile: await sha256File(lockfile.path),
  };
}

export async function computeCampaignInputHashes(
  projectRoot: string,
  lockfileName?: string,
): Promise<CampaignHashes> {
  const lockfile = await resolveProjectLockfile(projectRoot, lockfileName);
  return campaignHashes(projectRoot, await loadTasks(join(projectRoot, "tasks")), lockfile);
}

async function assertStoredCampaignHashes(
  projectRoot: string,
  record: Pick<StoredCampaignManifest, "hashes" | "lockfileName">,
  allowLockfileChanges = false,
): Promise<void> {
  try {
    assertCampaignHashes(
      record.hashes,
      await computeCampaignInputHashes(projectRoot, record.lockfileName),
    );
    return;
  } catch (error) {
    if (
      allowLockfileChanges
      && error instanceof Error
      && error.message === "Campaign input hash changed: lockfile"
    ) {
      return;
    }
    if (
      record.lockfileName !== undefined
      || !(error instanceof Error)
      || error.message !== "Campaign input hash changed: lockfile"
    ) {
      throw error;
    }

    try {
      assertCampaignHashes(
        record.hashes,
        await computeCampaignInputHashes(projectRoot, "package-lock.json"),
      );
    } catch (legacyError) {
      if (
        legacyError instanceof Error
        && legacyError.message === "Campaign lockfile is missing: package-lock.json"
      ) {
        throw error;
      }
      throw legacyError;
    }
  }
}

export interface ReadCampaignManifestOptions {
  allowLockfileChanges?: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createCampaignOnDisk(
  options: CreateCampaignOptions,
): Promise<CreatedCampaign> {
  assertCampaignId(options.campaignId);
  const campaignDirectory = join(options.projectRoot, "campaigns", options.campaignId);
  if (await pathExists(campaignDirectory)) {
    throw new Error(`Campaign already exists: ${options.campaignId}`);
  }

  const studyPath = join(options.projectRoot, "config/study.json");
  const promptPath = join(options.projectRoot, "prompts/code-generation.txt");
  const config = await loadStudyConfig(studyPath);
  const tasks = await loadTasks(join(options.projectRoot, "tasks"));
  validateTaskSet(tasks);
  const taskIds = options.taskIds
    ? [...options.taskIds]
    : options.purpose === "pilot"
      ? tasks.slice(0, 3).map((task) => task.id)
      : tasks.map((task) => task.id);
  const cohort = options.purpose === "exploratory" ? "exploratory" : "primary";
  const scope = selectCampaignScope(config.models, taskIds, cohort);
  const lockfile = await resolveProjectLockfile(options.projectRoot);
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("Campaign runs must be a positive integer");
  }
  const promptTemplate = await readFile(promptPath, "utf8");
  if (promptTemplate.includes("{TASK_DESCRIPTION}") === false || promptTemplate.includes("{FUNCTION_SIGNATURE}") === false) {
    throw new Error("Prompt template is missing required placeholders");
  }
  const manifest = buildCampaignManifest({
    campaignId: options.campaignId,
    purpose: options.purpose,
    seed: config.scheduleSeed,
    taskIds: scope.taskIds,
    models: scope.models,
    runs,
    lockfileName: lockfile.name,
    hashes: {
      ...await campaignHashes(options.projectRoot, tasks, lockfile),
    },
  });
  await mkdir(campaignDirectory, { recursive: true });
  const manifestPath = join(campaignDirectory, "manifest.json");
  await writeJsonAtomically(manifestPath, {
    ...manifest,
    promptTemplate,
    taskCount: tasks.length,
    generatedPromptExample: buildPrompt(promptTemplate, tasks[0] ?? {
      description: "",
      signature: "",
    }),
  });
  return { directory: campaignDirectory, manifestPath, manifest };
}

export async function readCampaignManifest(
  projectRoot: string,
  campaignId: string,
  options: ReadCampaignManifestOptions = {},
): Promise<StoredCampaignManifest> {
  assertCampaignId(campaignId);
  const path = join(projectRoot, "campaigns", campaignId, "manifest.json");
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  const record = value as Partial<StoredCampaignManifest>;
  if (
    record.schemaVersion !== 1 ||
    record.campaignId !== campaignId ||
    typeof record.promptTemplate !== "string" ||
    !Array.isArray(record.schedule) ||
    !record.hashes
  ) {
    throw new Error(`Invalid campaign manifest: ${campaignId}`);
  }
  await assertStoredCampaignHashes(projectRoot, {
    hashes: record.hashes as CampaignHashes,
    ...(record.lockfileName === undefined ? {} : { lockfileName: record.lockfileName }),
  }, options.allowLockfileChanges === true);
  return value as StoredCampaignManifest;
}
