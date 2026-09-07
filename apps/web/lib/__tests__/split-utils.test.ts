import { describe, it, expect } from "vitest";
import {
  splitRemainder,
  splitsMatchTotal,
  splitsReady,
  sumSplitAmounts,
} from "@/components/transactions/split-utils";

const row = (amount: string, categoryId = "c1") => ({ categoryId, amount, note: "" });

describe("sumSplitAmounts", () => {
  it("adds string and numeric amounts and ignores blanks", () => {
    expect(sumSplitAmounts([{ amount: "10.50" }, { amount: 4.5 }, { amount: "" }])).toBe(15);
  });
});

describe("splitRemainder", () => {
  it("returns what is left to allocate, rounded to cents", () => {
    expect(splitRemainder(100, [row("30"), row("20.10")])).toBe(49.9);
  });

  it("goes negative when over-allocated", () => {
    expect(splitRemainder(50, [row("60")])).toBe(-10);
  });
});

describe("splitsMatchTotal", () => {
  it("accepts an exact match", () => {
    expect(splitsMatchTotal(500, [row("300"), row("200")])).toBe(true);
  });

  it("tolerates half-cent rounding drift", () => {
    expect(splitsMatchTotal(10, [row("3.333"), row("3.333"), row("3.334")])).toBe(true);
    expect(splitsMatchTotal(0.3, [row("0.1"), row("0.2")])).toBe(true);
  });

  it("rejects a one-cent gap", () => {
    expect(splitsMatchTotal(500, [row("300"), row("199.99")])).toBe(false);
  });
});

describe("splitsReady", () => {
  it("requires a category and a positive amount on every row", () => {
    expect(splitsReady(100, [row("50"), row("50", "")])).toBe(false);
    expect(splitsReady(100, [row("100"), row("0")])).toBe(false);
    expect(splitsReady(100, [row("60"), row("40", "c2")])).toBe(true);
  });

  it("rejects an empty list and a mismatched sum", () => {
    expect(splitsReady(100, [])).toBe(false);
    expect(splitsReady(100, [row("90")])).toBe(false);
  });
});
