import { describe, expect, it } from "vitest";
import { parseCommandLine } from "../src/cli.js";

describe("CLI parsing", () => {
  it("parses a command and named options", () => {
    expect(parseCommandLine([
      "create-campaign",
      "--purpose",
      "pilot",
      "--campaign",
      "pilot-001",
    ])).toEqual({
      command: "create-campaign",
      options: { purpose: "pilot", campaign: "pilot-001" },
    });
  });

  it("parses boolean flags and rejects unknown commands", () => {
    expect(parseCommandLine(["generate", "--resume", "--partial"])).toEqual({
      command: "generate",
      options: { resume: true, partial: true },
    });
    expect(() => parseCommandLine(["unknown"])).toThrow(/unknown command/i);
  });

  it("ignores a package-manager forwarded delimiter", () => {
    expect(parseCommandLine([
      "create-campaign",
      "--",
      "--purpose",
      "pilot",
      "--campaign",
      "pilot-001",
    ])).toEqual({
      command: "create-campaign",
      options: { purpose: "pilot", campaign: "pilot-001" },
    });
  });

  it("rejects a delimiter used as an option value", () => {
    expect(() => parseCommandLine([
      "generate",
      "--campaign",
      "--",
      "actual-campaign",
    ])).toThrow(/Option --campaign requires a value/);
  });
});
