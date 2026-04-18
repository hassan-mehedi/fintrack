import { describe, it, expect } from "vitest";
import {
  getAccountClassification,
  isLiabilityAccount,
  getBalanceDelta,
  getTransferDeltas,
} from "@/lib/accounts";

describe("getAccountClassification", () => {
  it("classifies bank as asset", () => {
    expect(getAccountClassification("bank")).toBe("asset");
  });
  it("classifies mobile_banking as asset", () => {
    expect(getAccountClassification("mobile_banking")).toBe("asset");
  });
  it("classifies cash as asset", () => {
    expect(getAccountClassification("cash")).toBe("asset");
  });
  it("classifies custom as asset", () => {
    expect(getAccountClassification("custom")).toBe("asset");
  });
  it("classifies credit_card as liability", () => {
    expect(getAccountClassification("credit_card")).toBe("liability");
  });
  it("classifies loan as liability", () => {
    expect(getAccountClassification("loan")).toBe("liability");
  });
  it("defaults unknown type to asset", () => {
    expect(getAccountClassification("unknown")).toBe("asset");
  });
});

describe("isLiabilityAccount", () => {
  it("returns true for credit_card", () => {
    expect(isLiabilityAccount("credit_card")).toBe(true);
  });
  it("returns false for bank", () => {
    expect(isLiabilityAccount("bank")).toBe(false);
  });
});

describe("getBalanceDelta — asset account", () => {
  it("income adds amount minus fee", () => {
    expect(getBalanceDelta("bank", "income", 100, 5)).toBe(95);
  });
  it("expense subtracts amount plus fee", () => {
    expect(getBalanceDelta("bank", "expense", 100, 5)).toBe(-105);
  });
  it("zero fee: income adds full amount", () => {
    expect(getBalanceDelta("cash", "income", 200, 0)).toBe(200);
  });
  it("zero fee: expense subtracts full amount", () => {
    expect(getBalanceDelta("cash", "expense", 200, 0)).toBe(-200);
  });
});

describe("getBalanceDelta — liability account", () => {
  it("expense increases debt (positive delta)", () => {
    expect(getBalanceDelta("credit_card", "expense", 100, 5)).toBe(105);
  });
  it("income (payment) reduces debt (negative delta)", () => {
    expect(getBalanceDelta("credit_card", "income", 100, 5)).toBe(-95);
  });
});

describe("getTransferDeltas", () => {
  it("asset -> asset: source loses amount+fee, dest gains amount", () => {
    const { sourceDelta, destDelta } = getTransferDeltas("bank", "cash", 100, 10);
    expect(sourceDelta).toBe(-110);
    expect(destDelta).toBe(100);
  });

  it("asset -> liability (paying off debt): source loses amount+fee, debt decreases", () => {
    const { sourceDelta, destDelta } = getTransferDeltas("bank", "credit_card", 100, 0);
    expect(sourceDelta).toBe(-100);
    expect(destDelta).toBe(-100);
  });

  it("liability -> asset (borrowing): debt increases, asset gains amount", () => {
    const { sourceDelta, destDelta } = getTransferDeltas("loan", "bank", 500, 10);
    expect(sourceDelta).toBe(510);
    expect(destDelta).toBe(500);
  });

  it("liability -> liability (debt transfer): source debt decreases, dest debt increases", () => {
    const { sourceDelta, destDelta } = getTransferDeltas("loan", "credit_card", 200, 5);
    expect(sourceDelta).toBe(-205);
    expect(destDelta).toBe(200);
  });
});
