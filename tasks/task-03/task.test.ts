import { describe, expect, it } from "vitest";
import { buildCategoryTree } from "./candidate.js";

describe("buildCategoryTree", () => {
  it("nests children under their parent", () => {
    expect(
      buildCategoryTree([
        { id: "root", parentId: null, name: "Root" },
        { id: "child", parentId: "root", name: "Child" },
        { id: "grandchild", parentId: "child", name: "Grandchild" },
      ]),
    ).toEqual([
      {
        id: "root",
        parentId: null,
        name: "Root",
        children: [
          {
            id: "child",
            parentId: "root",
            name: "Child",
            children: [
              {
                id: "grandchild",
                parentId: "child",
                name: "Grandchild",
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("preserves root and child input order", () => {
    const tree = buildCategoryTree([
      { id: "r2", parentId: null, name: "R2" },
      { id: "r1", parentId: null, name: "R1" },
      { id: "c2", parentId: "r1", name: "C2" },
      { id: "c1", parentId: "r1", name: "C1" },
    ]);

    expect(tree.map((node) => node.id)).toEqual(["r2", "r1"]);
    expect(tree[1]?.children.map((node) => node.id)).toEqual(["c2", "c1"]);
  });

  it("promotes records with missing parents to roots", () => {
    expect(
      buildCategoryTree([{ id: "orphan", parentId: "missing", name: "Orphan" }]),
    ).toEqual([
      { id: "orphan", parentId: "missing", name: "Orphan", children: [] },
    ]);
  });

  it("returns an empty tree for empty input", () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});
