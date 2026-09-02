import { access } from "node:fs/promises";
import { join } from "node:path";

export const supportedLockfileNames = [
  "pnpm-lock.yaml",
  "package-lock.json",
] as const;

export type LockfileName = (typeof supportedLockfileNames)[number];

export interface ProjectLockfile {
  name: LockfileName;
  path: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isSupportedLockfileName(value: string): value is LockfileName {
  return supportedLockfileNames.includes(value as LockfileName);
}

export async function resolveProjectLockfile(
  projectRoot: string,
  preferredName?: string,
): Promise<ProjectLockfile> {
  if (preferredName !== undefined) {
    if (!isSupportedLockfileName(preferredName)) {
      throw new Error(`Unsupported campaign lockfile: ${preferredName}`);
    }
    const path = join(projectRoot, preferredName);
    if (!(await exists(path))) {
      throw new Error(`Campaign lockfile is missing: ${preferredName}`);
    }
    return { name: preferredName, path };
  }

  for (const name of supportedLockfileNames) {
    const path = join(projectRoot, name);
    if (await exists(path)) {
      return { name, path };
    }
  }

  throw new Error(
    `No supported campaign lockfile found; expected one of ${supportedLockfileNames.join(" or ")}`,
  );
}
