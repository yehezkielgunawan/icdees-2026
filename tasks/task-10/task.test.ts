import { describe, expect, it } from "vitest";
import { retry } from "./candidate.js";

describe("retry", () => {
  it("returns the first successful result", async () => {
    let calls = 0;
    const result = await retry(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(`failure ${calls}`);
      }
      return "ok";
    }, 3, 0);

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rejects with the last error after all attempts", async () => {
    let calls = 0;
    await expect(
      retry(async () => {
        calls += 1;
        throw new Error(`failure ${calls}`);
      }, 3, 0),
    ).rejects.toThrow("failure 3");
    expect(calls).toBe(3);
  });

  it("does not call the operation when attempts is zero", async () => {
    let calls = 0;
    await expect(retry(async () => {
      calls += 1;
      return "unexpected";
    }, 0)).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("does not retry after success", async () => {
    let calls = 0;
    await retry(async () => {
      calls += 1;
      return 42;
    }, 5, 0);
    expect(calls).toBe(1);
  });
});
