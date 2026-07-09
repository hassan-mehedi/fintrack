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
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money precision: (19,4) covers JPY/IDR, FX conversions, and high-value rows
// without truncation. Existing columns are widened in the Phase-1 migration.
const MONEY = { precision: 19, scale: 4 } as const;
const FX_RATE = { precision: 18, scale: 8 } as const;

// Enums
export const accountTypeEnum = pgEnum("account_type", [
  "bank",
  "mobile_banking",
  "cash",
  "credit_card",
  "loan",
  "custom",
]);

export const accountStatusEnum = pgEnum("account_status", ["active", "archived"]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "cleared",
  "reconciled",
  "void",
]);

export const transactionSourceEnum = pgEnum("transaction_source", [
  "manual",
  "import",
  "recurring",
  "ai",
  "inbound",
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

export const entityChangeActionEnum = pgEnum("entity_change_action", [
  "create",
  "update",
  "delete",
  "restore",
]);

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  hashedPassword: text("hashed_password").notNull(),
  image: text("image"),
  plan: userPlanEnum("plan").notNull().default("free"),
  // Base reporting currency for cross-account aggregation. Account-level
  // currency lives on `financialAccounts.currency`.
  currency: text("currency").notNull().default("BDT"),
  sessionVersion: integer("session_version").notNull().default(0),
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

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("password_reset_tokens_token_hash_idx").on(table.tokenHash),
  index("password_reset_tokens_user_id_idx").on(table.userId),
  index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
]);

// ── Financial Accounts ─────────────────────────────────
// `balance` is a denormalized cache maintained by the ledger writer. Sign
// convention is "natural": positive for assets means wealth; positive for
// liabilities means outstanding debt. Authoritative truth lives in `postings`.
export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  currency: text("currency").notNull().default("BDT"),
  balance: decimal("balance", MONEY).notNull().default("0"),
  icon: text("icon").notNull().default("💰"),
  color: text("color").notNull().default("#10b981"),
  defaultFeeRate: decimal("default_fee_rate", { precision: 5, scale: 2 }),
  creditLimit: decimal("credit_limit", MONEY),
  isDefault: boolean("is_default").notNull().default(false),
  status: accountStatusEnum("status").notNull().default("active"),
  archivedAt: timestamp("archived_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("financial_accounts_user_id_idx").on(table.userId),
  index("financial_accounts_user_status_idx").on(table.userId, table.status),
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
  // System categories (e.g. "__fees__", "__split__") are auto-managed by the ledger.
  systemKey: text("system_key"),
  // Self-reference for nesting. Self-cycles are prevented in application code.
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("categories_user_id_idx").on(table.userId),
  index("categories_parent_idx").on(table.parentId),
  uniqueIndex("categories_user_system_key_idx")
    .on(table.userId, table.systemKey)
    .where(sql`${table.systemKey} IS NOT NULL`),
]);

// ── Merchants ──────────────────────────────────────────
export const merchants = pgTable("merchants", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Lowercase, whitespace-collapsed, punctuation-stripped name for dedupe & matching.
  normalized: text("normalized").notNull(),
  defaultCategoryId: uuid("default_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("merchants_user_norm_idx").on(table.userId, table.normalized),
]);

