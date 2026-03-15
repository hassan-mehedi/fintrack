import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  boolean,
  integer,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

// Enums
export const accountTypeEnum = pgEnum("account_type", [
  "bank",
  "mobile_banking",
  "cash",
  "credit_card",
  "loan",
  "custom",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const categoryTypeEnum = pgEnum("category_type", [
  "income",
  "expense",
  "both",
]);

export const frequencyEnum = pgEnum("frequency", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const userPlanEnum = pgEnum("user_plan", ["free", "pro"]);

export const subscriptionRequestStatusEnum = pgEnum(
  "subscription_request_status",
  ["pending", "approved", "rejected"]
);

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  hashedPassword: text("hashed_password").notNull(),
  image: text("image"),
  plan: userPlanEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ── Subscription Requests ─────────────────────────────
export const subscriptionRequests = pgTable("subscription_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: subscriptionRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
}, (table) => [
  index("subscription_requests_user_status_idx").on(table.userId, table.status),
]);

// ── NextAuth Accounts (OAuth providers) ────────────────
export const authAccounts = pgTable("auth_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => [
  index("auth_accounts_user_id_idx").on(table.userId),
]);

// ── Sessions ───────────────────────────────────────────
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
]);

// ── Verification Tokens ────────────────────────────────
export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ── Financial Accounts ─────────────────────────────────
export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  icon: text("icon").notNull().default("💰"),
  color: text("color").notNull().default("#10b981"),
  defaultFeeRate: decimal("default_fee_rate", { precision: 5, scale: 2 }),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("financial_accounts_user_id_idx").on(table.userId),
]);

// ── Categories ─────────────────────────────────────────
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📁"),
  color: text("color").notNull().default("#6b7280"),
  type: categoryTypeEnum("type").notNull().default("expense"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("categories_user_id_idx").on(table.userId),
]);

// ── Transactions ───────────────────────────────────────
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => financialAccounts.id, { onDelete: "cascade" }),
  toAccountId: uuid("to_account_id").references(() => financialAccounts.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 12, scale: 2 }).notNull().default("0"),
  type: transactionTypeEnum("type").notNull(),
  description: text("description").notNull().default(""),
  date: date("date", { mode: "string" }).notNull(),
  tags: text("tags")
    .array()
    .notNull()
    .default([]),
  recurringId: uuid("recurring_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("transactions_user_date_idx").on(table.userId, table.date.desc()),
  index("transactions_user_type_date_idx").on(table.userId, table.type, table.date),
  index("transactions_user_category_type_date_idx").on(table.userId, table.categoryId, table.type, table.date),
  index("transactions_account_id_idx").on(table.accountId),
  index("transactions_category_id_idx").on(table.categoryId),
]);

// ── Budgets ────────────────────────────────────────────
export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("budgets_user_month_year_idx").on(table.userId, table.month, table.year),
  index("budgets_category_id_idx").on(table.categoryId),
]);

// ── Recurring Transactions (Phase 2) ───────────────────
export const recurringTransactions = pgTable("recurring_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => financialAccounts.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 12, scale: 2 }).notNull().default("0"),
  type: transactionTypeEnum("type").notNull(),
  description: text("description").notNull().default(""),
  frequency: frequencyEnum("frequency").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  isActive: boolean("is_active").notNull().default(true),
  lastProcessed: date("last_processed", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("recurring_transactions_user_active_idx").on(table.userId, table.isActive),
  index("recurring_transactions_account_id_idx").on(table.accountId),
  index("recurring_transactions_category_id_idx").on(table.categoryId),
]);

