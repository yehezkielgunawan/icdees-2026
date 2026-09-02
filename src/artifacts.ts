import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeModelOutput } from "./normalize.js";
import { sha256 } from "./hash.js";
import { writeJsonAtomically } from "./storage.js";
import type { Cohort } from "./types.js";
import type { GenerationResult } from "./generation.js";

export interface PersistGenerationInput {
  generationId: string;
  cohort: Cohort;
  modelKey: string;
  taskId: string;
  run: number;
  prompt: string;
  result: GenerationResult;
}

export interface GenerationArtifactPaths {
  directory: string;
  rawResponsePath: string;
  rawTextPath: string;
  sourcePath: string;
  metadataPath: string;
}

function component(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function generationArtifactDirectory(
  campaignDirectory: string,
  input: Pick<PersistGenerationInput, "cohort" | "modelKey" | "taskId" | "run">,
): string {
  return join(
    campaignDirectory,
    "generations",
    component(input.cohort),
    component(input.modelKey),
    component(input.taskId),
    `run-${input.run}`,
  );
}

export async function persistGenerationArtifacts(
  campaignDirectory: string,
  input: PersistGenerationInput,
): Promise<GenerationArtifactPaths> {
  const directory = generationArtifactDirectory(campaignDirectory, input);
  await mkdir(directory, { recursive: true });
  const paths = {
    directory,
    rawResponsePath: join(directory, "raw-response.json"),
    rawTextPath: join(directory, "raw.txt"),
    sourcePath: join(directory, "source.ts"),
    metadataPath: join(directory, "metadata.json"),
  };

  await writeJsonAtomically(paths.rawResponsePath, input.result.rawResponse ?? null);
  await writeFile(paths.rawTextPath, input.result.rawText, "utf8");
  const normalized = normalizeModelOutput(input.result.rawText);
  await writeFile(paths.sourcePath, normalized.source, "utf8");
  await writeJsonAtomically(paths.metadataPath, {
    generationId: input.generationId,
    cohort: input.cohort,
    modelKey: input.modelKey,
    taskId: input.taskId,
    run: input.run,
    prompt: input.prompt,
    status: input.result.status,
    error: input.result.error ?? null,
    sessionId: input.result.sessionId,
    usage: input.result.usage,
    generationTimeMs: input.result.generationTimeMs,
    rawTextChars: input.result.rawText.length,
    rawTextSha256: sha256(input.result.rawText),
    sourceChars: normalized.source.length,
    sourceSha256: sha256(normalized.source),
    normalizationActions: normalized.actions,
    persistedAt: new Date().toISOString(),
  });
  return paths;
}
