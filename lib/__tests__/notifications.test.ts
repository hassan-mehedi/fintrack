import { describe, it, expect } from "vitest";
import {
  classifyBudgetThreshold,
  nextOccurrenceAfter,
} from "@/lib/notifications/events";

describe("classifyBudgetThreshold", () => {
  it("returns null when budget is far from being crossed", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 100,
        addedAmount: 50,
        warningPercent: 80,
      }),
    ).toBeNull();
  });

  it("returns 'warning' the first time spent crosses the warning line", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 7_900,
        addedAmount: 200, // → 8 100 > 8 000 (80%)
        warningPercent: 80,
      }),
    ).toBe("warning");
  });

  it("does not fire 'warning' a second time once already past the line", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 8_500,
        addedAmount: 100, // already past warning
        warningPercent: 80,
      }),
    ).toBeNull();
  });

  it("returns 'exceeded' when the transaction tips you over the budget", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 9_500,
        addedAmount: 800, // 10 300 > 10 000
        warningPercent: 80,
      }),
    ).toBe("exceeded");
  });

  it("prefers 'exceeded' over 'warning' when both lines crossed at once", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 1_000,
        addedAmount: 15_000, // crosses 80% AND 100% in one go
        warningPercent: 80,
      }),
    ).toBe("exceeded");
  });

  it("doesn't fire when already exceeded before the transaction", () => {
    expect(
      classifyBudgetThreshold({
        budgetAmount: 10_000,
        spentBefore: 12_000,
        addedAmount: 100,
        warningPercent: 80,
      }),
    ).toBeNull();
  });
});

describe("nextOccurrenceAfter", () => {
  it("advances by one day for daily", () => {
    const d = nextOccurrenceAfter("2026-05-10", "2026-01-01", "daily");
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-11");
  });

  it("advances by one week for weekly", () => {
    const d = nextOccurrenceAfter("2026-05-10", "2026-01-01", "weekly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-17");
  });

  it("advances by one month for monthly", () => {
    const d = nextOccurrenceAfter("2026-05-10", "2026-01-01", "monthly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-06-10");
  });

  it("advances by one year for yearly", () => {
    const d = nextOccurrenceAfter("2025-05-18", "2024-01-01", "yearly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-18");
  });

  it("uses startDate when lastProcessed is null", () => {
    const d = nextOccurrenceAfter(null, "2026-01-15", "monthly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-02-15");
  });
});
