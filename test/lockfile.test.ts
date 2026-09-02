import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveProjectLockfile } from "../src/lockfile.js";

describe("project lockfile discovery", () => {
  it("prefers pnpm-lock.yaml when both supported lockfiles exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "icdees-lockfile-"));
    try {
      await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      await writeFile(join(root, "package-lock.json"), "{}\n");
      await expect(resolveProjectLockfile(root)).resolves.toEqual({
        name: "pnpm-lock.yaml",
        path: join(root, "pnpm-lock.yaml"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to package-lock.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "icdees-lockfile-"));
    try {
      await writeFile(join(root, "package-lock.json"), "{}\n");
      await expect(resolveProjectLockfile(root)).resolves.toEqual({
        name: "package-lock.json",
        path: join(root, "package-lock.json"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails with both supported filenames when no lockfile exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "icdees-lockfile-"));
    try {
      await expect(resolveProjectLockfile(root)).rejects.toThrow(
        /pnpm-lock\.yaml.*package-lock\.json/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