// ── Transactions ───────────────────────────────────────
// The transaction row carries user-facing metadata. The monetary effect lives
// in `postings` (double-entry). `accountId` / `toAccountId` / `categoryId`
// remain for query convenience but the ledger is the source of truth.
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => financialAccounts.id, { onDelete: "restrict" }),
  toAccountId: uuid("to_account_id").references(() => financialAccounts.id, {
    onDelete: "restrict",
  }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  merchantId: uuid("merchant_id").references(() => merchants.id, {
    onDelete: "set null",
  }),
  amount: decimal("amount", MONEY).notNull(),
  fee: decimal("fee", MONEY).notNull().default("0"),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("cleared"),
  source: transactionSourceEnum("source").notNull().default("manual"),
  description: text("description").notNull().default(""),
  date: date("date", { mode: "string" }).notNull(),
  tags: text("tags").array().notNull().default([]),
  recurringId: uuid("recurring_id"),
  parentId: uuid("parent_id"),
  externalId: text("external_id"),
  importBatchId: uuid("import_batch_id"),
  idempotencyKey: text("idempotency_key"),
  isReimbursable: boolean("is_reimbursable").notNull().default(false),
  reimbursedAt: timestamp("reimbursed_at", { mode: "date" }),
  reimbursedByTransactionId: uuid("reimbursed_by_transaction_id"),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("transactions_user_date_idx").on(table.userId, table.date.desc()),
  index("transactions_user_type_date_idx").on(table.userId, table.type, table.date),
  index("transactions_user_category_type_date_idx").on(table.userId, table.categoryId, table.type, table.date),
  index("transactions_account_id_idx").on(table.accountId),
  index("transactions_category_id_idx").on(table.categoryId),
  index("transactions_parent_idx").on(table.parentId),
  index("transactions_user_status_idx").on(table.userId, table.status),
  index("transactions_user_deleted_idx").on(table.userId, table.deletedAt),
  uniqueIndex("transactions_idem_idx")
    .on(table.userId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  uniqueIndex("transactions_external_idx")
    .on(table.userId, table.externalId)
    .where(sql`${table.externalId} IS NOT NULL`),
]);

// ── Postings (double-entry ledger) ─────────────────────
// Sign convention: amounts sum to zero in base currency per transaction.
//   asset debit  = +amount    (account got money)
//   asset credit = -amount    (account lost money)
//   liability debit  = +amount  (debt decreased)
//   liability credit = -amount  (debt increased)
//   expense (category leg) = +amount
//   income  (category leg) = -amount
// Exactly one of accountId / categoryId is non-null on each row.
export const postings = pgTable("postings", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => financialAccounts.id, {
    onDelete: "restrict",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "restrict",
  }),
  amount: decimal("amount", MONEY).notNull(),
  currency: text("currency").notNull(),
  baseAmount: decimal("base_amount", MONEY).notNull(),
  baseCurrency: text("base_currency").notNull(),
  fxRate: decimal("fx_rate", FX_RATE),
  date: date("date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("postings_account_date_idx").on(table.accountId, table.date),
  index("postings_category_date_idx").on(table.categoryId, table.date),
  index("postings_txn_idx").on(table.transactionId),
  index("postings_user_date_idx").on(table.userId, table.date),
]);

// ── FX Rates ───────────────────────────────────────────
// Daily snapshots fetched from Frankfurter (ECB). Stored as quote per 1 base.
export const fxRates = pgTable("fx_rates", {
  date: date("date", { mode: "string" }).notNull(),
  base: text("base").notNull(),
  quote: text("quote").notNull(),
  rate: decimal("rate", FX_RATE).notNull(),
  source: text("source").notNull().default("frankfurter"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("fx_rates_pk").on(table.date, table.base, table.quote),
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
  amount: decimal("amount", MONEY).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("budgets_user_month_year_idx").on(table.userId, table.month, table.year),
  index("budgets_category_id_idx").on(table.categoryId),
]);

// ── Recurring Transactions ─────────────────────────────
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
  amount: decimal("amount", MONEY).notNull(),
  fee: decimal("fee", MONEY).notNull().default("0"),
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

// ── Audit Logs (auth events) ───────────────────────────
export const auditActionEnum = pgEnum("audit_action", [
  "login_success",
  "login_failed",
  "logout",
  "register",
  "password_reset_requested",
  "password_reset_completed",
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: auditActionEnum("action").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("audit_logs_user_id_idx").on(table.userId),
  index("audit_logs_created_at_idx").on(table.createdAt.desc()),
]);

// ── Transaction templates (Quick-add presets) ──────────
export const transactionTemplates = pgTable("transaction_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  accountId: uuid("account_id").references(() => financialAccounts.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  amount: decimal("amount", MONEY),
  fee: decimal("fee", MONEY).notNull().default("0"),
  type: transactionTypeEnum("type").notNull().default("expense"),
  description: text("description").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("transaction_templates_user_idx").on(table.userId, table.sortOrder),
]);

