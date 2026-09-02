import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./process.js";
import type { CommandResult } from "./process.js";
import type { StageStatus } from "./types.js";

export interface TestRunnerOptions {
  projectRoot: string;
  workspace: string;
  configPath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface TestResult {
  status: StageStatus;
  testsPassed: number | null;
  testsFailed: number | null;
  testsTotal: number | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  durationMs: number;
  error?: string;
}

interface AssertionResult {
  status?: string;
}

interface FileResult {
  assertionResults?: AssertionResult[];
}

interface VitestReport {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  testResults?: FileResult[];
}

function countAssertions(report: VitestReport): {
  passed: number;
  failed: number;
  total: number;
} {
  const assertions = report.testResults?.flatMap(
    (file) => file.assertionResults ?? [],
  ) ?? [];
  if (assertions.length > 0) {
    const passed = assertions.filter((item) => item.status === "passed").length;
    const failed = assertions.filter((item) => item.status === "failed").length;
    return { passed, failed, total: assertions.length };
  }
  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  const total = report.numTotalTests ?? passed + failed;
  return { passed, failed, total };
}

function commandFailure(command: CommandResult): TestResult {
  return {
    status: command.status === "timed-out" ? "timed-out" : "error",
    testsPassed: null,
    testsFailed: null,
    testsTotal: null,
    stdout: command.stdout,
    stderr: command.stderr,
    outputTruncated: command.outputTruncated,
    durationMs: command.durationMs,
    error: command.status === "timed-out" ? "Vitest timed out" : "Vitest could not start",
  };
}

export async function runVitest(options: TestRunnerOptions): Promise<TestResult> {
  const reportPath = join(options.workspace, "vitest-report.json");
  const command = await runCommand(
    process.execPath,
    [
      join(options.projectRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      options.configPath,
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ],
    {
      cwd: options.workspace,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: options.workspace,
        CI: "1",
        TZ: "UTC",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        TMPDIR: options.workspace,
      },
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
    },
  );

  if (command.status !== "completed") {
    return commandFailure(command);
  }

  try {
    await access(reportPath);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as VitestReport;
    const counts = countAssertions(report);
    return {
      status: command.exitCode === 0 ? "passed" : "failed",
      testsPassed: counts.passed,
      testsFailed: counts.failed,
      testsTotal: counts.total,
      stdout: command.stdout,
      stderr: command.stderr,
      outputTruncated: command.outputTruncated,
      durationMs: command.durationMs,
    };
  } catch {
    return {
      status: "error",
      testsPassed: null,
      testsFailed: null,
      testsTotal: null,
      stdout: command.stdout,
      stderr: command.stderr,
      outputTruncated: command.outputTruncated,
      durationMs: command.durationMs,
      error: "Vitest did not produce a readable JSON report",
    };
  }
}
