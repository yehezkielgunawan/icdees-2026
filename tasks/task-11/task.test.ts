import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./candidate.js";

describe("mapWithConcurrency", () => {
  it("preserves input order when work completes out of order", async () => {
    const result = await mapWithConcurrency([30, 1, 15], 3, async (delay) => {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return delay * 2;
    });

    expect(result).toEqual([60, 2, 30]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let maximum = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value;
    });

    expect(maximum).toBe(2);
    expect(active).toBe(0);
  });

  it("passes the item index to the worker", async () => {
    await expect(
      mapWithConcurrency(["a", "b"], 1, async (item, index) => `${index}:${item}`),
    ).resolves.toEqual(["0:a", "1:b"]);
  });

  it("returns an empty array without invoking worker for empty input", async () => {
    let calls = 0;
    await expect(mapWithConcurrency([], 2, async () => {
      calls += 1;
      return "unexpected";
    })).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it("invokes worker for undefined items", async () => {
    const input: Array<number | undefined> = [undefined, 2];
    const calls: Array<[number | undefined, number]> = [];

    await expect(
      mapWithConcurrency(input, 1, async (item, index) => {
        calls.push([item, index]);
        return item === undefined ? "undefined" : String(item);
      }),
    ).resolves.toEqual(["undefined", "2"]);
    expect(calls).toEqual([[undefined, 0], [2, 1]]);
  });

  it("rejects an invalid limit before starting work", async () => {
    let calls = 0;
    await expect(mapWithConcurrency([1], 0, async () => {
      calls += 1;
      return 1;
    })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
