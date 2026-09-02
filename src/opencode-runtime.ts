import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import type { GenerationClient } from "./generation.js";
import type { ModelConfig } from "./types.js";

export interface ProviderModelSnapshot {
  name: string;
  capabilities: {
    temperature: boolean;
  };
  status: string;
}

export interface ProviderSnapshot {
  providers: Array<{
    id: string;
    models: Record<string, ProviderModelSnapshot>;
  }>;
  default: Record<string, string>;
}

export interface ResolvedModel {
  available: true;
  providerID: string;
  modelID: string;
  name: string;
  temperatureSupported: boolean;
  status: string;
}

export function resolveConfiguredModel(
  snapshot: ProviderSnapshot,
  model: Pick<ModelConfig, "providerID" | "modelID">,
): ResolvedModel {
  const provider = snapshot.providers.find((item) => item.id === model.providerID);
  const resolved = provider?.models[model.modelID];
  if (!provider || !resolved) {
    throw new Error(`Required model is unavailable: ${model.providerID}/${model.modelID}`);
  }
  return {
    available: true,
    providerID: model.providerID,
    modelID: model.modelID,
    name: resolved.name,
    temperatureSupported: resolved.capabilities.temperature,
    status: resolved.status,
  };
}

export function buildOpenCodeEnvironment(
  configPath: string,
  stateDirectory: string,
): Record<string, string | undefined> {
  return {
    ...process.env,
    OPENCODE_CONFIG: configPath,
    OPENCODE_CONFIG_DIR: stateDirectory,
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DB: join(stateDirectory, "opencode.db"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_CLIENT: "icdees-typescript-study",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
}

export function resolveOpenCodeBinary(projectRoot: string): string {
  const projectBinary = join(projectRoot, "node_modules/opencode-ai/bin/opencode.exe");
  return existsSync(projectBinary)
    ? projectBinary
    : process.env.OPENCODE_BIN ?? "opencode";
}

export interface RuntimeOptions {
  projectRoot: string;
  configPath: string;
  stateDirectory: string;
  openCodeBinary?: string;
  startupTimeoutMs?: number;
}

export interface RuntimeInfo {
  baseUrl: string;
  version: string | null;
  pid: number | null;
}

interface HealthResponse {
  healthy?: boolean;
  version?: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") {
    throw new Error("Could not acquire a local port");
  }
  return address.port;
}

async function readHealth(baseUrl: string): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${baseUrl}/global/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export class ManagedOpenCodeRuntime {
  private child: ChildProcess | undefined;
  private exitPromise: Promise<void> | undefined;
  private baseUrl: string | undefined;
  private client: OpencodeClient | undefined;
  private health: HealthResponse | undefined;
  private stderr = "";

  constructor(private readonly options: RuntimeOptions) {}

  private async waitForHealth(
    baseUrl: string,
    child: ChildProcess,
    timeout: number,
  ): Promise<HealthResponse> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const health = await readHealth(baseUrl);
      if (health?.healthy) {
        return health;
      }
      if (child.exitCode !== null) {
        break;
      }
      await delay(100);
    }
    const detail = this.stderr.trim();
    throw new Error(
      `OpenCode server did not become healthy within ${timeout}ms${detail ? `: ${detail}` : ""}`,
    );
  }

  async start(): Promise<RuntimeInfo> {
    if (this.child) {
      throw new Error("OpenCode runtime is already running");
    }
    await mkdir(this.options.stateDirectory, { recursive: true });
    const port = await availablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(
      this.options.openCodeBinary ?? resolveOpenCodeBinary(this.options.projectRoot),
      ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: this.options.projectRoot,
        env: buildOpenCodeEnvironment(
          this.options.configPath,
          this.options.stateDirectory,
        ),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child = child;
    this.baseUrl = baseUrl;
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-16_384);
    });
    this.exitPromise = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.once("error", () => resolve());
    });

    const timeout = this.options.startupTimeoutMs ?? 20_000;
    let health: HealthResponse;
    try {
      health = await this.waitForHealth(baseUrl, child, timeout);
    } catch (error) {
      await this.stop();
      throw error;
    }
    this.health = health;
    this.client = createOpencodeClient({
      baseUrl,
      directory: this.options.projectRoot,
    });
    return {
      baseUrl,
      version: health.version ?? null,
      pid: child.pid ?? null,
    };
  }

  get generationClient(): GenerationClient {
    if (!this.client) {
      throw new Error("OpenCode runtime is not started");
    }
    return this.client as unknown as GenerationClient;
  }

  get runtimeInfo(): RuntimeInfo {
    if (!this.baseUrl || !this.child) {
      throw new Error("OpenCode runtime is not started");
    }
    return {
      baseUrl: this.baseUrl,
      version: this.health?.version ?? null,
      pid: this.child.pid ?? null,
    };
  }

  async providers(): Promise<ProviderSnapshot> {
    if (!this.client) {
      throw new Error("OpenCode runtime is not started");
    }
    const response = await this.client.config.providers({
      query: { directory: this.options.projectRoot },
    });
    if (!response.data) {
      throw new Error("OpenCode returned no provider list");
    }
    return response.data as unknown as ProviderSnapshot;
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
    await Promise.race([this.exitPromise ?? Promise.resolve(), delay(2_000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
    this.child = undefined;
    this.client = undefined;
    this.baseUrl = undefined;
  }
}
