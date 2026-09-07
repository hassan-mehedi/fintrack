import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

// ── Auth ───────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a special character");

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: passwordSchema,
    confirmPassword: z.string(),
    currency: z.enum(CURRENCY_CODES),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const forgotPasswordRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ── Financial Account ──────────────────────────────────
export const financialAccountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  type: z.enum(["bank", "mobile_banking", "cash", "credit_card", "loan", "custom", "fdr", "dps"]),
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
  currency: z.enum(CURRENCY_CODES).optional().nullable(),
  secondaryCurrency: z.enum(CURRENCY_CODES).optional().nullable(),
  secondaryBalance: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || !isNaN(Number(val)), "Must be a number"),
  secondaryCreditLimit: z
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
    currency: z.enum(CURRENCY_CODES).optional().nullable(),
    toCurrency: z.enum(CURRENCY_CODES).optional().nullable(),
    amountReceived: z
      .string()
      .optional()
      .nullable()
      .refine((val) => !val || Number(val) > 0, "Must be greater than 0"),
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
  tags: z.array(z.string()).default([]),
  // null or undefined means no reminder email
  reminderDays: z.number().int().min(0).max(30).optional().nullable(),
});

// ── Transaction splits ─────────────────────────────────
export const transactionSplitSchema = z.object({
  categoryId: z.string().uuid("Select a category"),
  amount: z.string().refine((val) => Number(val) > 0, "Amount must be greater than 0"),
  note: z.string().max(200).default(""),
});

// The split amounts must add up to the parent transaction amount; core checks that.
export const transactionSplitsSchema = z.object({
  splits: z.array(transactionSplitSchema).max(20),
});

// ── Savings goal ───────────────────────────────────────
export const savingsGoalSchema = z.object({
  name: z.string().min(1, "Goal name is required").max(80),
  icon: z.string(),
  color: z.string(),
  targetAmount: z.string().refine((val) => Number(val) > 0, "Target must be greater than 0"),
  accountId: z.string().uuid().optional().nullable(),
  savedAmount: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || Number(val) >= 0, "Must be zero or more"),
  deadline: z.string().optional().nullable(),
});

export const goalContributionSchema = z.object({
  amount: z.string().refine((val) => Number(val) !== 0, "Amount must not be zero"),
});

// ── CSV import ─────────────────────────────────────────
export const importTransactionRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.string().refine((val) => Number(val) > 0, "Amount must be greater than 0"),
  type: z.enum(["income", "expense"]),
  description: z.string().max(500).default(""),
  // matched by name against the user's categories; created when missing
  categoryName: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const importTransactionsSchema = z.object({
  accountId: z.string().uuid("Select an account"),
  rows: z.array(importTransactionRowSchema).min(1).max(2000),
  // when true, a row whose date, amount, type and description already exist is skipped
  skipDuplicates: z.boolean().default(true),
});

// Infer types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>;
export type TransactionSplitInput = z.infer<typeof transactionSplitSchema>;
export type TransactionSplitsInput = z.infer<typeof transactionSplitsSchema>;
export type SavingsGoalInput = z.infer<typeof savingsGoalSchema>;
export type GoalContributionInput = z.infer<typeof goalContributionSchema>;
export type ImportTransactionRow = z.infer<typeof importTransactionRowSchema>;
export type ImportTransactionsInput = z.infer<typeof importTransactionsSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
