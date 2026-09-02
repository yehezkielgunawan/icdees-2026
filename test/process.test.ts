import { execPath } from "node:process";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/process.js";

describe("bounded subprocess execution", () => {
  it("captures a completed command without invoking a shell", async () => {
    const result = await runCommand(
      execPath,
      ["-e", "process.stdout.write('hello'); process.stderr.write('notice');"],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", CI: "1" },
        timeoutMs: 1_000,
        maxOutputBytes: 100,
      },
    );

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("notice");
  });

  it("caps output and marks truncation", async () => {
    const result = await runCommand(
      execPath,
      ["-e", "process.stdout.write('0123456789');"],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", CI: "1" },
        timeoutMs: 1_000,
        maxOutputBytes: 5,
      },
    );

    expect(result.status).toBe("completed");
    expect(result.stdout).toBe("01234");
    expect(result.outputTruncated).toBe(true);
  });

  it("kills a command that exceeds its timeout", async () => {
    const result = await runCommand(
      execPath,
      ["-e", "setTimeout(() => undefined, 5_000);"],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", CI: "1" },
        timeoutMs: 20,
        maxOutputBytes: 100,
      },
    );

    expect(result.status).toBe("timed-out");
    expect(result.exitCode).not.toBe(0);
  });
});
