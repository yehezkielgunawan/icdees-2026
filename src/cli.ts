import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createCampaignOnDisk,
  type CreateCampaignOptions,
} from "./campaign-store.js";
import { loadStudyConfig } from "./config.js";
import {
  ManagedOpenCodeRuntime,
  resolveConfiguredModel,
} from "./opencode-runtime.js";
import { runGenerationCampaign } from "./generation-campaign.js";
import { runEvaluationCampaign } from "./evaluation-campaign.js";
import { runReportCampaign } from "./report-campaign.js";
import { loadTasks, validateTaskSet } from "./tasks.js";

export type CliCommand =
  | "doctor"
  | "validate-tasks"
  | "create-campaign"
  | "generate"
  | "evaluate"
  | "report";

export type CliOptionValue = string | boolean;

export interface ParsedCommandLine {
  command: CliCommand;
  options: Record<string, CliOptionValue>;
}

export interface CliRunOptions {
  projectRoot?: string;
  openCodeBinary?: string;
}

const commands = new Set<CliCommand>([
  "doctor",
  "validate-tasks",
  "create-campaign",
  "generate",
  "evaluate",
  "report",
]);
const booleanOptions = new Set(["resume", "partial", "skip-live", "help"]);

function removeForwardedDelimiter(argv: readonly string[]): readonly string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

export function parseCommandLine(argv: readonly string[]): ParsedCommandLine {
  const [command, ...rawArgumentsList] = argv;
  const argumentsList = removeForwardedDelimiter(rawArgumentsList);
  if (!command || !commands.has(command as CliCommand)) {
    throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  }
  const options: Record<string, CliOptionValue> = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument ?? "(missing)"}`);
    }
    const value = argumentsList[index + 1];
    const key = argument.slice(2);
    if (key === "") {
      throw new Error("Option name cannot be empty");
    }
    if (booleanOptions.has(key)) {
      options[key] = true;
      continue;
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  return { command: command as CliCommand, options };
}

function stringOption(
  options: Record<string, CliOptionValue>,
  key: string,
): string {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Option --${key} is required`);
  }
  return value;
}

function optionalStringOption(
  options: Record<string, CliOptionValue>,
  key: string,
): string | undefined {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Option --${key} requires a value`);
  }
  return value;
}

function positiveIntegerOption(
  options: Record<string, CliOptionValue>,
  key: string,
): number | undefined {
  const value = optionalStringOption(options, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Option --${key} must be a positive integer`);
  }
  return parsed;
}

function purposeOption(
  options: Record<string, CliOptionValue>,
): CreateCampaignOptions["purpose"] {
  const purpose = stringOption(options, "purpose");
  if (purpose !== "pilot" && purpose !== "final" && purpose !== "exploratory") {
    throw new Error("Option --purpose must be pilot, final, or exploratory");
  }
  return purpose;
}

async function runDoctor(
  projectRoot: string,
  skipLive: boolean,
  openCodeBinary?: string,
): Promise<Record<string, unknown>> {
  const config = await loadStudyConfig(join(projectRoot, "config/study.json"));
  const tasks = await loadTasks(join(projectRoot, "tasks"));
  validateTaskSet(tasks);
  if (skipLive) {
    return {
      command: "doctor",
      live: false,
      taskCount: tasks.length,
      modelCount: config.models.length,
    };
  }

  const runtime = new ManagedOpenCodeRuntime({
    projectRoot,
    configPath: join(projectRoot, "config/opencode/opencode.json"),
    stateDirectory: join(projectRoot, ".work", "doctor-opencode-state"),
    ...(openCodeBinary === undefined ? {} : { openCodeBinary }),
  });
  try {
    await runtime.start();
    try {
      const providers = await runtime.providers();
      const models = config.models.map((model) => ({
        key: model.key,
        model: `${model.providerID}/${model.modelID}`,
        ...resolveConfiguredModel(providers, model),
      }));
      return {
        command: "doctor",
        live: true,
        taskCount: tasks.length,
        modelCount: models.length,
        runtime: runtime.runtimeInfo,
        models,
      };
    } finally {
      await runtime.stop();
    }
  } finally {
    await rm(join(projectRoot, ".work", "doctor-opencode-state"), {
      recursive: true,
      force: true,
    });
  }
}

export async function runCli(
  argv: readonly string[],
  options: CliRunOptions = {},
): Promise<Record<string, unknown>> {
  const parsed = parseCommandLine(argv);
  const projectRoot = options.projectRoot ?? process.cwd();
  const handlers: Record<
    CliCommand,
    (command: ParsedCommandLine) => Promise<Record<string, unknown>>
  > = {
    doctor: (command) => runDoctor(
      projectRoot,
      command.options["skip-live"] === true,
      options.openCodeBinary,
    ),
    "validate-tasks": async (command) => {
      const tasks = await loadTasks(join(projectRoot, "tasks"));
      validateTaskSet(tasks);
      return { command: command.command, taskCount: tasks.length };
    },
    "create-campaign": async (command) => {
      const taskIds = optionalStringOption(command.options, "tasks")
        ?.split(",")
        .filter(Boolean);
      const runs = positiveIntegerOption(command.options, "runs");
      const campaignOptions: CreateCampaignOptions = {
        projectRoot,
        purpose: purposeOption(command.options),
        campaignId: stringOption(command.options, "campaign"),
        ...(taskIds === undefined ? {} : { taskIds }),
        ...(runs === undefined ? {} : { runs }),
      };
      const created = await createCampaignOnDisk(campaignOptions);
      return {
        command: command.command,
        campaignId: created.manifest.campaignId,
        manifestPath: created.manifestPath,
        expectedGenerations: created.manifest.expectedGenerations,
      };
    },
    generate: async (command) => ({
      command: command.command,
      ...(await runGenerationCampaign({
        projectRoot,
        campaignId: stringOption(command.options, "campaign"),
        resume: command.options.resume === true,
        ...(options.openCodeBinary === undefined ? {} : { openCodeBinary: options.openCodeBinary }),
      })),
    }),
    evaluate: async (command) => ({
      command: command.command,
      ...(await runEvaluationCampaign({
        projectRoot,
        campaignId: stringOption(command.options, "campaign"),
        resume: command.options.resume === true,
      })),
    }),
    report: async (command) => ({
      command: command.command,
      ...(await runReportCampaign({
        projectRoot,
        campaignId: stringOption(command.options, "campaign"),
        allowPartial: command.options.partial === true,
      })),
    }),
  };
  return handlers[parsed.command](parsed);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await runCli(argv);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
