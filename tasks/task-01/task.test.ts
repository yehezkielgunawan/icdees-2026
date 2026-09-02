import { describe, expect, it } from "vitest";
import { groupBy } from "./candidate.js";

describe("groupBy", () => {
  it("groups records and preserves order within each group", () => {
    const records = [
      { id: 1, owner: "a" },
      { id: 2, owner: "b" },
      { id: 3, owner: "a" },
    ];

    expect(groupBy(records, (record) => record.owner)).toEqual({
      a: [records[0], records[2]],
      b: [records[1]],
    });
  });

  it("returns an empty object for empty input", () => {
    expect(groupBy([], (value) => value)).toEqual({});
  });

  it("supports numeric keys", () => {
    expect(groupBy([1, 2, 3, 4], (value) => value % 2)).toEqual({
      0: [2, 4],
      1: [1, 3],
    });
  });

  it("supports prototype-sensitive string keys", () => {
    const result = groupBy(["first", "second"], (value) =>
      value === "first" ? "__proto__" : "constructor",
    );

    expect(Object.keys(result)).toEqual(["__proto__", "constructor"]);
    expect(result["__proto__"]).toEqual(["first"]);
    expect(result.constructor).toEqual(["second"]);
  });

  it("does not mutate the input array", () => {
    const input = [{ value: "x" }, { value: "y" }];
    const original = [...input];

    groupBy(input, (item) => item.value);

    expect(input).toEqual(original);
  });
});
