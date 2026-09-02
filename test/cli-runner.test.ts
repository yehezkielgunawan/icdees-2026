import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("CLI command runner", () => {
  it("runs a local doctor without starting OpenCode", async () => {
    await expect(runCli(["doctor", "--skip-live"], {
      projectRoot: process.cwd(),
    })).resolves.toMatchObject({
      command: "doctor",
      taskCount: 15,
      modelCount: 6,
      live: false,
    });
  });

  it("dispatches task validation", async () => {
    await expect(runCli(["validate-tasks"], {
      projectRoot: process.cwd(),
    })).resolves.toEqual({
      command: "validate-tasks",
      taskCount: 15,
    });
  });

  it("creates a campaign from command options", async () => {
    const campaignId = "test-cli-runner";
    const campaignDirectory = join(process.cwd(), "campaigns", campaignId);
    await rm(campaignDirectory, { recursive: true, force: true });
    try {
      await expect(runCli([
        "create-campaign",
        "--purpose",
        "pilot",
        "--campaign",
        campaignId,
      ], { projectRoot: process.cwd() })).resolves.toMatchObject({
        command: "create-campaign",
        campaignId,
        expectedGenerations: 9,
      });
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });
});
