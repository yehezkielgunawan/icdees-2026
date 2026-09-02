import { describe, expect, it } from "vitest";
import { toSlug } from "./candidate.js";

describe("toSlug", () => {
  it("lowercases words and joins punctuation with hyphens", () => {
    expect(toSlug("  Hello, TypeScript World!  ")).toBe("hello-typescript-world");
  });

  it("collapses repeated separators", () => {
    expect(toSlug("one---two___three")).toBe("one-two-three");
  });

  it("removes accents through Unicode normalization", () => {
    expect(toSlug("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("returns an empty string for blank or punctuation-only titles", () => {
    expect(toSlug("   ")).toBe("");
    expect(toSlug("---___")).toBe("");
  });

  it("preserves digits", () => {
    expect(toSlug("Release 2026.09")).toBe("release-2026-09");
  });
});
