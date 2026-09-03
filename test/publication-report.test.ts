import { describe, expect, it } from "vitest";
import {
  buildPublicationReport,
  formatMetric,
} from "../src/publication-report.js";
import type { ReportRow } from "../src/report.js";
import type { TaskDefinition } from "../src/tasks.js";

const tasks: TaskDefinition[] = [
  {
    id: "task-01",
    category: "data-transformation",
    title: "Group records",
    description: "Group records by a derived key without mutating input.",
    signature: "export function groupRecords(): unknown",
    directory: "tasks/task-01",
    testPath: "tasks/task-01/task.test.ts",
    referencePath: "tasks/task-01/reference.ts",
  },
  {
    id: "task-02",
    category: "data-transformation",
    title: "Remove duplicates",
    description: "Remove duplicate records while preserving their original order.",
    signature: "export function uniqueRecords(): unknown",
    directory: "tasks/task-02",
    testPath: "tasks/task-02/task.test.ts",
    referencePath: "tasks/task-02/reference.ts",
  },
  {
    id: "task-03",
    category: "validation",
    title: "Validate input",
    description: "Validate an input object against the required constraints.",
    signature: "export function validateInput(): unknown",
    directory: "tasks/task-03",
    testPath: "tasks/task-03/task.test.ts",
    referencePath: "tasks/task-03/reference.ts",
  },
];

const manifest = {
  campaignId: "report-fixture",
  taskIds: tasks.map((task) => task.id),
  expectedGenerations: 9,
  models: [
    {
      key: "sol",
      label: "Model | Sol",
      cohort: "primary" as const,
      providerID: "provider",
      modelID: "sol",
    },
    {
      key: "terra",
      label: "Model Terra",
      cohort: "primary" as const,
      providerID: "provider",
      modelID: "terra",
    },
    {
      key: "luna",
      label: "Model Luna",
      cohort: "primary" as const,
      providerID: "provider",
      modelID: "luna",
    },
  ],
};

function row(
  modelKey: string,
  taskId: string,
  values: Partial<ReportRow> = {},
): ReportRow {
  const compiled = values.compileStatus === "failed"
    ? false
    : values.compileStatus === "passed" || values.compileStatus === undefined;
  const correct = compiled && values.testStatus !== "failed";
  return {
    generationId: `${modelKey}-${taskId}`,
    cohort: "primary",
    modelKey,
    model: `provider/${modelKey}`,
    taskId,
    taskCategory: "placeholder",
    run: 1,
    generationStatus: "succeeded",
    extractionStatus: "succeeded",
    compileStatus: compiled ? "passed" : "failed",
    compilerErrorCount: compiled ? 0 : 1,
    testStatus: correct ? "passed" : "failed",
    testsPassed: correct ? 2 : 1,
    testsTotal: 2,
    testPassRatio: correct ? 1 : 0.5,
    fullyCorrect: correct,
    eslintErrors: correct ? 0 : null,
    eslintWarnings: 0,
    explicitAnyCount: 0,
    qualityGatePass: correct,
    ...values,
  };
}

describe("publication report aggregation", () => {
  it("preserves manifest order and computes paper metrics with denominators", () => {
    const rows = [
      row("sol", "task-01"),
      row("sol", "task-02", { eslintErrors: 1, qualityGatePass: false }),
      row("sol", "task-03", { compileStatus: "failed" }),
      row("terra", "task-01", { testStatus: "failed", fullyCorrect: false }),
      row("terra", "task-02"),
      row("terra", "task-03", { compileStatus: "failed" }),
      row("luna", "task-01"),
      row("luna", "task-02"),
      row("luna", "task-03"),
    ];

    const report = buildPublicationReport({
      manifest,
      tasks,
      rows,
      complete: true,
    });

    expect(report.models.map((model) => model.key)).toEqual(["sol", "terra", "luna"]);
    expect(report.models[0]).toMatchObject({
      generated: 3,
      compile: { numerator: 2, denominator: 3, rate: 2 / 3 },
      functional: { numerator: 2, denominator: 3, rate: 2 / 3 },
      staticClean: { numerator: 1, denominator: 2, rate: 0.5 },
      fullGate: { numerator: 1, denominator: 3, rate: 1 / 3 },
    });
    expect(report.models[1]).toMatchObject({
      functional: { numerator: 1, denominator: 3, rate: 1 / 3 },
    });
    expect(report.categories).toEqual([
      { category: "data-transformation", label: "Data Transformation", taskCount: 2, example: "Group records" },
      { category: "validation", label: "Validation", taskCount: 1, example: "Validate input" },
    ]);
    expect(report.failures.map((failure) => failure.kind)).toEqual([
      "compilation",
      "functional",
      "static-quality",
    ]);
    expect(report.failures[0]?.models[0]).toEqual({
      numerator: 1,
      denominator: 3,
      rate: 1 / 3,
    });
    expect(report.failures[1]?.models[1]).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
  });

  it("exposes unavailable generations separately in partial reports", () => {
    const unavailable = row("sol", "task-01", {
      generationStatus: "provider-error",
      extractionStatus: "failed",
      compileStatus: "not-run",
      compilerErrorCount: null,
      testStatus: "not-run",
      testsPassed: null,
      testsTotal: null,
      testPassRatio: null,
      fullyCorrect: false,
      eslintErrors: null,
      eslintWarnings: null,
      explicitAnyCount: null,
      qualityGatePass: false,
    });

    const report = buildPublicationReport({
      manifest,
      tasks,
      rows: [unavailable],
      complete: false,
    });

    expect(report.evaluatedGenerations).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.failures[0]).toMatchObject({
      kind: "availability",
      models: [
        { numerator: 1, denominator: 1, rate: 1 },
        { numerator: 0, denominator: 0, rate: null },
        { numerator: 0, denominator: 0, rate: null },
      ],
    });
  });

  it("formats zero-denominator metrics as N/A", () => {
    expect(formatMetric({ numerator: 0, denominator: 0, rate: null })).toBe("N/A");
    expect(formatMetric({ numerator: 2, denominator: 3, rate: 2 / 3 })).toBe("2/3 (66.7%)");
  });

  it("uses the study's readable names for compound task categories", () => {
    const report = buildPublicationReport({
      manifest: {
        ...manifest,
        taskIds: ["task-04", "task-05"],
      },
      tasks: [
        ...tasks,
        {
          ...tasks[0]!,
          id: "task-04",
          category: "string-url-processing",
          title: "Normalize URLs",
        },
        {
          ...tasks[0]!,
          id: "task-05",
          category: "async-promise-utilities",
          title: "Retry operations",
        },
      ],
      rows: [],
      complete: true,
    });

    expect(report.categories.map((category) => category.label)).toEqual([
      "String / URL Processing",
      "Async / Promise Utilities",
    ]);
  });

  it("derives the full gate from stage outcomes instead of a persisted flag", () => {
    const report = buildPublicationReport({
      manifest: {
        ...manifest,
        taskIds: ["task-01"],
      },
      tasks,
      rows: [row("sol", "task-01", {
        fullyCorrect: false,
        qualityGatePass: true,
        testStatus: "failed",
      })],
      complete: true,
    });

    expect(report.models[0]?.fullGate).toEqual({
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
  });
});
