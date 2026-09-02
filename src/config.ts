import { readFile } from "node:fs/promises";
import type { Cohort, ModelConfig } from "./types.js";

export interface GenerationConfig {
  requestedTemperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface EvaluationConfig {
  compileTimeoutMs: number;
  testTimeoutMs: number;
  lintTimeoutMs: number;
  maxOutputBytes: number;
}

export interface StudyConfig {
  studyId: string;
  schemaVersion: number;
  scheduleSeed: string;
  generation: GenerationConfig;
  evaluation: EvaluationConfig;
  models: ModelConfig[];
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value as number;
}

function modelValue(value: unknown, index: number): ModelConfig {
  const record = recordValue(value, `models[${index}]`);
  const cohort = stringValue(record, "cohort", `models[${index}]`);
  if (cohort !== "primary" && cohort !== "exploratory") {
    throw new Error(`models[${index}].cohort is invalid`);
  }
  return {
    key: stringValue(record, "key", `models[${index}]`),
    label: stringValue(record, "label", `models[${index}]`),
    cohort: cohort as Cohort,
    providerID: stringValue(record, "providerID", `models[${index}]`),
    modelID: stringValue(record, "modelID", `models[${index}]`),
  };
}

export async function loadStudyConfig(path: string): Promise<StudyConfig> {
  const root = recordValue(JSON.parse(await readFile(path, "utf8")) as unknown, "study");
  const generation = recordValue(root.generation, "generation");
  const evaluation = recordValue(root.evaluation, "evaluation");
  const modelValues = root.models;
  if (!Array.isArray(modelValues)) {
    throw new Error("models must be an array");
  }
  const models = modelValues.map(modelValue);
  const keys = new Set<string>();
  const fullIDs = new Set<string>();
  for (const model of models) {
    const fullID = `${model.providerID}/${model.modelID}`;
    if (keys.has(model.key)) {
      throw new Error(`Duplicate model key: ${model.key}`);
    }
    if (fullIDs.has(fullID)) {
      throw new Error(`Duplicate model ID: ${fullID}`);
    }
    keys.add(model.key);
    fullIDs.add(fullID);
  }
  if (models.filter((model) => model.cohort === "primary").length !== 3) {
    throw new Error("Study config must contain exactly three primary models");
  }
  if (models.filter((model) => model.cohort === "exploratory").length !== 3) {
    throw new Error("Study config must contain exactly three exploratory models");
  }

  const requestedTemperature = generation.requestedTemperature;
  if (typeof requestedTemperature !== "number" || requestedTemperature < 0) {
    throw new Error("generation.requestedTemperature must be a non-negative number");
  }
  return {
    studyId: stringValue(root, "studyId", "study"),
    schemaVersion: positiveInteger(root.schemaVersion, "study.schemaVersion"),
    scheduleSeed: stringValue(root, "scheduleSeed", "study"),
    generation: {
      requestedTemperature,
      maxOutputTokens: positiveInteger(
        generation.maxOutputTokens,
        "generation.maxOutputTokens",
      ),
      timeoutMs: positiveInteger(generation.timeoutMs, "generation.timeoutMs"),
    },
    evaluation: {
      compileTimeoutMs: positiveInteger(
        evaluation.compileTimeoutMs,
        "evaluation.compileTimeoutMs",
      ),
      testTimeoutMs: positiveInteger(
        evaluation.testTimeoutMs,
        "evaluation.testTimeoutMs",
      ),
      lintTimeoutMs: positiveInteger(
        evaluation.lintTimeoutMs,
        "evaluation.lintTimeoutMs",
      ),
      maxOutputBytes: positiveInteger(
        evaluation.maxOutputBytes,
        "evaluation.maxOutputBytes",
      ),
    },
    models,
  };
}
