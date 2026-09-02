import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./candidate.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit and reports remaining capacity", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000, () => 1000);

    expect(limiter.remaining("user")).toBe(2);
    expect(limiter.allow("user")).toBe(true);
    expect(limiter.remaining("user")).toBe(1);
    expect(limiter.allow("user")).toBe(true);
    expect(limiter.allow("user")).toBe(false);
    expect(limiter.remaining("user")).toBe(0);
  });

  it("keeps independent windows for different keys", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000, () => 1000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });

  it("starts a fresh window at the exact boundary", () => {
    let now = 1000;
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now);
    expect(limiter.allow("user")).toBe(true);
    expect(limiter.allow("user")).toBe(false);

    now = 2000;
    expect(limiter.allow("user")).toBe(true);
    expect(limiter.remaining("user")).toBe(0);
  });

  it("returns the configured limit for a new key", () => {
    const limiter = new FixedWindowRateLimiter(4, 1000, () => 1000);
    expect(limiter.remaining("new-user")).toBe(4);
  });

  it("rejects invalid constructor values", () => {
    expect(() => new FixedWindowRateLimiter(0, 1000)).toThrow();
    expect(() => new FixedWindowRateLimiter(1.5, 1000)).toThrow();
    expect(() => new FixedWindowRateLimiter(1, 0)).toThrow();
  });
});
