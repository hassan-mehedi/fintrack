import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

// ── Auth ───────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    currency: z.enum(CURRENCY_CODES),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ── Financial Account ──────────────────────────────────
export const financialAccountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  type: z.enum(["bank", "mobile_banking", "cash", "credit_card", "loan", "custom"]),
  balance: z.string().refine((val) => !isNaN(Number(val)), "Must be a number"),
  icon: z.string(),
  color: z.string(),
  defaultFeeRate: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Number(val)),
      "Must be a number"
    ),
  creditLimit: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || !isNaN(Number(val)), "Must be a number"),
  isDefault: z.boolean(),
});

// ── Category ───────────────────────────────────────────
export const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  icon: z.string(),
  color: z.string(),
  type: z.enum(["income", "expense", "both"]),
});

// ── Transaction ────────────────────────────────────────
export const transactionSchema = z
  .object({
    accountId: z.string().uuid("Select an account"),
    toAccountId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid("Select a category"),
    amount: z.string().refine((val) => Number(val) > 0, "Amount must be greater than 0"),
    fee: z.string(),
    type: z.enum(["income", "expense", "transfer"]),
    description: z.string(),
    date: z.string().min(1, "Date is required"),
    tags: z.array(z.string()),
  })
  .refine(
    (data) => {
      if (data.type === "transfer") {
        return !!data.toAccountId;
      }
      return true;
    },
    {
      message: "Destination account is required for transfers",
      path: ["toAccountId"],
    }
  );

// ── Budget ─────────────────────────────────────────────
export const budgetSchema = z.object({
  categoryId: z.string().uuid("Select a category"),
  amount: z.string().refine((val) => Number(val) > 0, "Amount must be greater than 0"),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
});

// ── Recurring Transaction ─────────────────────────────
export const recurringTransactionSchema = z.object({
  accountId: z.string().uuid("Select an account"),
  categoryId: z.string().uuid("Select a category"),
  amount: z.string().refine((val) => Number(val) > 0, "Amount must be greater than 0"),
  fee: z.string(),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1, "Description is required"),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
});

// Infer types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>;
