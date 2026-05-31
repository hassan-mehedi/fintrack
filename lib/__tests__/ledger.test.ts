import { describe, it, expect } from "vitest";
import { computeLegs, type LegInputs } from "@/lib/ledger";

const BANK = { id: "src-bank", type: "bank", currency: "BDT" };
const CASH = { id: "src-cash", type: "cash", currency: "BDT" };
const CC = { id: "src-cc", type: "credit_card", currency: "BDT" };
const LOAN = { id: "src-loan", type: "loan", currency: "BDT" };
const CATEGORY = "cat-1";
const FEES = "cat-fees";

function sumOf(legs: ReturnType<typeof computeLegs>): number {
  return legs.reduce((s, l) => s + l.amount, 0);
}

describe("computeLegs — zero-sum invariant", () => {
  const cases: Array<{ name: string; input: LegInputs }> = [
    {
      name: "income to asset, no fee",
      input: { type: "income", amount: 1000, fee: 0, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "income to asset, with fee",
      input: { type: "income", amount: 1000, fee: 25, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "income to liability (refund), with fee",
      input: { type: "income", amount: 500, fee: 5, source: CC, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "expense from asset, no fee",
      input: { type: "expense", amount: 200, fee: 0, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "expense from asset, with fee",
      input: { type: "expense", amount: 200, fee: 7.5, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "expense from liability, with fee",
      input: { type: "expense", amount: 350, fee: 12, source: CC, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "transfer asset→asset, with fee",
      input: { type: "transfer", amount: 100, fee: 10, source: BANK, destination: CASH, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "transfer asset→liability (pay credit card)",
      input: { type: "transfer", amount: 500, fee: 0, source: BANK, destination: CC, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "transfer asset→liability with fee",
      input: { type: "transfer", amount: 500, fee: 8, source: BANK, destination: CC, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "transfer liability→asset (cash advance), with fee",
      input: { type: "transfer", amount: 200, fee: 15, source: LOAN, destination: BANK, categoryId: CATEGORY, feesCategoryId: FEES },
    },
    {
      name: "transfer liability→liability, no fee",
      input: { type: "transfer", amount: 100, fee: 0, source: CC, destination: LOAN, categoryId: CATEGORY, feesCategoryId: FEES },
    },
  ];

  for (const c of cases) {
    it(`${c.name} sums to 0`, () => {
      const legs = computeLegs(c.input);
      expect(Math.abs(sumOf(legs))).toBeLessThanOrEqual(1e-9);
    });
  }
});

describe("computeLegs — account-side amounts match legacy semantics", () => {
  it("income to bank: account leg = amount - fee", () => {
    const legs = computeLegs({ type: "income", amount: 100, fee: 5, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES });
    const accLeg = legs.find((l) => l.accountId === BANK.id);
    expect(accLeg?.amount).toBe(95);
  });

  it("expense from bank: account leg = -(amount + fee)", () => {
    const legs = computeLegs({ type: "expense", amount: 100, fee: 5, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES });
    const accLeg = legs.find((l) => l.accountId === BANK.id);
    expect(accLeg?.amount).toBe(-105);
  });

  it("expense on credit card: account leg = -(amount + fee), balance translates to +debt", () => {
    const legs = computeLegs({ type: "expense", amount: 100, fee: 5, source: CC, categoryId: CATEGORY, feesCategoryId: FEES });
    const accLeg = legs.find((l) => l.accountId === CC.id);
    expect(accLeg?.amount).toBe(-105);
    // liability balance = -SUM(account postings). For an isolated transaction this means +105 (more debt).
  });

  it("transfer asset→asset: source -(amount+fee), dest +amount", () => {
    const legs = computeLegs({ type: "transfer", amount: 100, fee: 10, source: BANK, destination: CASH, categoryId: CATEGORY, feesCategoryId: FEES });
    const src = legs.find((l) => l.accountId === BANK.id);
    const dest = legs.find((l) => l.accountId === CASH.id);
    expect(src?.amount).toBe(-110);
    expect(dest?.amount).toBe(100);
  });

  it("transfer asset→liability (debt down): source -(amount+fee), dest +amount", () => {
    const legs = computeLegs({ type: "transfer", amount: 500, fee: 8, source: BANK, destination: CC, categoryId: CATEGORY, feesCategoryId: FEES });
    const src = legs.find((l) => l.accountId === BANK.id);
    const dest = legs.find((l) => l.accountId === CC.id);
    expect(src?.amount).toBe(-508);
    expect(dest?.amount).toBe(500); // debit on liability → debt goes down by 500
  });

  it("transfer liability→asset: source -(amount+fee), dest +amount", () => {
    const legs = computeLegs({ type: "transfer", amount: 200, fee: 15, source: LOAN, destination: BANK, categoryId: CATEGORY, feesCategoryId: FEES });
    const src = legs.find((l) => l.accountId === LOAN.id);
    const dest = legs.find((l) => l.accountId === BANK.id);
    expect(src?.amount).toBe(-215); // credit on liability → debt up by 215
    expect(dest?.amount).toBe(200);
  });
});

describe("computeLegs — fees", () => {
  it("omits the fees leg when fee is 0", () => {
    const legs = computeLegs({ type: "expense", amount: 100, fee: 0, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES });
    expect(legs.find((l) => l.categoryId === FEES)).toBeUndefined();
    expect(legs).toHaveLength(2);
  });

  it("emits a fees leg with positive amount when fee > 0", () => {
    const legs = computeLegs({ type: "expense", amount: 100, fee: 12.5, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES });
    const feesLeg = legs.find((l) => l.categoryId === FEES);
    expect(feesLeg?.amount).toBe(12.5);
  });
});

describe("computeLegs — guard rails", () => {
  it("throws when transfer has no destination", () => {
    expect(() =>
      computeLegs({ type: "transfer", amount: 50, fee: 0, source: BANK, categoryId: CATEGORY, feesCategoryId: FEES }),
    ).toThrow();
  });
});
