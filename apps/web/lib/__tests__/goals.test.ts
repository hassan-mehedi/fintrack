import { describe, it, expect } from "vitest";
import { monthlyNeeded } from "@fintrack/core/goals";

const today = new Date(2026, 8, 7);

describe("monthlyNeeded", () => {
  it("returns null without a deadline", () => {
    expect(monthlyNeeded(1000, null, today)).toBeNull();
  });

  it("returns null when the deadline has passed", () => {
    expect(monthlyNeeded(1000, "2026-09-06", today)).toBeNull();
  });

  it("returns 0 when nothing remains", () => {
    expect(monthlyNeeded(0, "2027-09-07", today)).toBe(0);
  });

  it("divides the remaining amount over whole months, rounded up", () => {
    expect(monthlyNeeded(1000, "2027-09-07", today)).toBe(84);
  });

  it("counts a deadline later this month as one month", () => {
    expect(monthlyNeeded(1000, "2026-09-30", today)).toBe(1000);
  });

  it("treats a deadline today as one month", () => {
    expect(monthlyNeeded(500, "2026-09-07", today)).toBe(500);
  });
});
