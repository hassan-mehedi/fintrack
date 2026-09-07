import type {
  users,
  financialAccounts,
  categories,
  transactions,
  budgets,
  recurringTransactions,
  transactionSplits,
  savingsGoals,
} from "@fintrack/db/schema";

// Infer types from Drizzle schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type NewFinancialAccount = typeof financialAccounts.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;

export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type NewTransactionSplit = typeof transactionSplits.$inferInsert;

export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NewSavingsGoal = typeof savingsGoals.$inferInsert;

export type TransactionSplitWithCategory = TransactionSplit & {
  category: Pick<Category, "id" | "name" | "icon" | "color">;
};

export type SavingsGoalWithProgress = SavingsGoal & {
  // current progress in the user's base currency
  current: number;
  percent: number;
  remaining: number;
  accountName: string | null;
};

// Extended types with relations
export type TransactionWithCategory = Transaction & {
  category: Category;
  account: FinancialAccount;
  toAccount?: FinancialAccount | null;
  splits?: TransactionSplitWithCategory[];
};

export type BudgetWithCategory = Budget & {
  category: Category;
  spent: number;
};

// Account type labels
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  mobile_banking: "Mobile Banking",
  cash: "Cash",
  credit_card: "Credit Card",
  loan: "Loan",
  custom: "Custom",
  fdr: "FDR (Fixed Deposit)",
  dps: "DPS (Deposit Scheme)",
};

// Account classification
export type AccountClassification = "asset" | "liability";

export const ACCOUNT_CLASSIFICATION: Record<string, AccountClassification> = {
  bank: "asset",
  mobile_banking: "asset",
  cash: "asset",
  credit_card: "liability",
  loan: "liability",
  custom: "asset",
  fdr: "asset",
  dps: "asset",
};

export const LIABILITY_ACCOUNT_TYPES = ["credit_card", "loan"] as const;

export const SAVINGS_ACCOUNT_TYPES = ["fdr", "dps"] as const;

// Money the user can actually spend right now
export const LIQUID_ACCOUNT_TYPES = ["bank", "mobile_banking", "cash"] as const;

// Transaction type labels
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

// Frequency labels
export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

// Extended type for recurring with category/account names
export type RecurringTransactionWithDetails = RecurringTransaction & {
  categoryName: string;
  categoryIcon: string;
  accountName: string;
};
