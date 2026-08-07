ALTER TABLE "financial_accounts" ADD COLUMN "secondary_currency" text;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "secondary_balance" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "secondary_credit_limit" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "to_currency" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "amount_received" numeric(12, 2);