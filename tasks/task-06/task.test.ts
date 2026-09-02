import { describe, expect, it } from "vitest";
import { validateConfig } from "./candidate.js";

describe("validateConfig", () => {
  it("accepts present non-empty values including false and zero", () => {
    expect(
      validateConfig({ host: "localhost", secure: false, port: 0 }, [
        "host",
        "secure",
        "port",
      ]),
    ).toEqual({ valid: true, missing: [], invalid: [] });
  });

  it("reports absent and null values as missing", () => {
    expect(validateConfig({ present: "yes", empty: null }, ["missing", "empty", "present"]))
      .toEqual({ valid: false, missing: ["missing", "empty"], invalid: [] });
  });

  it("reports blank strings as invalid", () => {
    expect(validateConfig({ name: "  " }, ["name"])).toEqual({
      valid: false,
      missing: [],
      invalid: ["name"],
    });
  });

  it("preserves required-key order in both result arrays", () => {
    expect(validateConfig({ a: "", c: undefined }, ["c", "a", "b"])).toEqual({
      valid: false,
      missing: ["c", "b"],
      invalid: ["a"],
    });
  });

  it("does not mutate the configuration object", () => {
    const input = { key: "value" };
    validateConfig(input, ["key"]);
    expect(input).toEqual({ key: "value" });
  });
});
