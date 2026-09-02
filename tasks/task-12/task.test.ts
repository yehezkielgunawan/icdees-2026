import { describe, expect, it } from "vitest";
import { withTimeout } from "./candidate.js";

describe("withTimeout", () => {
  it("resolves with the original value before the deadline", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects with the supplied timeout message", async () => {
    const pending = new Promise<string>(() => undefined);
    await expect(withTimeout(pending, 5, "request expired")).rejects.toThrow(
      "request expired",
    );
  });

  it("uses the default timeout message", async () => {
    const pending = new Promise<string>(() => undefined);
    await expect(withTimeout(pending, 5)).rejects.toThrow("Operation timed out");
  });

  it("propagates an original rejection", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("source failure")), 50),
    ).rejects.toThrow("source failure");
  });

  it("rejects invalid timeout values", async () => {
    await expect(withTimeout(Promise.resolve("value"), 0)).rejects.toThrow();
    await expect(withTimeout(Promise.resolve("value"), Number.NaN)).rejects.toThrow();
  });
});
