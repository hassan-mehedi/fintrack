import { describe, it, expect } from "vitest";
import { duplicateKey } from "@fintrack/core/import";

describe("duplicateKey", () => {
  it("normalises amount, description case and whitespace", () => {
    const stored = duplicateKey({
      date: "2024-03-01",
      amount: "1250.50",
      type: "expense",
      description: "Groceries",
    });
    const incoming = duplicateKey({
      date: "2024-03-01",
      amount: 1250.5,
      type: "expense",
      description: "  groceries ",
    });
    expect(incoming).toBe(stored);
  });

  it("treats a null description as empty", () => {
    expect(
      duplicateKey({ date: "2024-01-01", amount: "5", type: "income", description: null })
    ).toBe(duplicateKey({ date: "2024-01-01", amount: "5.00", type: "income", description: "" }));
  });

  it("differs when date, amount or type differ", () => {
    const base = { date: "2024-01-01", amount: "5", type: "income", description: "x" };
    expect(duplicateKey({ ...base, date: "2024-01-02" })).not.toBe(duplicateKey(base));
    expect(duplicateKey({ ...base, amount: "5.01" })).not.toBe(duplicateKey(base));
    expect(duplicateKey({ ...base, type: "expense" })).not.toBe(duplicateKey(base));
  });
});
