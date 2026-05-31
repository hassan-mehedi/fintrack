import { describe, it, expect } from "vitest";
import { parseVeryfi, type VeryfiRaw } from "@/lib/ocr/veryfi";

describe("parseVeryfi", () => {
  it("extracts top-level fields", () => {
    const raw: VeryfiRaw = {
      id: 123,
      date: "2024-08-12 15:32:00",
      total: 248.5,
      subtotal: 220.5,
      tax: 28,
      currency_code: "BDT",
      payment: { type: "credit card" },
      category: "Groceries",
      vendor: { name: "Daraz", raw_name: "DARAZ.COM.BD" },
      line_items: [
        { description: "Toothpaste", quantity: 1, total: 120 },
        { description: "Soap", quantity: 2, total: 100 },
      ],
      ocr_text: "Daraz Toothpaste 120 Soap 100",
    };

    const parsed = parseVeryfi(raw);
    expect(parsed.amount).toBe(248.5);
    expect(parsed.subtotal).toBe(220.5);
    expect(parsed.tax).toBe(28);
    expect(parsed.merchantName).toBe("Daraz");
    expect(parsed.date).toBe("2024-08-12");
    expect(parsed.currency).toBe("BDT");
    expect(parsed.paymentType).toBe("credit card");
    expect(parsed.category).toBe("Groceries");
    expect(parsed.lineItems).toEqual([
      { description: "Toothpaste", quantity: 1, total: 120 },
      { description: "Soap", quantity: 2, total: 100 },
    ]);
  });

  it("falls back to raw_name when name is missing", () => {
    const raw: VeryfiRaw = {
      vendor: { name: null, raw_name: "BKASH MERCHANT" },
      total: 100,
    };
    expect(parseVeryfi(raw).merchantName).toBe("BKASH MERCHANT");
  });

  it("returns null fields for empty response", () => {
    const parsed = parseVeryfi({});
    expect(parsed.amount).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.merchantName).toBeNull();
    expect(parsed.currency).toBeNull();
    expect(parsed.lineItems).toEqual([]);
  });

  it("drops null line items and trims descriptions", () => {
    const raw: VeryfiRaw = {
      line_items: [
        { description: "  Rice  ", quantity: 1, total: 80 },
        { description: null, quantity: null, total: null },
        { description: "Oil", quantity: null, total: 150 },
      ],
    };
    const parsed = parseVeryfi(raw);
    expect(parsed.lineItems).toEqual([
      { description: "Rice", quantity: 1, total: 80 },
      { description: "Oil", quantity: null, total: 150 },
    ]);
  });

  it("handles date-only strings", () => {
    expect(parseVeryfi({ date: "2024-08-12" }).date).toBe("2024-08-12");
  });

  it("returns null date for non-ISO format", () => {
    expect(parseVeryfi({ date: "08/12/2024" }).date).toBeNull();
  });
});
