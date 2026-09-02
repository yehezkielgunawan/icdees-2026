import { describe, expect, it } from "vitest";
import { dedupeById } from "./candidate.js";

describe("dedupeById", () => {
  it("keeps the first record for every ID", () => {
    const first = { id: "a", value: 1 };
    const duplicate = { id: "a", value: 2 };
    const second = { id: "b", value: 3 };

    expect(dedupeById([first, duplicate, second])).toEqual([first, second]);
  });

  it("preserves first-seen order", () => {
    expect(
      dedupeById([
        { id: 3, value: "third" },
        { id: 1, value: "first" },
        { id: 3, value: "ignored" },
        { id: 2, value: "second" },
      ]),
    ).toEqual([
      { id: 3, value: "third" },
      { id: 1, value: "first" },
      { id: 2, value: "second" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeById([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [{ id: "a" }, { id: "a" }];
    const original = [...input];

    dedupeById(input);

    expect(input).toEqual(original);
  });
});
