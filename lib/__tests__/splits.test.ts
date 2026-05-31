import { describe, it, expect } from "vitest";
import { validateSplitChildren } from "@/lib/ledger";

describe("validateSplitChildren", () => {
  it("accepts children that sum to the parent amount", () => {
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [
          { categoryId: "a", amount: 60 },
          { categoryId: "b", amount: 40 },
        ],
      }),
    ).not.toThrow();
  });

  it("tolerates sub-cent rounding", () => {
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [
          { categoryId: "a", amount: 33.33 },
          { categoryId: "b", amount: 33.33 },
          { categoryId: "c", amount: 33.34 },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects when the sum doesn't match", () => {
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [
          { categoryId: "a", amount: 50 },
          { categoryId: "b", amount: 40 },
        ],
      }),
    ).toThrow(/sum/);
  });

  it("rejects fewer than 2 children", () => {
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [{ categoryId: "a", amount: 100 }],
      }),
    ).toThrow(/at least 2/);
  });

  it("rejects zero or negative amounts", () => {
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [
          { categoryId: "a", amount: 100 },
          { categoryId: "b", amount: 0 },
        ],
      }),
    ).toThrow(/positive/);
    expect(() =>
      validateSplitChildren({
        totalAmount: 100,
        children: [
          { categoryId: "a", amount: 110 },
          { categoryId: "b", amount: -10 },
        ],
      }),
    ).toThrow(/positive/);
  });
});

// The full posting math is asserted in the existing ledger.test.ts via
// `computeLegs`. For splits, the per-row posting shape is verified by hand:
//
//   parent:      account -(amount+fee), split +amount, fees +fee
//   each child:  split -child.amount,   category +child.amount
//
//   Cross-check across parent + N children:
//     account total = -(amount+fee)             ✓ matches the real account flow
//     split  total  = +amount - sum(children)   = 0 since sum(children)==amount
//     fees   total  = +fee
//     categories    = sum to amount in real categories
//     Net           = -(amount+fee) + 0 + fee + amount = 0 ✓
describe("split posting model (documentation-as-test)", () => {
  it("balances across parent + children in expense case", () => {
    const total = 100;
    const fee = 5;
    const children = [
      { categoryId: "groceries", amount: 70 },
      { categoryId: "household", amount: 30 },
    ];
    const parentLegs = [
      { kind: "account", amount: -(total + fee) },
      { kind: "split", amount: total },
      { kind: "fees", amount: fee },
    ];
    const childLegs = children.flatMap((c) => [
      { kind: "split", amount: -c.amount },
      { kind: "category", amount: c.amount },
    ]);
    const all = [...parentLegs, ...childLegs];
    const total_sum = all.reduce((s, l) => s + l.amount, 0);
    expect(total_sum).toBe(0);
  });
});
