import { describe, it, expect } from "vitest";
import { templateToFormDefaults } from "@/lib/templates";

describe("templateToFormDefaults", () => {
  it("maps a fully-populated template", () => {
    const out = templateToFormDefaults({
      accountId: "acc-1",
      categoryId: "cat-1",
      amount: "250.00",
      fee: "5.00",
      type: "expense",
      description: "Daily lunch",
      tags: ["food", "weekday"],
    });
    expect(out).toEqual({
      accountId: "acc-1",
      categoryId: "cat-1",
      toAccountId: null,
      amount: "250.00",
      fee: "5.00",
      type: "expense",
      description: "Daily lunch",
      tags: ["food", "weekday"],
    });
  });

  it("returns empty-string defaults for null amount + no account/category", () => {
    const out = templateToFormDefaults({
      accountId: null,
      categoryId: null,
      amount: null,
      fee: "0",
      type: "expense",
      description: "",
      tags: [],
    });
    expect(out.accountId).toBe("");
    expect(out.categoryId).toBe("");
    expect(out.amount).toBe("");
    expect(out.fee).toBe("0");
  });

  it("clones the tags array (caller can mutate without poisoning the source)", () => {
    const src = ["a", "b"];
    const out = templateToFormDefaults({
      accountId: null,
      categoryId: null,
      amount: null,
      fee: "0",
      type: "income",
      description: "",
      tags: src,
    });
    out.tags.push("c");
    expect(src).toEqual(["a", "b"]);
  });
});
