import { describe, it, expect } from "vitest";
import {
  getNextDueDate,
  type RecurringRule,
} from "@fintrack/core/recurring-processor";
import { shouldRemind } from "@fintrack/core/reminders";

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "rule-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    amount: "1200",
    fee: "0",
    type: "expense",
    description: "Netflix",
    frequency: "monthly",
    startDate: "2026-01-15",
    endDate: null,
    lastProcessed: null,
    isActive: true,
    tags: [],
    ...overrides,
  };
}

const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe("getNextDueDate", () => {
  it("returns the start date when it is still in the future", () => {
    expect(getNextDueDate(rule({ startDate: "2026-09-20" }), day("2026-09-07"))).toBe(
      "2026-09-20"
    );
  });

  it("returns today when an occurrence falls on today", () => {
    expect(getNextDueDate(rule({ startDate: "2026-09-07" }), day("2026-09-07"))).toBe(
      "2026-09-07"
    );
  });

  it("advances from the start date to the first occurrence on or after today", () => {
    expect(getNextDueDate(rule(), day("2026-09-07"))).toBe("2026-09-15");
  });

  it("continues from lastProcessed rather than startDate", () => {
    expect(
      getNextDueDate(rule({ lastProcessed: "2026-08-15" }), day("2026-09-07"))
    ).toBe("2026-09-15");
  });

  it("skips occurrences that were already due but not processed", () => {
    expect(
      getNextDueDate(
        rule({ frequency: "weekly", startDate: "2026-08-03", lastProcessed: "2026-08-10" }),
        day("2026-09-07")
      )
    ).toBe("2026-09-07");
  });

  it("clamps month-end dates to the shorter following month", () => {
    expect(
      getNextDueDate(
        rule({ startDate: "2026-01-31", lastProcessed: "2026-01-31" }),
        day("2026-02-10")
      )
    ).toBe("2026-02-28");
  });

  it("handles yearly rules across a leap day", () => {
    expect(
      getNextDueDate(
        rule({ frequency: "yearly", startDate: "2028-02-29", lastProcessed: "2028-02-29" }),
        day("2029-01-01")
      )
    ).toBe("2029-02-28");
  });

  it("handles yearly rules from the start date", () => {
    expect(
      getNextDueDate(rule({ frequency: "yearly", startDate: "2024-03-10" }), day("2026-09-07"))
    ).toBe("2027-03-10");
  });

  it("returns null when the rule is inactive", () => {
    expect(getNextDueDate(rule({ isActive: false }), day("2026-09-07"))).toBeNull();
  });

  it("returns null when the end date has passed", () => {
    expect(getNextDueDate(rule({ endDate: "2026-08-31" }), day("2026-09-07"))).toBeNull();
  });

  it("returns null when the next occurrence lands after the end date", () => {
    expect(getNextDueDate(rule({ endDate: "2026-09-10" }), day("2026-09-07"))).toBeNull();
  });
});

describe("shouldRemind", () => {
  it("reminds on the due day when reminderDays is 0", () => {
    expect(shouldRemind("2026-09-07", 0, day("2026-09-07"))).toBe(true);
  });

  it("does not remind before the window opens", () => {
    expect(shouldRemind("2026-09-10", 0, day("2026-09-07"))).toBe(false);
    expect(shouldRemind("2026-09-11", 3, day("2026-09-07"))).toBe(false);
  });

  it("reminds anywhere inside the window", () => {
    expect(shouldRemind("2026-09-10", 3, day("2026-09-07"))).toBe(true);
    expect(shouldRemind("2026-09-08", 3, day("2026-09-07"))).toBe(true);
    expect(shouldRemind("2026-09-14", 7, day("2026-09-07"))).toBe(true);
  });

  it("never reminds for a due date already in the past", () => {
    expect(shouldRemind("2026-09-06", 7, day("2026-09-07"))).toBe(false);
  });

  it("compares calendar days regardless of time of day", () => {
    expect(shouldRemind("2026-09-08", 1, new Date("2026-09-07T23:59:00"))).toBe(true);
  });
});
