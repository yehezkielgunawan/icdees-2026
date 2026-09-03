import type { CampaignManifest } from "./campaign.js";
import type { ReportRow } from "./report.js";
import type { TaskDefinition } from "./tasks.js";
import type { ModelConfig } from "./types.js";

export type PublicationManifest = Pick<
  CampaignManifest,
  "campaignId" | "taskIds" | "expectedGenerations" | "models"
>;

export interface PublicationMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface PublicationModelSummary {
  key: string;
  label: string;
  generated: number;
  compile: PublicationMetric;
  functional: PublicationMetric;
  staticClean: PublicationMetric;
  fullGate: PublicationMetric;
}

export interface PublicationTaskCategory {
  category: string;
  label: string;
  taskCount: number;
  example: string;
}

export type PublicationFailureKind =
  | "availability"
  | "safety"
  | "compilation"
  | "functional"
  | "static-quality";

export interface PublicationFailureSummary {
  kind: PublicationFailureKind;
  label: string;
  models: PublicationMetric[];
}

export interface PublicationReport {
  campaignId: string;
  complete: boolean;
  expectedGenerations: number;
  evaluatedGenerations: number;
  models: PublicationModelSummary[];
  categories: PublicationTaskCategory[];
  failures: PublicationFailureSummary[];
}

export interface BuildPublicationReportInput {
  manifest: PublicationManifest;
  tasks: readonly TaskDefinition[];
  rows: readonly ReportRow[];
  complete: boolean;
}

function metric(numerator: number, denominator: number): PublicationMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

export function formatMetric(value: PublicationMetric): string {
  if (value.rate === null) {
    return "N/A";
  }
  return `${value.numerator}/${value.denominator} (${(value.rate * 100).toFixed(1)}%)`;
}

function categoryLabel(category: string): string {
  const knownLabels: Record<string, string> = {
    "data-transformation": "Data Transformation",
    validation: "Validation",
    "string-url-processing": "String / URL Processing",
    "async-promise-utilities": "Async / Promise Utilities",
    "web-backend-utilities": "Web Backend Utilities",
  };
  const knownLabel = knownLabels[category];
  if (knownLabel) {
    return knownLabel;
  }
  return category
    .replaceAll("-", " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function isCompiled(row: ReportRow): boolean {
  return row.compileStatus === "passed";
}

function isFunctionallyCorrect(row: ReportRow): boolean {
  return isAvailable(row)
    && isCompiled(row)
    && row.testStatus === "passed"
    && row.testsPassed !== null
    && row.testsTotal !== null
    && row.testsTotal > 0
    && row.testsPassed === row.testsTotal;
}

function isFullGate(row: ReportRow): boolean {
  return isFunctionallyCorrect(row) && row.eslintErrors === 0;
}

function isAvailable(row: ReportRow): boolean {
  return row.generationStatus === "succeeded" && row.extractionStatus === "succeeded";
}

function rowsForModel(rows: readonly ReportRow[], modelKey: string): ReportRow[] {
  return rows.filter((row) => row.modelKey === modelKey);
}

function summarizeModel(model: ModelConfig, rows: readonly ReportRow[]): PublicationModelSummary {
  const compiledRows = rows.filter(isCompiled);
  const correctRows = rows.filter(isFunctionallyCorrect);
  return {
    key: model.key,
    label: model.label,
    generated: rows.length,
    compile: metric(compiledRows.length, rows.length),
    functional: metric(correctRows.length, rows.length),
    staticClean: metric(
      compiledRows.filter((row) => row.eslintErrors === 0).length,
      compiledRows.length,
    ),
    fullGate: metric(rows.filter(isFullGate).length, rows.length),
  };
}

function failureCount(kind: PublicationFailureKind, rows: readonly ReportRow[]): number {
  switch (kind) {
    case "availability":
      return rows.filter((row) => !isAvailable(row)).length;
    case "safety":
      return rows.filter((row) => isAvailable(row) && row.compileStatus === "rejected").length;
    case "compilation":
      return rows.filter(
        (row) => isAvailable(row) && row.compileStatus !== "passed" && row.compileStatus !== "rejected",
      ).length;
    case "functional":
      return rows.filter((row) => isCompiled(row) && !isFunctionallyCorrect(row)).length;
    case "static-quality":
      return rows.filter(
        (row) => isFunctionallyCorrect(row) && row.eslintErrors !== null && row.eslintErrors > 0,
      ).length;
  }
}

function failureDenominator(
  kind: PublicationFailureKind,
  rows: readonly ReportRow[],
): number {
  switch (kind) {
    case "functional":
      return rows.filter(isCompiled).length;
    case "static-quality":
      return rows.filter(isFunctionallyCorrect).length;
    case "availability":
    case "safety":
    case "compilation":
      return rows.length;
  }
}

const failureDefinitions: readonly {
  kind: PublicationFailureKind;
  label: string;
  alwaysInclude: boolean;
}[] = [
  { kind: "availability", label: "Generation/extraction failure", alwaysInclude: false },
  { kind: "safety", label: "Safety rejection", alwaysInclude: false },
  { kind: "compilation", label: "Compilation failure", alwaysInclude: true },
  { kind: "functional", label: "Compiled but functionally incorrect", alwaysInclude: true },
  { kind: "static-quality", label: "Correct but not static-clean", alwaysInclude: true },
];

function buildFailureSummaries(
  models: readonly PublicationModelSummary[],
  rowsByModel: ReadonlyMap<string, readonly ReportRow[]>,
): PublicationFailureSummary[] {
  return failureDefinitions.flatMap((definition) => {
    const modelRows = models.map((model) => rowsByModel.get(model.key) ?? []);
    const hasFailure = modelRows.some(
      (rows) => failureCount(definition.kind, rows) > 0,
    );
    if (!definition.alwaysInclude && !hasFailure) {
      return [];
    }
    return [{
      kind: definition.kind,
      label: definition.label,
      models: modelRows.map((rows) => metric(
        failureCount(definition.kind, rows),
        failureDenominator(definition.kind, rows),
      )),
    }];
  });
}

function buildCategories(
  taskIds: readonly string[],
  tasks: readonly TaskDefinition[],
): PublicationTaskCategory[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const categories = new Map<string, PublicationTaskCategory>();
  for (const taskId of taskIds) {
    const task = taskById.get(taskId);
    if (!task) {
      throw new Error(`Campaign references missing task: ${taskId}`);
    }
    const existing = categories.get(task.category);
    if (existing) {
      existing.taskCount += 1;
      continue;
    }
    categories.set(task.category, {
      category: task.category,
      label: categoryLabel(task.category),
      taskCount: 1,
      example: task.title,
    });
  }
  return [...categories.values()];
}

export function buildPublicationReport(
  input: BuildPublicationReportInput,
): PublicationReport {
  const models = input.manifest.models.map((model) => summarizeModel(
    model,
    rowsForModel(input.rows, model.key),
  ));
  const rowsByModel = new Map(
    models.map((model) => [model.key, rowsForModel(input.rows, model.key)]),
  );
  return {
    campaignId: input.manifest.campaignId,
    complete: input.complete,
    expectedGenerations: input.manifest.expectedGenerations,
    evaluatedGenerations: input.rows.length,
    models,
    categories: buildCategories(input.manifest.taskIds, input.tasks),
    failures: buildFailureSummaries(models, rowsByModel),
  };
}
