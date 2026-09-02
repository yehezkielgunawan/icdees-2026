import { describe, expect, it } from "vitest";
import { inspectGeneratedSource } from "../src/safety.js";

describe("generated-source safety checks", () => {
  it("accepts a self-contained function", () => {
    expect(inspectGeneratedSource("export function answer(): number { return 42; }"))
      .toEqual([]);
  });

  it("rejects imports and dynamic module loading", () => {
    const findings = inspectGeneratedSource(
      'import fs from "node:fs";\nconst x = require("x");',
    );

    expect(findings.map((finding) => finding.rule)).toEqual([
      "import",
      "dynamic-module-loading",
    ]);
  });

  it("rejects process and global execution access", () => {
    const findings = inspectGeneratedSource(
      "export function answer() { return process.env.SECRET ?? globalThis.value; }",
    );

    expect(findings.map((finding) => finding.rule)).toContain("process-access");
    expect(findings.map((finding) => finding.rule)).toContain("global-access");
  });

  it("rejects TypeScript suppression comments", () => {
    expect(inspectGeneratedSource("// @ts-ignore\nexport const value = 1;")
      .map((finding) => finding.rule)).toContain("typescript-suppression");
  });
});
