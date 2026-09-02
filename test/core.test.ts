import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/prompts.js";
import { buildSchedule } from "../src/schedule.js";
import { writeJsonAtomically } from "../src/storage.js";
import { normalizeModelOutput } from "../src/normalize.js";
import {
  computeDerivedMetrics,
  summarizeResults,
} from "../src/results.js";

describe("campaign scheduling", () => {
  it("produces a stable permutation for the same seed", () => {
    const input = {
      campaignId: "pilot-001",
      seed: "seed-a",
      runs: 1,
      tasks: ["task-01", "task-02"],
      models: [
        { key: "sol", cohort: "primary" as const },
        { key: "ling", cohort: "exploratory" as const },
      ],
    };

    const first = buildSchedule(input);
    const second = buildSchedule(input);

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(new Set(first.map((item) => item.generationId)).size).toBe(4);
    expect(first.every((item) => item.campaignId === "pilot-001")).toBe(true);
  });
});

describe("prompt rendering", () => {
  it("replaces both task placeholders without leaving template markers", () => {
    const prompt = buildPrompt(
      "Task: {TASK_DESCRIPTION}\nSignature: {FUNCTION_SIGNATURE}",
      {
        description: "Group records by owner.",
        signature: "export function groupByOwner(records: Record[]): Record[];",
      },
    );

    expect(prompt).toContain("Group records by owner.");
    expect(prompt).toContain("export function groupByOwner");
    expect(prompt).not.toMatch(/\{TASK_DESCRIPTION\}|\{FUNCTION_SIGNATURE\}/);
  });
});

describe("model output normalization", () => {
  it("removes one enclosing TypeScript fence and preserves source text", () => {
    const result = normalizeModelOutput(
      "```typescript\r\nexport const answer = 42;\r\n```\r\n",
    );

    expect(result.source).toBe("export const answer = 42;\n");
    expect(result.actions).toContain("normalized-line-endings");
    expect(result.actions).toContain("removed-enclosing-code-fence");
  });

  it("does not remove explanatory text that is not an enclosing fence", () => {
    const result = normalizeModelOutput(
      "Here is the code:\n```ts\nexport const answer = 42;\n```",
    );

    expect(result.source).toContain("Here is the code:");
    expect(result.actions).not.toContain("removed-enclosing-code-fence");
  });
});

describe("quality gate metrics", () => {
  it("distinguishes compiled but incorrect code from a full-gate pass", () => {
    const incorrect = computeDerivedMetrics({
      extractionStatus: "succeeded",
      compileStatus: "passed",
      testStatus: "failed",
      testsPassed: 4,
      testsTotal: 5,
      eslintErrors: 0,
    });
    const clean = computeDerivedMetrics({
      extractionStatus: "succeeded",
      compileStatus: "passed",
      testStatus: "passed",
      testsPassed: 5,
      testsTotal: 5,
      eslintErrors: 0,
    });

    expect(incorrect.fullyCorrect).toBe(false);
    expect(incorrect.qualityGatePass).toBe(false);
    expect(clean.fullyCorrect).toBe(true);
    expect(clean.qualityGatePass).toBe(true);
  });

  it("uses compilable programs as the clean-static denominator", () => {
    const summary = summarizeResults([
      {
        cohort: "primary",
        modelKey: "sol",
        compileStatus: "passed",
        testStatus: "passed",
        testsPassed: 2,
        testsTotal: 2,
        eslintErrors: 0,
        extractionStatus: "succeeded",
      },
      {
        cohort: "primary",
        modelKey: "sol",
        compileStatus: "passed",
        testStatus: "failed",
        testsPassed: 1,
        testsTotal: 2,
        eslintErrors: 2,
        extractionStatus: "succeeded",
      },
      {
        cohort: "primary",
        modelKey: "sol",
        compileStatus: "failed",
        testStatus: "not-run",
        testsPassed: null,
        testsTotal: null,
        eslintErrors: null,
        extractionStatus: "succeeded",
      },
    ]);

    expect(summary).toEqual({
      generated: 3,
      compiled: 2,
      compileRate: 2 / 3,
      fullyCorrect: 1,
      functionalRate: 1 / 3,
      compiledButIncorrect: 1,
      compiledButIncorrectRate: 1 / 2,
      staticClean: 1,
      cleanStaticRate: 1 / 2,
      fullGate: 1,
      fullGateRate: 1 / 3,
    });
  });
});

describe("atomic storage", () => {
  it("writes complete JSON and replaces an existing artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "icdees-storage-"));
    const path = join(directory, "record.json");

    try {
      await writeJsonAtomically(path, { version: 1 });
      await writeJsonAtomically(path, { version: 2 });
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ version: 2 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
