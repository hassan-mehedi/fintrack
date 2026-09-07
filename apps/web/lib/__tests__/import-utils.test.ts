import { describe, it, expect } from "vitest";
import { parseCsv } from "@fintrack/shared/csv";
import {
  guessColumnMapping,
  mapCsvRows,
  parseCsvType,
  splitTags,
} from "@/components/transactions/import-utils";

describe("guessColumnMapping", () => {
  it("matches common bank export headers", () => {
    const mapping = guessColumnMapping([
      "Transaction Date",
      "Narration",
      "Debit/Credit",
      "Amount (BDT)",
      "Category",
      "Labels",
    ]);
    expect(mapping).toEqual({
      date: 0,
      description: 1,
      type: 2,
      amount: 3,
      category: 4,
      tags: 5,
    });
  });

  it("leaves unknown columns unmapped", () => {
    expect(guessColumnMapping(["Foo", "Bar"])).toEqual({});
  });

  it("does not confuse a value date with an amount", () => {
    const mapping = guessColumnMapping(["Value Date", "Value"]);
    expect(mapping.date).toBe(0);
    expect(mapping.amount).toBe(1);
  });
});

describe("parseCsvType", () => {
  it("reads expense words", () => {
    expect(parseCsvType("Expense")).toBe("expense");
    expect(parseCsvType("DEBIT")).toBe("expense");
    expect(parseCsvType("out")).toBe("expense");
    expect(parseCsvType("Withdrawal")).toBe("expense");
  });

  it("reads income words", () => {
    expect(parseCsvType("income")).toBe("income");
    expect(parseCsvType("Credit")).toBe("income");
    expect(parseCsvType("Deposit")).toBe("income");
  });

  it("returns null for anything else", () => {
    expect(parseCsvType("")).toBeNull();
    expect(parseCsvType(undefined)).toBeNull();
    expect(parseCsvType("transfer")).toBeNull();
  });
});

describe("splitTags", () => {
  it("splits on ; and | and trims", () => {
    expect(splitTags("work; travel |food")).toEqual(["work", "travel", "food"]);
  });

  it("drops empties and duplicates", () => {
    expect(splitTags("a;;a| ")).toEqual(["a"]);
    expect(splitTags(undefined)).toEqual([]);
  });
});

describe("mapCsvRows", () => {
  const csv = parseCsv(
    [
      "Date,Amount,Description,Category,Tags",
      "2024-03-01,-1250.50,Groceries,Food,home;weekly",
      '03/02/2024,"৳3,000",Salary,,',
      "not a date,10,Broken,,",
      "2024-03-03,0,Zero,,",
    ].join("\n")
  );
  const mapping = guessColumnMapping(csv.headers);

  it("infers type from the sign when no type column is mapped", () => {
    const { valid } = mapCsvRows(csv.rows, mapping, { dayFirst: false });
    expect(valid[0]).toEqual({
      date: "2024-03-01",
      amount: "1250.50",
      type: "expense",
      description: "Groceries",
      categoryName: "Food",
      tags: ["home", "weekly"],
    });
    expect(valid[1]).toMatchObject({
      date: "2024-03-02",
      amount: "3000.00",
      type: "income",
      categoryName: null,
      tags: [],
    });
  });

  it("honours day-first dates", () => {
    const { valid } = mapCsvRows(csv.rows, mapping, { dayFirst: true });
    expect(valid[1].date).toBe("2024-02-03");
  });

  it("reports invalid rows with their index and reason", () => {
    const { invalid, preview } = mapCsvRows(csv.rows, mapping, { dayFirst: false });
    expect(invalid).toEqual([
      { index: 2, reason: "Unreadable date" },
      { index: 3, reason: "Missing or zero amount" },
    ]);
    expect(preview).toHaveLength(4);
    expect(preview[2].row).toBeNull();
  });

  it("uses the type column when mapped and rejects unknown values", () => {
    const rows = [
      ["2024-01-01", "100", "Debit"],
      ["2024-01-02", "-100", "Credit"],
      ["2024-01-03", "100", "Mystery"],
    ];
    const { valid, invalid } = mapCsvRows(
      rows,
      { date: 0, amount: 1, type: 2 },
      { dayFirst: false }
    );
    expect(valid.map((r) => r.type)).toEqual(["expense", "income"]);
    expect(valid[1].amount).toBe("100.00");
    expect(invalid).toEqual([{ index: 2, reason: "Unrecognised type" }]);
  });
});
