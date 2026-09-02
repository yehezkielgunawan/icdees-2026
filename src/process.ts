import { spawn } from "node:child_process";

export type CommandStatus = "completed" | "timed-out" | "spawn-error";

export interface CommandOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface CommandResult {
  status: CommandStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  durationMs: number;
}

function appendOutput(
  current: string,
  chunk: Buffer,
  maximum: number,
): { value: string; truncated: boolean } {
  const remaining = Math.max(0, maximum - Buffer.byteLength(current, "utf8"));
  const bytes = chunk.subarray(0, remaining);
  return {
    value: current + bytes.toString("utf8"),
    truncated: bytes.length < chunk.length,
  };
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;
    let child;

    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch {
      resolve({
        status: "spawn-error",
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        outputTruncated,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const result = appendOutput(stdout, chunk, options.maxOutputBytes);
      stdout = result.value;
      outputTruncated ||= result.truncated;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const result = appendOutput(stderr, chunk, options.maxOutputBytes);
      stderr = result.value;
      outputTruncated ||= result.truncated;
    });
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        status: "spawn-error",
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        outputTruncated,
        durationMs: Date.now() - startedAt,
      });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timed-out" : "completed",
        exitCode,
        signal,
        stdout,
        stderr,
        outputTruncated,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
