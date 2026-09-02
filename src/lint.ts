import { ESLint } from "eslint";
import { join } from "node:path";
import type { StageStatus } from "./types.js";

export interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
}

export interface LintResult {
  status: StageStatus;
  errorCount: number;
  warningCount: number;
  explicitAnyCount: number;
  suppressionCount: number;
  messages: LintMessage[];
  durationMs: number;
  error?: string;
}

export async function lintCandidate(
  projectRoot: string,
  candidatePath: string,
): Promise<LintResult> {
  const startedAt = Date.now();
  try {
    const eslint = new ESLint({
      cwd: projectRoot,
      overrideConfigFile: join(projectRoot, "eslint.config.js"),
      ignore: false,
    });
    const [result] = await eslint.lintFiles([candidatePath]);
    if (!result) {
      throw new Error("ESLint returned no result");
    }
    const messages = result.messages.map((message) => ({
      ruleId: message.ruleId,
      severity: message.severity,
      message: message.message,
      ...(message.line === undefined ? {} : { line: message.line }),
      ...(message.column === undefined ? {} : { column: message.column }),
    }));
    return {
      status: "passed",
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      explicitAnyCount: result.messages.filter(
        (message) => message.ruleId === "@typescript-eslint/no-explicit-any",
      ).length,
      suppressionCount: result.messages.filter(
        (message) => message.ruleId === "@typescript-eslint/ban-ts-comment",
      ).length,
      messages,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "error",
      errorCount: 0,
      warningCount: 0,
      explicitAnyCount: 0,
      suppressionCount: 0,
      messages: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
