import { describe, expect, it } from "vitest";
import { parseQuery } from "./candidate.js";

describe("parseQuery", () => {
  it("parses ordinary key-value pairs", () => {
    expect(parseQuery("name=Alice&active=true")).toEqual({
      name: "Alice",
      active: "true",
    });
  });

  it("accepts a leading question mark", () => {
    expect(parseQuery("?page=2")).toEqual({ page: "2" });
  });

  it("collects repeated keys in occurrence order", () => {
    expect(parseQuery("tag=one&tag=two&tag=three")).toEqual({
      tag: ["one", "two", "three"],
    });
  });

  it("decodes values and preserves empty values", () => {
    expect(parseQuery("message=hello%20world&empty=")).toEqual({
      message: "hello world",
      empty: "",
    });
  });

  it("treats __proto__ as ordinary data", () => {
    const result = parseQuery("__proto__=safe");
    expect(result["__proto__"]).toBe("safe");
    expect(Object.getPrototypeOf(result)).toBeNull();
  });
});
