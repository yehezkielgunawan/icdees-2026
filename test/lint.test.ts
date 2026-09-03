import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintCandidate } from "../src/lint.js";

describe("lint runner", () => {
  it("does not represent an ESLint execution error as zero findings", async () => {
    const result = await lintCandidate(
      process.cwd(),
      join(process.cwd(), ".work", "missing-candidate.ts"),
    );

    expect(result.status).toBe("error");
    expect(result.errorCount).toBeNull();
    expect(result.warningCount).toBeNull();
    expect(result.explicitAnyCount).toBeNull();
    expect(result.suppressionCount).toBeNull();
  });
});
