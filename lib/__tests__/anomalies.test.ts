import { describe, it, expect } from "vitest";
import {
  meanAndStdev,
  isOutlier,
  findDuplicatePairs,
  type DuplicateCandidate,
} from "@/lib/insights/anomalies";

describe("meanAndStdev", () => {
  it("returns zero on empty input", () => {
    expect(meanAndStdev([])).toEqual({ mean: 0, stdev: 0 });
  });

  it("computes population stdev (not sample stdev)", () => {
    // For [2, 4, 4, 4, 5, 5, 7, 9] the population stdev is 2 exactly.
    const { mean, stdev } = meanAndStdev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBe(5);
    expect(stdev).toBeCloseTo(2, 5);
  });

  it("returns 0 stdev for constant input", () => {
    expect(meanAndStdev([10, 10, 10, 10]).stdev).toBe(0);
  });
});

describe("isOutlier", () => {
  const everyday = [
    100, 110, 95, 105, 102, 99, 108, 101, 97, 103, 100, 102, 104,
  ];

  it("flags a 10× spike", () => {
    expect(isOutlier(1000, everyday)).toBe(true);
  });

  it("does not flag a typical amount", () => {
    expect(isOutlier(108, everyday)).toBe(false);
  });

  it("refuses to fire with too few samples", () => {
    expect(isOutlier(1_000_000, [100, 100, 100])).toBe(false);
  });

  it("refuses to fire when stdev is zero (constant history)", () => {
    expect(isOutlier(1000, Array(20).fill(100))).toBe(false);
  });

  it("honours a custom threshold", () => {
    // Threshold 1 stdev — easier to cross.
    expect(isOutlier(110, everyday, { threshold: 1, minSamples: 5 })).toBe(true);
    // Threshold 5 stdev — needs a very large spike.
    expect(isOutlier(110, everyday, { threshold: 5, minSamples: 5 })).toBe(false);
  });
});

describe("findDuplicatePairs", () => {
  const now = new Date("2026-05-18T12:00:00Z");
  const t = (
    id: string,
    accountId: string,
    amount: number,
    merchantId: string | null,
    offsetMs: number,
  ): DuplicateCandidate => ({
    id,
    accountId,
    merchantId,
    amount,
    createdAt: new Date(now.getTime() + offsetMs),
  });

  it("pairs same-account/merchant/amount within the window", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 100, "m1", 0),
      t("b", "acc1", 100, "m1", 60_000),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("a");
    expect(pairs[0].b.id).toBe("b");
  });

  it("does not pair across different accounts", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 100, "m1", 0),
      t("b", "acc2", 100, "m1", 60_000),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("does not pair across different merchants", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 100, "m1", 0),
      t("b", "acc1", 100, "m2", 60_000),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("does not pair across different amounts", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 100, "m1", 0),
      t("b", "acc1", 100.5, "m1", 60_000),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("respects the window — pairs outside it don't count", () => {
    const pairs = findDuplicatePairs(
      [
        t("a", "acc1", 100, "m1", 0),
        t("b", "acc1", 100, "m1", 6 * 60 * 1000), // 6 minutes — beyond 5min default
      ],
      5 * 60 * 1000,
    );
    expect(pairs).toHaveLength(0);
  });

  it("treats null merchantId consistently — both null matches both null", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 50, null, 0),
      t("b", "acc1", 50, null, 30_000),
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("produces only adjacent pairs after sort — three duplicates yield two pairs", () => {
    const pairs = findDuplicatePairs([
      t("a", "acc1", 100, "m1", 0),
      t("b", "acc1", 100, "m1", 60_000),
      t("c", "acc1", 100, "m1", 120_000),
    ]);
    // (a,b) and (b,c) — adjacent pairs both inside the window.
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.b.id)).toEqual(["b", "c"]);
  });
});
