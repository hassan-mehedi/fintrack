import { describe, it, expect } from "vitest";
import {
  buildCategoryTree,
  ancestorChain,
  descendantIds,
  flattenForSelect,
  type CategoryNode,
} from "@/lib/categories";

function node(
  id: string,
  parentId: string | null = null,
  sortOrder = 0,
  name = id,
): CategoryNode {
  return {
    id,
    name,
    icon: "📁",
    color: "#000",
    type: "expense",
    parentId,
    sortOrder,
    archived: false,
    systemKey: null,
  };
}

describe("buildCategoryTree", () => {
  it("returns a flat list as a forest of roots", () => {
    const tree = buildCategoryTree([node("a"), node("b")]);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toEqual([]);
    expect(tree[1].children).toEqual([]);
  });

  it("nests children under their parents", () => {
    const tree = buildCategoryTree([
      node("food"),
      node("groceries", "food"),
      node("restaurants", "food"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("food");
    expect(tree[0].children.map((c) => c.id).sort()).toEqual([
      "groceries",
      "restaurants",
    ]);
  });

  it("sets depth correctly for nested levels", () => {
    const tree = buildCategoryTree([
      node("a"),
      node("b", "a"),
      node("c", "b"),
    ]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("treats orphan parentId references as roots", () => {
    const tree = buildCategoryTree([
      node("orphan", "missing-parent"),
      node("real"),
    ]);
    expect(tree).toHaveLength(2);
  });

  it("breaks cycles by surfacing the back-edge as a root", () => {
    // a → b → a would loop. buildCategoryTree should drop the back-edge.
    const tree = buildCategoryTree([node("a", "b"), node("b", "a")]);
    // Both end up as roots without infinite recursion.
    expect(tree.length).toBeGreaterThanOrEqual(1);
    expect(tree.length).toBeLessThanOrEqual(2);
  });

  it("sorts siblings by sortOrder then name", () => {
    const tree = buildCategoryTree([
      node("z", null, 1, "Zeta"),
      node("a", null, 0, "Alpha"),
      node("m", null, 0, "Beta"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "m", "z"]);
  });
});

describe("flattenForSelect", () => {
  it("indents nested category names for plain selects", () => {
    const tree = buildCategoryTree([
      node("food", null, 0, "Food"),
      node("groc", "food", 0, "Groceries"),
    ]);
    const flat = flattenForSelect(tree, { indent: ". " });
    expect(flat.map((n) => n.displayName)).toEqual(["Food", ". Groceries"]);
  });
});

describe("ancestorChain", () => {
  it("returns self + ancestors up to a root", () => {
    const cats = [node("food"), node("groc", "food"), node("orgo", "groc")];
    expect(ancestorChain("orgo", cats)).toEqual(["orgo", "groc", "food"]);
  });

  it("stops at the root and doesn't loop on cycles", () => {
    const cats = [node("a", "b"), node("b", "a")];
    const chain = ancestorChain("a", cats);
    // Should terminate even with a cycle in the data.
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});

describe("descendantIds", () => {
  it("collects all descendants but not the root itself", () => {
    const cats = [
      node("food"),
      node("groc", "food"),
      node("rest", "food"),
      node("orgo", "groc"),
      node("solo"),
    ];
    expect(descendantIds("food", cats).sort()).toEqual(["groc", "orgo", "rest"]);
  });

  it("returns empty array for a leaf", () => {
    const cats = [node("a")];
    expect(descendantIds("a", cats)).toEqual([]);
  });
});
