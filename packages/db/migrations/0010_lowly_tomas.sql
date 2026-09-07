CREATE TABLE "recurring_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '🎯' NOT NULL,
	"color" text DEFAULT '#10b981' NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"account_id" uuid,
	"saved_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deadline" date,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "reminder_days" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_key" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_name" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_mime" text;--> statement-breakpoint
ALTER TABLE "recurring_reminders" ADD CONSTRAINT "recurring_reminders_recurring_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_reminders_rule_due_idx" ON "recurring_reminders" USING btree ("recurring_id","due_date");--> statement-breakpoint
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_goals_account_id_idx" ON "savings_goals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_transaction_id_idx" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_category_id_idx" ON "transaction_splits" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_to_account_id_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "transactions_recurring_id_idx" ON "transactions" USING btree ("recurring_id");--> statement-breakpoint
CREATE INDEX "transactions_tags_gin_idx" ON "transactions" USING gin ("tags");