import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTasks, validateTaskSet } from "../src/tasks.js";

describe("task catalog", () => {
  it("loads the fifteen ordered task definitions", async () => {
    const tasks = await loadTasks(join(process.cwd(), "tasks"));

    expect(tasks).toHaveLength(15);
    expect(tasks.map((task) => task.id)).toEqual([
      "task-01",
      "task-02",
      "task-03",
      "task-04",
      "task-05",
      "task-06",
      "task-07",
      "task-08",
      "task-09",
      "task-10",
      "task-11",
      "task-12",
      "task-13",
      "task-14",
      "task-15",
    ]);
    expect(tasks.every((task) => task.description.length > 20)).toBe(true);
  });

  it("rejects a catalog with duplicate task IDs", () => {
    expect(() =>
      validateTaskSet([
        {
          id: "task-01",
          category: "data",
          title: "one",
          description: "description",
          signature: "export function one(): number",
          directory: "one",
          testPath: "one/task.test.ts",
          referencePath: "one/reference.ts",
        },
        {
          id: "task-01",
          category: "data",
          title: "duplicate",
          description: "description",
          signature: "export function two(): number",
          directory: "two",
          testPath: "two/task.test.ts",
          referencePath: "two/reference.ts",
        },
      ], 2),
    ).toThrow(/duplicate/i);
  });
});
