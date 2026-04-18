import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  financialAccountSchema,
  categorySchema,
  transactionSchema,
  budgetSchema,
  recurringTransactionSchema,
} from "@/lib/validators";

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const base = {
    name: "Alice",
    email: "alice@example.com",
    password: "Passw0rd!",
    confirmPassword: "Passw0rd!",
    currency: "BDT" as const,
  };

  it("accepts valid registration data", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it("rejects name shorter than 2 chars", () => {
    expect(registerSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    expect(registerSchema.safeParse({ ...base, password: "Ab1!", confirmPassword: "Ab1!" }).success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(registerSchema.safeParse({ ...base, password: "passw0rd!", confirmPassword: "passw0rd!" }).success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(registerSchema.safeParse({ ...base, password: "PASSW0RD!", confirmPassword: "PASSW0RD!" }).success).toBe(false);
  });

  it("rejects password without number", () => {
    expect(registerSchema.safeParse({ ...base, password: "Password!", confirmPassword: "Password!" }).success).toBe(false);
  });

  it("rejects password without special character", () => {
    expect(registerSchema.safeParse({ ...base, password: "Passw0rd1", confirmPassword: "Passw0rd1" }).success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    expect(registerSchema.safeParse({ ...base, confirmPassword: "Different1!" }).success).toBe(false);
  });

  it("rejects unsupported currency", () => {
    expect(registerSchema.safeParse({ ...base, currency: "XYZ" }).success).toBe(false);
  });
});

describe("financialAccountSchema", () => {
  const base = {
    name: "My Bank",
    type: "bank" as const,
    balance: "1000",
    icon: "🏦",
    color: "#10b981",
    isDefault: false,
  };

  it("accepts valid account", () => {
    expect(financialAccountSchema.safeParse(base).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(financialAccountSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rejects non-numeric balance", () => {
    expect(financialAccountSchema.safeParse({ ...base, balance: "abc" }).success).toBe(false);
  });

  it("rejects invalid account type", () => {
    expect(financialAccountSchema.safeParse({ ...base, type: "savings" }).success).toBe(false);
  });
});

describe("transactionSchema", () => {
  const base = {
    accountId: "00000000-0000-4000-8000-000000000001",
    categoryId: "00000000-0000-4000-8000-000000000002",
    amount: "100",
    fee: "0",
    type: "expense" as const,
    description: "Coffee",
    date: "2026-04-19",
    tags: [],
  };

  it("accepts valid expense", () => {
    expect(transactionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero amount", () => {
    expect(transactionSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });

  it("rejects transfer without toAccountId", () => {
    expect(transactionSchema.safeParse({ ...base, type: "transfer" }).success).toBe(false);
  });

  it("accepts transfer with toAccountId", () => {
    expect(
      transactionSchema.safeParse({
        ...base,
        type: "transfer",
        toAccountId: "00000000-0000-4000-8000-000000000003",
      }).success
    ).toBe(true);
  });
});

describe("budgetSchema", () => {
  it("accepts valid budget", () => {
    expect(budgetSchema.safeParse({ categoryId: "00000000-0000-4000-8000-000000000001", amount: "500", month: 4, year: 2026 }).success).toBe(true);
  });

  it("rejects month 0", () => {
    expect(budgetSchema.safeParse({ categoryId: "00000000-0000-4000-8000-000000000001", amount: "500", month: 0, year: 2026 }).success).toBe(false);
  });

  it("rejects month 13", () => {
    expect(budgetSchema.safeParse({ categoryId: "00000000-0000-4000-8000-000000000001", amount: "500", month: 13, year: 2026 }).success).toBe(false);
  });
});
