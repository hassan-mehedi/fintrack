import { describe, it, expect } from "vitest";
import { cn, formatCurrency } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "conditional", "always")).toBe("base always");
  });

  it("handles undefined and null", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });
});

describe("formatCurrency", () => {
  it("formats USD correctly", () => {
    const result = formatCurrency(1000, false, "USD");
    expect(result).toContain("1,000");
    expect(result).toContain("$");
  });

  it("formats BDT correctly", () => {
    const result = formatCurrency(5000, false, "BDT");
    expect(result).toContain("5,000");
  });

  it("rounds when rounded=true", () => {
    const result = formatCurrency(1234.56, true, "USD");
    expect(result).not.toContain(".56");
  });

  it("shows decimals when rounded=false", () => {
    const result = formatCurrency(1234.56, false, "USD");
    expect(result).toContain("1,234.56");
  });

  it("defaults to BDT when no currency provided", () => {
    const withBDT = formatCurrency(100, false, "BDT");
    const withDefault = formatCurrency(100);
    expect(withDefault).toBe(withBDT);
  });
});
