import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadStudyConfig } from "../src/config.js";
import {
  buildCampaignManifest,
  assertCampaignHashes,
  selectCampaignScope,
} from "../src/campaign.js";
import { persistGenerationArtifacts } from "../src/artifacts.js";
import { createCampaignOnDisk, readCampaignManifest } from "../src/campaign-store.js";
import { sha256File } from "../src/hash.js";

describe("study configuration", () => {
  it("loads the configured primary and exploratory cohorts", async () => {
    const config = await loadStudyConfig(join(process.cwd(), "config/study.json"));

    expect(config.models.filter((model) => model.cohort === "primary")).toHaveLength(3);
    expect(config.models.filter((model) => model.cohort === "exploratory")).toHaveLength(3);
    expect(config.generation.requestedTemperature).toBe(0);
  });
});

describe("campaign manifests", () => {
  it("rejects changed campaign inputs", () => {
    expect(() => assertCampaignHashes(
      { study: "a", tasks: "b", prompt: "c", lockfile: "d" },
      { study: "a", tasks: "changed", prompt: "c", lockfile: "d" },
    )).toThrow(/tasks/);
  });

  it("creates a nine-generation primary pilot", async () => {
    const config = await loadStudyConfig(join(process.cwd(), "config/study.json"));
    const scope = selectCampaignScope(config.models, ["task-01", "task-02", "task-03"], "primary");
    const manifest = buildCampaignManifest({
      campaignId: "pilot-001",
      purpose: "pilot",
      seed: "seed-a",
      taskIds: scope.taskIds,
      models: scope.models,
      runs: 1,
      hashes: { study: "study", tasks: "tasks", prompt: "prompt", lockfile: "lock" },
    });

    expect(manifest.schedule).toHaveLength(9);
    expect(manifest.schedule.every((item) => item.cohort === "primary")).toBe(true);
    expect(manifest.expectedGenerations).toBe(9);
    expect(manifest.hashes.study).toBe("study");
  });

  it("keeps exploratory scope distinct from primary scope", async () => {
    const config = await loadStudyConfig(join(process.cwd(), "config/study.json"));
    const scope = selectCampaignScope(config.models, ["task-01"], "exploratory");

    expect(scope.models.map((model) => model.key)).toEqual(["ling", "mimo", "nemotron"]);
    expect(scope.models.every((model) => model.cohort === "exploratory")).toBe(true);
  });

  it("persists the selected lockfile name", async () => {
    const campaignId = "test-pnpm-lockfile-manifest";
    const campaignDirectory = join(process.cwd(), "campaigns", campaignId);
    await rm(campaignDirectory, { recursive: true, force: true });

    try {
      await createCampaignOnDisk({
        projectRoot: process.cwd(),
        purpose: "pilot",
        campaignId,
        taskIds: ["task-01"],
      });
      const stored = await readCampaignManifest(process.cwd(), campaignId);
      expect(stored.lockfileName).toBe("pnpm-lock.yaml");
    } finally {
      await rm(campaignDirectory, { recursive: true, force: true });
    }
  });

  it("keeps legacy manifests compatible with package-lock.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "icdees-legacy-manifest-"));
    const campaignId = "legacy-package-lock";
    try {
      await cp(join(process.cwd(), "config"), join(root, "config"), { recursive: true });
      await cp(join(process.cwd(), "prompts"), join(root, "prompts"), { recursive: true });
      await cp(join(process.cwd(), "tasks"), join(root, "tasks"), { recursive: true });
      const pnpmLockfilePath = join(root, "pnpm-lock.yaml");
      const npmLockfilePath = join(root, "package-lock.json");
      await writeFile(pnpmLockfilePath, "lockfileVersion: '9.0'\n");
      await writeFile(npmLockfilePath, '{"name":"legacy"}\n');

      await createCampaignOnDisk({
        projectRoot: root,
        purpose: "pilot",
        campaignId,
        taskIds: ["task-01"],
      });
      const manifestPath = join(root, "campaigns", campaignId, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        lockfileName?: string;
        hashes: { lockfile: string };
      };
      delete manifest.lockfileName;
      manifest.hashes.lockfile = await sha256File(npmLockfilePath);
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

      await expect(readCampaignManifest(root, campaignId)).resolves.toMatchObject({ campaignId });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("generation artifact persistence", () => {
  it("writes raw response before normalized source artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "icdees-artifacts-"));
    try {
      const paths = await persistGenerationArtifacts(directory, {
        generationId: "pilot-001--sol--task-01--run-1",
        cohort: "primary",
        modelKey: "sol",
        taskId: "task-01",
        run: 1,
        prompt: "Return code",
        result: {
          status: "succeeded",
          generationId: "pilot-001--sol--task-01--run-1",
          sessionId: "session-1",
          rawResponse: { info: { cost: 0 } },
          rawText: "```ts\nexport const answer = 42;\n```",
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cost: 0,
          },
          generationTimeMs: 5,
        },
      });

      expect(await readFile(paths.rawResponsePath, "utf8")).toContain('"cost": 0');
      expect(await readFile(paths.sourcePath, "utf8")).toBe("export const answer = 42;\n");
      expect(JSON.parse(await readFile(paths.metadataPath, "utf8"))).toMatchObject({
        generationId: "pilot-001--sol--task-01--run-1",
        normalizationActions: ["removed-enclosing-code-fence"],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