// ── Two-factor authentication ──────────────────────────
export const twoFactorSecrets = pgTable("two_factor_secrets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // The TOTP shared secret, encrypted with FIELD_ENC_KEY (AES-256-GCM).
  // Stored as base64(iv || ciphertext || authTag).
  encryptedSecret: text("encrypted_secret").notNull(),
  enabledAt: timestamp("enabled_at", { mode: "date" }),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("recovery_codes_user_idx").on(table.userId),
]);

// ── Tracked JWT sessions (for the session-management UI) ───────────────
// NextAuth uses stateless JWTs, so we don't get a per-session row for free.
// We insert one here on initial sign-in via the jwt() callback, keyed by the
// JWT's jti. Revoking a session sets revokedAt AND adds the jti to the
// existing token-revocation list (Redis or in-memory).
export const userSessions = pgTable("user_sessions", {
  jti: text("jti").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
}, (table) => [
  index("user_sessions_user_active_idx")
    .on(table.userId, table.lastSeenAt.desc())
    .where(sql`${table.revokedAt} IS NULL`),
]);

// ── Insights ───────────────────────────────────────────
export const insightKindEnum = pgEnum("insight_kind", [
  "duplicate",
  "outlier",
  "subscription_creep",
  "cashflow_warning",
  "weekly_digest",
  "savings_tip",
  "large_share",
  "recurring_drift",
]);

export const insightSeverityEnum = pgEnum("insight_severity", [
  "info",
  "warning",
  "critical",
]);

export const insights = pgTable("insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: insightKindEnum("kind").notNull(),
  severity: insightSeverityEnum("severity").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  payload: jsonb("payload"),
  // Stable key for dedupe — same anomaly fired twice in a day should resolve
  // to the same row instead of creating two.
  dedupeKey: text("dedupe_key"),
  dismissedAt: timestamp("dismissed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("insights_user_undismissed_idx")
    .on(table.userId, table.createdAt.desc())
    .where(sql`${table.dismissedAt} IS NULL`),
  uniqueIndex("insights_user_dedupe_idx")
    .on(table.userId, table.dedupeKey)
    .where(sql`${table.dedupeKey} IS NOT NULL`),
]);

// ── Notifications ──────────────────────────────────────
export const notificationKindEnum = pgEnum("notification_kind", [
  "inbound_parsed",
  "inbound_needs_review",
  "budget_exceeded",
  "budget_warning",
  "transaction_large",
  "bill_due",
  "bill_overdue",
  "balance_low",
  "weekly_digest",
]);

