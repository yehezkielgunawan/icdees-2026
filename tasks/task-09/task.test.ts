import { describe, expect, it } from "vitest";
import { normalizeUrlPath } from "./candidate.js";

describe("normalizeUrlPath", () => {
  it("adds a leading slash and collapses repeated slashes", () => {
    expect(normalizeUrlPath("users//alice/profile")).toBe("/users/alice/profile");
  });

  it("resolves dot segments", () => {
    expect(normalizeUrlPath("/a/./b/../c")).toBe("/a/c");
  });

  it("does not traverse above the root", () => {
    expect(normalizeUrlPath("../../admin")).toBe("/admin");
  });

  it("preserves a non-root trailing slash", () => {
    expect(normalizeUrlPath("/a/b///")).toBe("/a/b/");
  });

  it("normalizes an empty path to root", () => {
    expect(normalizeUrlPath("")).toBe("/");
    expect(normalizeUrlPath("///./../")).toBe("/");
  });
});
