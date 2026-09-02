import { describe, expect, it } from "vitest";
import { validatePaginationQuery } from "./candidate.js";

describe("validatePaginationQuery", () => {
  it("applies defaults when values are missing", () => {
    expect(validatePaginationQuery({})).toEqual({
      valid: true,
      page: 1,
      pageSize: 20,
      errors: {},
    });
  });

  it("normalizes valid numeric strings", () => {
    expect(validatePaginationQuery({ page: "3", pageSize: "50" })).toEqual({
      valid: true,
      page: 3,
      pageSize: 50,
      errors: {},
    });
  });

  it("accepts positive integer numbers", () => {
    expect(validatePaginationQuery({ page: 2, pageSize: 100 })).toEqual({
      valid: true,
      page: 2,
      pageSize: 100,
      errors: {},
    });
  });

  it("rejects zero, negative, fractional, and non-numeric values", () => {
    const result = validatePaginationQuery({ page: 0.5, pageSize: "nope" });

    expect(result.valid).toBe(false);
    expect(result.page).toBeNull();
    expect(result.pageSize).toBeNull();
    expect(result.errors).toHaveProperty("page");
    expect(result.errors).toHaveProperty("pageSize");
  });

  it("rejects page sizes over the maximum", () => {
    const result = validatePaginationQuery({ page: 1, pageSize: 101 });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty("pageSize");
  });
});
