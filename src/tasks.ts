import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { TaskConfig } from "./types.js";

export interface TaskDefinition extends TaskConfig {
  directory: string;
  testPath: string;
  referencePath: string;
}

function assertTaskConfig(value: unknown, directoryName: string): TaskConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${directoryName}/task.json must contain an object`);
  }
  const record = value as Record<string, unknown>;
  const fields = ["id", "category", "title", "description", "signature"];
  const strings = new Map<string, string>();
  for (const field of fields) {
    if (typeof record[field] !== "string" || record[field] === "") {
      throw new Error(`${directoryName}/task.json requires string field ${field}`);
    }
    strings.set(field, record[field] as string);
  }
  const id = strings.get("id");
  if (id !== directoryName) {
    throw new Error(`${directoryName}/task.json id does not match directory`);
  }
  return {
    id,
    category: strings.get("category") ?? "",
    title: strings.get("title") ?? "",
    description: strings.get("description") ?? "",
    signature: strings.get("signature") ?? "",
  };
}

export async function loadTasks(tasksDirectory: string): Promise<TaskDefinition[]> {
  const entries = await readdir(tasksDirectory, { withFileTypes: true });
  const taskDirectories = entries
    .filter((entry) => entry.isDirectory() && /^task-\d+$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const tasks: TaskDefinition[] = [];

  for (const entry of taskDirectories) {
    const directory = join(tasksDirectory, entry.name);
    const config = JSON.parse(await readFile(join(directory, "task.json"), "utf8")) as unknown;
    const task = assertTaskConfig(config, entry.name);
    const testPath = join(directory, "task.test.ts");
    const referencePath = join(directory, "reference.ts");
    await access(testPath);
    await access(referencePath);
    tasks.push({ ...task, directory, testPath, referencePath });
  }

  return tasks;
}

export function validateTaskSet(
  tasks: readonly TaskDefinition[],
  expectedCount = 15,
): void {
  if (tasks.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} tasks, found ${tasks.length}`);
  }
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      throw new Error(`Duplicate task ID: ${task.id}`);
    }
    ids.add(task.id);
  }
  for (const task of tasks) {
    if (task.description.length < 20 || task.signature.length < 10) {
      throw new Error(`Task ${task.id} is underspecified`);
    }
  }
}
