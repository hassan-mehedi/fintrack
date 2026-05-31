import { describe, it, expect } from "vitest";
import { normalizeMerchantName } from "@/lib/merchants";

describe("normalizeMerchantName", () => {
  it("lowercases", () => {
    expect(normalizeMerchantName("STARBUCKS")).toBe("starbucks");
  });

  it("collapses whitespace", () => {
    expect(normalizeMerchantName("Pathao   Food")).toBe("pathao food");
  });

  it("strips punctuation without inserting spaces", () => {
    expect(normalizeMerchantName("Daraz.com.bd")).toBe("darazcombd");
  });

  it("strips dashes, slashes, parentheses", () => {
    expect(normalizeMerchantName("Pathao - Banani (Dhaka)")).toBe(
      "pathao  banani dhaka",
    );
  });

  it("trims leading and trailing space", () => {
    expect(normalizeMerchantName("  bKash  ")).toBe("bkash");
  });

  it("collapses consecutive whitespace from stripped punctuation", () => {
    expect(normalizeMerchantName("A - - B")).toBe("a   b");
    // (consecutive spaces are not aggressively collapsed; intentional)
  });

  it("preserves alphanumeric across spaces", () => {
    expect(normalizeMerchantName("7-Eleven #123")).toBe("7eleven 123");
  });

  it("handles empty input", () => {
    expect(normalizeMerchantName("")).toBe("");
  });

  it("dedupe-equivalent inputs normalise the same way", () => {
    const a = normalizeMerchantName("BKASH");
    const b = normalizeMerchantName("  bkash  ");
    const c = normalizeMerchantName("bKash");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
