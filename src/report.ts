import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { summarizeResults } from "./results.js";
import type { Cohort, ResultSummary, StageStatus } from "./types.js";

export interface ReportRow {
  generationId: string;
  cohort: Cohort;
  modelKey: string;
  model: string;
  taskId: string;
  taskCategory: string;
  run: number;
  generationStatus: string;
  extractionStatus: string;
  compileStatus: StageStatus;
  compilerErrorCount: number | null;
  testStatus: StageStatus;
  testsPassed: number | null;
  testsTotal: number | null;
  testPassRatio: number | null;
  fullyCorrect: boolean;
  eslintErrors: number | null;
  eslintWarnings: number | null;
  explicitAnyCount: number | null;
  qualityGatePass: boolean;
}

export const reportColumns = [
  "generation_id",
  "cohort",
  "model_key",
  "model",
  "task_id",
  "task_category",
  "run",
  "generation_status",
  "extraction_status",
  "compile_status",
  "compiler_error_count",
  "test_status",
  "tests_passed",
  "tests_total",
  "test_pass_ratio",
  "fully_correct",
  "eslint_errors",
  "eslint_warnings",
  "explicit_any_count",
  "quality_gate_pass",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowValues(row: ReportRow): unknown[] {
  return [
    row.generationId,
    row.cohort,
    row.modelKey,
    row.model,
    row.taskId,
    row.taskCategory,
    row.run,
    row.generationStatus,
    row.extractionStatus,
    row.compileStatus,
    row.compilerErrorCount,
    row.testStatus,
    row.testsPassed,
    row.testsTotal,
    row.testPassRatio,
    row.fullyCorrect,
    row.eslintErrors,
    row.eslintWarnings,
    row.explicitAnyCount,
    row.qualityGatePass,
  ];
}

export function buildCsv(rows: readonly ReportRow[]): string {
  const lines = [reportColumns.join(",")];
  for (const row of rows) {
    lines.push(rowValues(row).map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function toMetricInput(row: ReportRow) {
  return {
    cohort: row.cohort,
    modelKey: row.modelKey,
    extractionStatus: row.extractionStatus === "succeeded" ? "succeeded" as const : "failed" as const,
    compileStatus: row.compileStatus,
    testStatus: row.testStatus,
    testsPassed: row.testsPassed,
    testsTotal: row.testsTotal,
    eslintErrors: row.eslintErrors,
  };
}

export function summarizeByModel(
  rows: readonly ReportRow[],
): Record<string, ResultSummary> {
  const grouped = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = `${row.cohort}/${row.modelKey}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([key, group]) => [
      key,
      summarizeResults(group.map(toMetricInput)),
    ]),
  );
}

export interface ReportOutput {
  rows: ReportRow[];
  summaries: Record<string, ResultSummary>;
}

export async function writeReportFiles(
  reportDirectory: string,
  output: ReportOutput,
): Promise<void> {
  await mkdir(reportDirectory, { recursive: true });
  const csv = buildCsv(output.rows);
  const jsonl = output.rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  await writeFile(join(reportDirectory, "results.csv"), csv, "utf8");
  await writeFile(join(reportDirectory, "results.jsonl"), jsonl, "utf8");
  await writeFile(
    join(reportDirectory, "summary.json"),
    `${JSON.stringify(output.summaries, null, 2)}\n`,
    "utf8",
  );
}
