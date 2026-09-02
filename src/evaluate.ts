import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compileCandidate, type CompileResult } from "./compile.js";
import { lintCandidate, type LintResult } from "./lint.js";
import { runVitest } from "./test.js";
import { inspectGeneratedSource, type SafetyFinding } from "./safety.js";
import { computeDerivedMetrics } from "./results.js";
import type { DerivedMetrics, StageStatus } from "./types.js";
import type { TaskDefinition } from "./tasks.js";

export interface EvaluationLimits {
  compileTimeoutMs: number;
  testTimeoutMs: number;
  lintTimeoutMs: number;
  maxOutputBytes: number;
}

export interface EvaluateCandidateOptions {
  projectRoot: string;
  task: TaskDefinition;
  generationId: string;
  source: string;
  limits: EvaluationLimits;
}

export interface CandidateEvaluationResult extends DerivedMetrics {
  generationId: string;
  taskId: string;
  extractionStatus: "succeeded" | "failed";
  safetyStatus: "passed" | "rejected";
  safetyFindings: SafetyFinding[];
  compileStatus: StageStatus;
  compilerErrorCount: number | null;
  compilerErrorCodes: number[];
  compilerDiagnostics: CompileResult["diagnostics"];
  testStatus: StageStatus;
  testsPassed: number | null;
  testsFailed: number | null;
  testsTotal: number | null;
  testStdout: string;
  testStderr: string;
  testError?: string;
  eslintStatus: StageStatus;
  eslintErrors: number | null;
  eslintWarnings: number | null;
  explicitAnyCount: number | null;
  suppressionCount: number | null;
  lintMessages: LintResult["messages"];
  lintError?: string;
  durations: {
    compileMs: number | null;
    testMs: number | null;
    lintMs: number | null;
    totalMs: number;
  };
}

function emptyResult(
  options: EvaluateCandidateOptions,
  overrides: Partial<CandidateEvaluationResult> = {},
): CandidateEvaluationResult {
  return {
    generationId: options.generationId,
    taskId: options.task.id,
    extractionStatus: "failed",
    safetyStatus: "passed",
    safetyFindings: [],
    compileStatus: "not-run",
    compilerErrorCount: null,
    compilerErrorCodes: [],
    compilerDiagnostics: [],
    testStatus: "not-run",
    testsPassed: null,
    testsFailed: null,
    testsTotal: null,
    testStdout: "",
    testStderr: "",
    eslintStatus: "not-run",
    eslintErrors: null,
    eslintWarnings: null,
    explicitAnyCount: null,
    suppressionCount: null,
    lintMessages: [],
    durations: {
      compileMs: null,
      testMs: null,
      lintMs: null,
      totalMs: 0,
    },
    testPassRatio: null,
    fullyCorrect: false,
    qualityGatePass: false,
    ...overrides,
  };
}

async function materializeWorkspace(
  options: EvaluateCandidateOptions,
  workspace: string,
): Promise<{ candidatePath: string; testPath: string; configPath: string }> {
  await mkdir(workspace, { recursive: true });
  const candidatePath = join(workspace, "candidate.ts");
  const testPath = join(workspace, "task.test.ts");
  const configPath = join(workspace, "vitest.config.ts");
  await writeFile(candidatePath, options.source, "utf8");
  await writeFile(testPath, await readFile(options.task.testPath), "utf8");
  await writeFile(
    join(workspace, "package.json"),
    '{"private":true,"type":"module"}\n',
    "utf8",
  );
  await writeFile(
    configPath,
    'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["task.test.ts"], fileParallelism: false } });\n',
    "utf8",
  );
  return { candidatePath, testPath, configPath };
}

function metricsFor(result: CandidateEvaluationResult): CandidateEvaluationResult {
  const metrics = computeDerivedMetrics(result);
  return { ...result, ...metrics };
}

export async function evaluateCandidate(
  options: EvaluateCandidateOptions,
): Promise<CandidateEvaluationResult> {
  const startedAt = Date.now();
  const workspace = join(options.projectRoot, ".work", options.generationId);
  await rm(workspace, { recursive: true, force: true });

  if (options.source.trim() === "") {
    return emptyResult(options, {
      durations: { compileMs: null, testMs: null, lintMs: null, totalMs: Date.now() - startedAt },
    });
  }

  const paths = await materializeWorkspace(options, workspace);
  try {
    const safetyFindings = inspectGeneratedSource(options.source);
    if (safetyFindings.length > 0) {
      return metricsFor(emptyResult(options, {
        extractionStatus: "succeeded",
        safetyStatus: "rejected",
        safetyFindings,
        compileStatus: "rejected",
        durations: {
          compileMs: null,
          testMs: null,
          lintMs: null,
          totalMs: Date.now() - startedAt,
        },
      }));
    }

    const compile = compileCandidate(paths.candidatePath, paths.testPath);
    if (compile.status !== "passed") {
      return metricsFor(emptyResult(options, {
        extractionStatus: "succeeded",
        safetyFindings,
        compileStatus: "failed",
        compilerErrorCount: compile.errorCount,
        compilerErrorCodes: compile.errorCodes,
        compilerDiagnostics: compile.diagnostics,
        durations: {
          compileMs: compile.durationMs,
          testMs: null,
          lintMs: null,
          totalMs: Date.now() - startedAt,
        },
      }));
    }

    const [tests, lint] = await Promise.all([
      runVitest({
        projectRoot: options.projectRoot,
        workspace,
        configPath: paths.configPath,
        timeoutMs: options.limits.testTimeoutMs,
        maxOutputBytes: options.limits.maxOutputBytes,
      }),
      lintCandidate(options.projectRoot, paths.candidatePath),
    ]);
    return metricsFor({
      ...emptyResult(options),
      extractionStatus: "succeeded",
      safetyFindings,
      compileStatus: "passed",
      compilerErrorCount: 0,
      compilerErrorCodes: [],
      compilerDiagnostics: [],
      testStatus: tests.status,
      testsPassed: tests.testsPassed,
      testsFailed: tests.testsFailed,
      testsTotal: tests.testsTotal,
      testStdout: tests.stdout,
      testStderr: tests.stderr,
      ...(tests.error === undefined ? {} : { testError: tests.error }),
      eslintStatus: lint.status,
      eslintErrors: lint.errorCount,
      eslintWarnings: lint.warningCount,
      explicitAnyCount: lint.explicitAnyCount,
      suppressionCount: lint.suppressionCount,
      lintMessages: lint.messages,
      ...(lint.error === undefined ? {} : { lintError: lint.error }),
      durations: {
        compileMs: compile.durationMs,
        testMs: tests.durationMs,
        lintMs: lint.durationMs,
        totalMs: Date.now() - startedAt,
      },
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