export const notificationDeliveryEnum = pgEnum("notification_delivery", [
  "pending",
  "delivered",
  "failed",
  "skipped",
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
}, (table) => [
  index("push_subscriptions_user_idx").on(table.userId),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: notificationKindEnum("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  payload: jsonb("payload"),
  deliveryStatus: notificationDeliveryEnum("delivery_status").notNull().default("pending"),
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("notifications_user_unread_idx")
    .on(table.userId, table.createdAt.desc())
    .where(sql`${table.readAt} IS NULL`),
  index("notifications_user_created_idx").on(table.userId, table.createdAt.desc()),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  notifyInboundParsed: boolean("notify_inbound_parsed").notNull().default(true),
  notifyInboundNeedsReview: boolean("notify_inbound_needs_review").notNull().default(true),
  notifyBudgetExceeded: boolean("notify_budget_exceeded").notNull().default(true),
  notifyBudgetWarning: boolean("notify_budget_warning").notNull().default(false),
  budgetWarningPercent: integer("budget_warning_percent").notNull().default(80),
  notifyLargeTransaction: boolean("notify_large_transaction").notNull().default(true),
  largeTransactionThreshold: decimal("large_transaction_threshold", MONEY),
  notifyBillDueSoon: boolean("notify_bill_due_soon").notNull().default(true),
  billReminderDaysBefore: integer("bill_reminder_days_before").notNull().default(3),
  notifyLowBalance: boolean("notify_low_balance").notNull().default(false),
  lowBalanceThreshold: decimal("low_balance_threshold", MONEY),
  weeklyDigest: boolean("weekly_digest").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ── Inbound parsing (email / SMS / statement PDF) ──────
export const inboundSourceEnum = pgEnum("inbound_source", [
  "email",
  "sms",
  "statement_pdf",
]);

export const inboundStatusEnum = pgEnum("inbound_status", [
  "received",
  "parsed",
  "needs_review",
  "applied",
  "ignored",
  "failed",
]);

export const inboundMessages = pgTable("inbound_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: inboundSourceEnum("source").notNull(),
  status: inboundStatusEnum("status").notNull().default("received"),
  fromAddress: text("from_address"),
  subject: text("subject"),
  receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
  rawBody: text("raw_body").notNull(),
  rawBytes: integer("raw_bytes").notNull().default(0),
  storageKey: text("storage_key"),
  parsed: jsonb("parsed"),
  templateId: text("template_id"),
  confidence: decimal("confidence", { precision: 4, scale: 3 }),
  externalId: text("external_id"),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("inbound_user_status_idx").on(table.userId, table.status, table.receivedAt.desc()),
  uniqueIndex("inbound_user_external_idx")
    .on(table.userId, table.externalId)
    .where(sql`${table.externalId} IS NOT NULL`),
]);

export const inboundAliases = pgTable("inbound_aliases", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  alias: text("alias").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  rotatedAt: timestamp("rotated_at", { mode: "date" }),
}, (table) => [
  uniqueIndex("inbound_aliases_user_active_idx")
    .on(table.userId)
    .where(sql`${table.isActive}`),
]);

export const inboundTokens = pgTable("inbound_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull(),
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("inbound_tokens_hash_idx").on(table.tokenHash),
  index("inbound_tokens_user_idx").on(table.userId, table.createdAt.desc()),
]);

export const inboundRuleMatchEnum = pgEnum("inbound_rule_match", [
  "email_sender",
  "sms_sender",
  "subject_regex",
  "body_regex",
]);

export const inboundRules = pgTable("inbound_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  matchType: inboundRuleMatchEnum("match_type").notNull(),
  matchValue: text("match_value").notNull(),
  accountId: uuid("account_id").references(() => financialAccounts.id, {
    onDelete: "cascade",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  autoApply: boolean("auto_apply").notNull().default(false),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("inbound_rules_user_idx").on(table.userId, table.priority.desc()),
]);

// ── Attachments (receipts, statements, notes) ──────────
export const attachmentKindEnum = pgEnum("attachment_kind", [
  "receipt",
  "statement",
  "note",
  "other",
]);

export const ocrStatusEnum = pgEnum("ocr_status", [
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
]);

export const ocrProviderEnum = pgEnum("ocr_provider", [
  "veryfi",
  "tesseract",
  "none",
]);

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ownerType: text("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  kind: attachmentKindEnum("kind").notNull().default("receipt"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  ocrText: text("ocr_text"),
  ocrData: jsonb("ocr_data"),
  ocrStatus: ocrStatusEnum("ocr_status").notNull().default("pending"),
  ocrProvider: ocrProviderEnum("ocr_provider").notNull().default("none"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("attachments_owner_idx").on(table.ownerType, table.ownerId),
  uniqueIndex("attachments_user_sha_idx").on(table.userId, table.sha256),
  index("attachments_user_provider_created_idx").on(
    table.userId,
    table.ocrProvider,
    table.createdAt,
  ),
]);

// ── Entity Changes (financial audit log) ───────────────
// Append-only diff history for transactions/accounts/categories/budgets/etc.
export const entityChanges = pgTable("entity_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: entityChangeActionEnum("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  diff: jsonb("diff"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  source: text("source"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("entity_changes_user_idx").on(table.userId, table.createdAt.desc()),
  index("entity_changes_entity_idx").on(table.entity, table.entityId),
]);
