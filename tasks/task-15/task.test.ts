import { describe, expect, it } from "vitest";
import { paginateByCursor } from "./candidate.js";

const records = [
  { id: "a", value: 1 },
  { id: "b", value: 2 },
  { id: "c", value: 3 },
  { id: "d", value: 4 },
];

describe("paginateByCursor", () => {
  it("returns the first page and a cursor for remaining items", () => {
    expect(paginateByCursor(records, null, 2, (item) => item.id)).toEqual({
      items: records.slice(0, 2),
      nextCursor: "b",
    });
  });

  it("starts after the cursor", () => {
    expect(paginateByCursor(records, "b", 2, (item) => item.id)).toEqual({
      items: records.slice(2, 4),
      nextCursor: null,
    });
  });

  it("returns null when the final page is shorter than the limit", () => {
    expect(paginateByCursor(records, "a", 10, (item) => item.id)).toEqual({
      items: records.slice(1),
      nextCursor: null,
    });
  });

  it("returns an empty final page after the last cursor", () => {
    expect(paginateByCursor(records, "d", 2, (item) => item.id)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("rejects unknown cursors and invalid limits", () => {
    expect(() => paginateByCursor(records, "missing", 2, (item) => item.id)).toThrow();
    expect(() => paginateByCursor(records, null, 0, (item) => item.id)).toThrow();
  });

  it("does not mutate the input array", () => {
    const original = [...records];
    paginateByCursor(records, null, 2, (item) => item.id);
    expect(records).toEqual(original);
  });
});
