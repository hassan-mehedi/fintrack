CREATE TYPE "public"."account_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('receipt', 'statement', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."entity_change_action" AS ENUM('create', 'update', 'delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."inbound_rule_match" AS ENUM('email_sender', 'sms_sender', 'subject_regex', 'body_regex');--> statement-breakpoint
CREATE TYPE "public"."inbound_source" AS ENUM('email', 'sms', 'statement_pdf');--> statement-breakpoint
CREATE TYPE "public"."inbound_status" AS ENUM('received', 'parsed', 'needs_review', 'applied', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('duplicate', 'outlier', 'subscription_creep', 'cashflow_warning', 'weekly_digest', 'savings_tip', 'large_share', 'recurring_drift');--> statement-breakpoint
CREATE TYPE "public"."insight_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery" AS ENUM('pending', 'delivered', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('inbound_parsed', 'inbound_needs_review', 'budget_exceeded', 'budget_warning', 'transaction_large', 'bill_due', 'bill_overdue', 'balance_low', 'weekly_digest');--> statement-breakpoint
CREATE TYPE "public"."ocr_provider" AS ENUM('veryfi', 'tesseract', 'none');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('pending', 'running', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'import', 'recurring', 'ai', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'cleared', 'reconciled', 'void');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "attachment_kind" DEFAULT 'receipt' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"ocr_text" text,
	"ocr_data" jsonb,
	"ocr_status" "ocr_status" DEFAULT 'pending' NOT NULL,
	"ocr_provider" "ocr_provider" DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "entity_change_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"ip_address" text,
	"user_agent" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text DEFAULT 'frankfurter' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp,
	CONSTRAINT "inbound_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "inbound_source" NOT NULL,
	"status" "inbound_status" DEFAULT 'received' NOT NULL,
	"from_address" text,
	"subject" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"raw_body" text NOT NULL,
	"raw_bytes" integer DEFAULT 0 NOT NULL,
	"storage_key" text,
	"parsed" jsonb,
	"template_id" text,
	"confidence" numeric(4, 3),
	"external_id" text,
	"transaction_id" uuid,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"match_type" "inbound_rule_match" NOT NULL,
	"match_value" text NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"severity" "insight_severity" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"dedupe_key" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized" text NOT NULL,
	"default_category_id" uuid,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"notify_inbound_parsed" boolean DEFAULT true NOT NULL,
	"notify_inbound_needs_review" boolean DEFAULT true NOT NULL,
	"notify_budget_exceeded" boolean DEFAULT true NOT NULL,
	"notify_budget_warning" boolean DEFAULT false NOT NULL,
	"budget_warning_percent" integer DEFAULT 80 NOT NULL,
	"notify_large_transaction" boolean DEFAULT true NOT NULL,
	"large_transaction_threshold" numeric(19, 4),
	"notify_bill_due_soon" boolean DEFAULT true NOT NULL,
	"bill_reminder_days_before" integer DEFAULT 3 NOT NULL,
	"notify_low_balance" boolean DEFAULT false NOT NULL,
	"low_balance_threshold" numeric(19, 4),
	"weekly_digest" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"delivery_status" "notification_delivery" DEFAULT 'pending' NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"amount" numeric(19, 4) NOT NULL,
	"currency" text NOT NULL,
	"base_amount" numeric(19, 4) NOT NULL,
	"base_currency" text NOT NULL,
	"fx_rate" numeric(18, 8),
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"amount" numeric(19, 4),
	"fee" numeric(19, 4) DEFAULT '0' NOT NULL,
	"type" "transaction_type" DEFAULT 'expense' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_secrets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_secret" text NOT NULL,
	"enabled_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"jti" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_to_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "amount" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "financial_accounts" ALTER COLUMN "balance" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "financial_accounts" ALTER COLUMN "balance" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "financial_accounts" ALTER COLUMN "credit_limit" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "amount" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "fee" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "fee" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "fee" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "fee" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" "transaction_status" DEFAULT 'cleared' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" "transaction_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_reimbursable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reimbursed_at" timestamp;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reimbursed_by_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_changes" ADD CONSTRAINT "entity_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_aliases" ADD CONSTRAINT "inbound_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_rules" ADD CONSTRAINT "inbound_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_rules" ADD CONSTRAINT "inbound_rules_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_rules" ADD CONSTRAINT "inbound_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_tokens" ADD CONSTRAINT "inbound_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_secrets" ADD CONSTRAINT "two_factor_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_user_sha_idx" ON "attachments" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "attachments_user_provider_created_idx" ON "attachments" USING btree ("user_id","ocr_provider","created_at");--> statement-breakpoint
CREATE INDEX "entity_changes_user_idx" ON "entity_changes" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entity_changes_entity_idx" ON "entity_changes" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_pk" ON "fx_rates" USING btree ("date","base","quote");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_aliases_user_active_idx" ON "inbound_aliases" USING btree ("user_id") WHERE "inbound_aliases"."is_active";--> statement-breakpoint
CREATE INDEX "inbound_user_status_idx" ON "inbound_messages" USING btree ("user_id","status","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_user_external_idx" ON "inbound_messages" USING btree ("user_id","external_id") WHERE "inbound_messages"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inbound_rules_user_idx" ON "inbound_rules" USING btree ("user_id","priority" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_tokens_hash_idx" ON "inbound_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "inbound_tokens_user_idx" ON "inbound_tokens" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "insights_user_undismissed_idx" ON "insights" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "insights"."dismissed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "insights_user_dedupe_idx" ON "insights" USING btree ("user_id","dedupe_key") WHERE "insights"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_user_norm_idx" ON "merchants" USING btree ("user_id","normalized");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "postings_account_date_idx" ON "postings" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "postings_category_date_idx" ON "postings" USING btree ("category_id","date");--> statement-breakpoint
CREATE INDEX "postings_txn_idx" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_user_date_idx" ON "postings" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_templates_user_idx" ON "transaction_templates" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","last_seen_at" DESC NULLS LAST) WHERE "user_sessions"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_financial_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_system_key_idx" ON "categories" USING btree ("user_id","system_key") WHERE "categories"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "financial_accounts_user_status_idx" ON "financial_accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "transactions_parent_idx" ON "transactions" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "transactions_user_status_idx" ON "transactions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "transactions_user_deleted_idx" ON "transactions" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idem_idx" ON "transactions" USING btree ("user_id","idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_idx" ON "transactions" USING btree ("user_id","external_id") WHERE "transactions"."external_id" IS NOT NULL;