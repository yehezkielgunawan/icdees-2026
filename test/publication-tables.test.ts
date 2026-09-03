import { describe, expect, it } from "vitest";
import { renderPublicationTables } from "../src/publication-tables.js";
import { buildPublicationReport } from "../src/publication-report.js";
import type { ReportRow } from "../src/report.js";
import type { TaskDefinition } from "../src/tasks.js";

const task: TaskDefinition = {
  id: "task-01",
  category: "data-transformation",
  title: "Handle 100% of `items` | safely",
  description: "Handle records without mutating the input collection.",
  signature: "export function handle(): unknown",
  directory: "tasks/task-01",
  testPath: "tasks/task-01/task.test.ts",
  referencePath: "tasks/task-01/reference.ts",
};

const row: ReportRow = {
  generationId: "generation-1",
  cohort: "primary",
  modelKey: "model-a",
  model: "provider/model-a",
  taskId: "task-01",
  taskCategory: task.category,
  run: 1,
  generationStatus: "succeeded",
  extractionStatus: "succeeded",
  compileStatus: "passed",
  compilerErrorCount: 0,
  testStatus: "passed",
  testsPassed: 2,
  testsTotal: 2,
  testPassRatio: 1,
  fullyCorrect: true,
  eslintErrors: 0,
  eslintWarnings: 0,
  explicitAnyCount: 0,
  qualityGatePass: true,
};

const report = buildPublicationReport({
  manifest: {
    campaignId: "table-fixture",
    taskIds: [task.id],
    expectedGenerations: 1,
    models: [{
      key: "model-a",
      label: "Model | A & B",
      cohort: "primary",
      providerID: "provider",
      modelID: "model-a",
    }],
  },
  tasks: [task],
  rows: [row],
  complete: false,
});

describe("publication table rendering", () => {
  it("renders all three paper tables with explicit metric values", () => {
    const tables = renderPublicationTables(report);

    expect(tables.taskSet.markdown).toContain("| Data Transformation | 1 | Handle 100% of `items` \\| safely |");
    expect(tables.mainResults.markdown).toContain("| Model \\| A & B | 1/1 (100.0%) | 1/1 (100.0%) | 1/1 (100.0%) | 1/1 (100.0%) |");
    expect(tables.failureCharacteristics.markdown).toContain("| Compilation failure | 0/1 (0.0%) |");
    expect(tables.mainResults.markdown).toContain("Partial report: 1 of 1 expected generations were evaluated.");
  });

  it("escapes LaTeX special characters and includes stable labels", () => {
    const tables = renderPublicationTables(report);

    expect(tables.taskSet.latex).toContain("\\label{tab:task-set}");
    expect(tables.taskSet.latex).toContain("Handle 100\\% of `items` \\textbar{} safely");
    expect(tables.mainResults.latex).toContain("Model \\textbar{} A \\& B");
    expect(tables.mainResults.latex).toContain("\\label{tab:main-results}");
    expect(tables.failureCharacteristics.latex).toContain("\\label{tab:failure-characteristics}");
  });
});
