import { describe, expect, it } from "vitest";
import { TtlCache } from "./candidate.js";

describe("TtlCache", () => {
  it("returns a value before its TTL expires", () => {
    let now = 1000;
    const cache = new TtlCache<string, string>(() => now);
    cache.set("key", "value", 100);

    now = 1099;
    expect(cache.get("key")).toBe("value");
    expect(cache.has("key")).toBe(true);
  });

  it("treats an entry as expired at its exact deadline", () => {
    let now = 1000;
    const cache = new TtlCache<string, string>(() => now);
    cache.set("key", "value", 100);

    now = 1100;
    expect(cache.get("key")).toBeUndefined();
    expect(cache.has("key")).toBe(false);
  });

  it("replaces an existing entry", () => {
    const cache = new TtlCache<string, number>(() => 1000);
    cache.set("key", 1, 100);
    cache.set("key", 2, 100);
    expect(cache.get("key")).toBe(2);
  });

  it("supports delete and clear", () => {
    const cache = new TtlCache<string, number>(() => 1000);
    cache.set("a", 1, 100);
    cache.set("b", 2, 100);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    cache.clear();
    expect(cache.has("b")).toBe(false);
  });

  it("rejects a non-positive TTL", () => {
    const cache = new TtlCache<string, string>(() => 1000);
    expect(() => cache.set("key", "value", 0)).toThrow();
    expect(() => cache.set("key", "value", Number.POSITIVE_INFINITY)).toThrow();
  });
});
