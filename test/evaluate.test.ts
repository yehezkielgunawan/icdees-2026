import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "../src/evaluate.js";
import { loadTasks } from "../src/tasks.js";

const limits = {
  compileTimeoutMs: 30_000,
  testTimeoutMs: 30_000,
  lintTimeoutMs: 30_000,
  maxOutputBytes: 262_144,
};

async function evaluateTask(taskId: string, source: string) {
  const tasks = await loadTasks(join(process.cwd(), "tasks"));
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(`Missing fixture ${taskId}`);
  }
  return evaluateCandidate({
    projectRoot: process.cwd(),
    task,
    generationId: `fixture-${taskId}`,
    source,
    limits,
  });
}

describe("candidate evaluation pipeline", () => {
  it("passes all stages for a reference implementation", async () => {
    const source = await readFile(join(process.cwd(), "tasks/task-01/reference.ts"), "utf8");
    const result = await evaluateTask("task-01", source);

    expect(result.extractionStatus).toBe("succeeded");
    expect(result.compileStatus).toBe("passed");
    expect(result.testStatus).toBe("passed");
    expect(result.testsPassed).toBe(result.testsTotal);
    expect(result.eslintErrors).toBe(0);
    expect(result.qualityGatePass).toBe(true);
  });

  it("stops before tests when the candidate does not compile", async () => {
    const result = await evaluateTask(
      "task-01",
      "export function wrongName(): number { return 1; }\n",
    );

    expect(result.compileStatus).toBe("failed");
    expect(result.compilerErrorCount).toBeGreaterThan(0);
    expect(result.testStatus).toBe("not-run");
    expect(result.testsPassed).toBeNull();
  });

  it("records a compiled but functionally incorrect candidate", async () => {
    const result = await evaluateTask(
      "task-01",
      "export function groupBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, T[]> { return {} as Record<K, T[]>; }\n",
    );

    expect(result.compileStatus).toBe("passed");
    expect(result.testStatus).toBe("failed");
    expect(result.fullyCorrect).toBe(false);
    expect(result.qualityGatePass).toBe(false);
  });

  it("rejects prohibited source before executing it", async () => {
    const result = await evaluateTask(
      "task-01",
      'import fs from "node:fs";\nexport function groupBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, T[]> { return {} as Record<K, T[]>; }\n',
    );

    expect(result.extractionStatus).toBe("succeeded");
    expect(result.safetyStatus).toBe("rejected");
    expect(result.safetyFindings.map((finding) => finding.rule)).toContain("import");
    expect(result.compileStatus).toBe("rejected");
    expect(result.testStatus).toBe("not-run");
  });

  it("reports explicit any as a static-quality finding", async () => {
    const result = await evaluateTask(
      "task-01",
      "export function groupBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, any[]> { return {} as Record<K, any[]>; }\n",
    );

    expect(result.compileStatus).toBe("passed");
    expect(result.testStatus).toBe("failed");
    expect(result.explicitAnyCount).toBeGreaterThan(0);
    expect(result.eslintErrors).toBeGreaterThan(0);
  });
});
