import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  buildOpenCodeEnvironment,
  ManagedOpenCodeRuntime,
  resolveOpenCodeBinary,
  resolveConfiguredModel,
  type ProviderSnapshot,
} from "../src/opencode-runtime.js";

const snapshot: ProviderSnapshot = {
  providers: [
    {
      id: "openai",
      models: {
        "gpt-5.6-sol": {
          name: "GPT-5.6 Sol",
          capabilities: { temperature: false },
          status: "active",
        },
      },
    },
  ],
  default: {},
};

describe("managed OpenCode runtime contracts", () => {
  it("prefers the project-pinned OpenCode executable", () => {
    expect(resolveOpenCodeBinary(process.cwd())).toBe(
      join(process.cwd(), "node_modules/opencode-ai/bin/opencode.exe"),
    );
  });

  it("resolves exact provider/model IDs and capabilities", () => {
    expect(
      resolveConfiguredModel(snapshot, {
        providerID: "openai",
        modelID: "gpt-5.6-sol",
      }),
    ).toEqual({
      available: true,
      providerID: "openai",
      modelID: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      temperatureSupported: false,
      status: "active",
    });
  });

  it("fails clearly when an exact model is unavailable", () => {
    expect(() =>
      resolveConfiguredModel(snapshot, {
        providerID: "openai",
        modelID: "gpt-5.6-terra",
      }),
    ).toThrow(/openai\/gpt-5\.6-terra/);
  });

  it("builds an isolated runtime environment without replacing auth", () => {
    const environment = buildOpenCodeEnvironment(
      "/study/config/opencode.json",
      "/study/.opencode-state",
    );

    expect(environment.OPENCODE_CONFIG).toBe("/study/config/opencode.json");
    expect(environment.OPENCODE_CONFIG_DIR).toBe("/study/.opencode-state");
    expect(environment.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBeUndefined();
    expect(environment.OPENCODE_DISABLE_CLAUDE_CODE).toBe("1");
    expect(environment.OPENCODE_DB).toBe("/study/.opencode-state/opencode.db");
    expect(environment.OPENCODE_DISABLE_AUTOUPDATE).toBe("1");
    expect(environment.OPENCODE_CONFIG_CONTENT).toBeUndefined();
  });

  it("force-kills a server that remains alive after SIGTERM", async () => {
    const signals: string[] = [];
    const runtime = new ManagedOpenCodeRuntime({
      projectRoot: process.cwd(),
      configPath: "config/opencode/opencode.json",
      stateDirectory: ".runtime-test-state",
    });
    const internals = runtime as unknown as {
      child?: {
        exitCode: number | null;
        killed: boolean;
        kill(signal: string): boolean;
      };
      exitPromise?: Promise<void>;
    };
    internals.child = {
      exitCode: null,
      killed: true,
      kill(signal) {
        signals.push(signal);
        return true;
      },
    };
    internals.exitPromise = Promise.resolve();

    await runtime.stop();

    expect(signals).toEqual(["SIGKILL"]);
  });
});
