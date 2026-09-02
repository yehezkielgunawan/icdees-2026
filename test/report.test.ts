import { describe, expect, it } from "vitest";
import { buildCsv, summarizeByModel, type ReportRow } from "../src/report.js";

const rows: ReportRow[] = [
  {
    generationId: "final--sol--task-01--run-1",
    cohort: "primary",
    modelKey: "sol",
    model: "openai/gpt-5.6-sol",
    taskId: "task-01",
    taskCategory: "data-transformation",
    run: 1,
    generationStatus: "succeeded",
    extractionStatus: "succeeded",
    compileStatus: "passed",
    compilerErrorCount: 0,
    testStatus: "passed",
    testsPassed: 4,
    testsTotal: 4,
    testPassRatio: 1,
    fullyCorrect: true,
    eslintErrors: 0,
    eslintWarnings: 1,
    explicitAnyCount: 0,
    qualityGatePass: true,
  },
  {
    generationId: "final--sol--task-02--run-1",
    cohort: "primary",
    modelKey: "sol",
    model: "openai/gpt-5.6-sol",
    taskId: "task-02",
    taskCategory: "data-transformation",
    run: 1,
    generationStatus: "succeeded",
    extractionStatus: "succeeded",
    compileStatus: "passed",
    compilerErrorCount: 0,
    testStatus: "failed",
    testsPassed: 3,
    testsTotal: 4,
    testPassRatio: 0.75,
    fullyCorrect: false,
    eslintErrors: 2,
    eslintWarnings: 0,
    explicitAnyCount: 1,
    qualityGatePass: false,
  },
  {
    generationId: "final--ling--task-01--run-1",
    cohort: "exploratory",
    modelKey: "ling",
    model: "opencode/ling-3.0-flash-fin-free",
    taskId: "task-01",
    taskCategory: "data-transformation",
    run: 1,
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
  },
];

describe("report summaries", () => {
  it("summarizes each model within its cohort", () => {
    expect(summarizeByModel(rows)).toEqual({
      "primary/sol": {
        generated: 2,
        compiled: 2,
        compileRate: 1,
        fullyCorrect: 1,
        functionalRate: 0.5,
        compiledButIncorrect: 1,
        compiledButIncorrectRate: 0.5,
        staticClean: 1,
        cleanStaticRate: 0.5,
        fullGate: 1,
        fullGateRate: 0.5,
      },
      "exploratory/ling": {
        generated: 1,
        compiled: 0,
        compileRate: 0,
        fullyCorrect: 0,
        functionalRate: 0,
        compiledButIncorrect: 0,
        compiledButIncorrectRate: 0,
        staticClean: 0,
        cleanStaticRate: 0,
        fullGate: 0,
        fullGateRate: 0,
      },
    });
  });

  it("emits stable CSV columns and nulls for skipped stages", () => {
    const csv = buildCsv(rows);
    const [header, first, _second, third] = csv.trimEnd().split("\n");

    expect(header).toBe(
      "generation_id,cohort,model_key,model,task_id,task_category,run,generation_status,extraction_status,compile_status,compiler_error_count,test_status,tests_passed,tests_total,test_pass_ratio,fully_correct,eslint_errors,eslint_warnings,explicit_any_count,quality_gate_pass",
    );
    expect(first).toContain("final--sol--task-01--run-1,primary,sol");
    expect(third).toContain("provider-error,failed,not-run,,not-run,,,");
  });
});
