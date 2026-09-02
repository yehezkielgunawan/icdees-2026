import type {
  DerivedMetrics,
  EvaluationMetricInput,
  ResultSummary,
} from "./types.js";

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function computeDerivedMetrics(
  input: EvaluationMetricInput,
): DerivedMetrics {
  const testsPassed = input.testsPassed;
  const testsTotal = input.testsTotal;
  const hasCompleteTests =
    testsPassed !== null && testsTotal !== null && testsTotal > 0;
  const fullyCorrect =
    input.compileStatus === "passed" &&
    input.testStatus === "passed" &&
    hasCompleteTests &&
    testsPassed === testsTotal;
  const qualityGatePass =
    input.extractionStatus === "succeeded" &&
    input.compileStatus === "passed" &&
    fullyCorrect &&
    input.eslintErrors === 0;

  return {
    testPassRatio:
      hasCompleteTests && testsPassed !== null && testsTotal !== null
        ? testsPassed / testsTotal
        : null,
    fullyCorrect,
    qualityGatePass,
  };
}

export function summarizeResults(
  rows: readonly EvaluationMetricInput[],
): ResultSummary {
  const compiledRows = rows.filter((row) => row.compileStatus === "passed");
  const fullyCorrect = rows.filter(
    (row) => computeDerivedMetrics(row).fullyCorrect,
  ).length;
  const compiledButIncorrect = compiledRows.filter(
    (row) => !computeDerivedMetrics(row).fullyCorrect,
  ).length;
  const staticClean = compiledRows.filter((row) => row.eslintErrors === 0).length;
  const fullGate = rows.filter(
    (row) => computeDerivedMetrics(row).qualityGatePass,
  ).length;

  return {
    generated: rows.length,
    compiled: compiledRows.length,
    compileRate: ratio(compiledRows.length, rows.length),
    fullyCorrect,
    functionalRate: ratio(fullyCorrect, rows.length),
    compiledButIncorrect,
    compiledButIncorrectRate: ratio(compiledButIncorrect, compiledRows.length),
    staticClean,
    cleanStaticRate: ratio(staticClean, compiledRows.length),
    fullGate,
    fullGateRate: ratio(fullGate, rows.length),
  };
}
