-- Add split_group_id and is_user_edited columns to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "split_group_id" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_user_edited" boolean DEFAULT false;
--> statement-breakpoint
-- Add error column to plaid_items
ALTER TABLE "plaid_items" ADD COLUMN IF NOT EXISTS "error" text;
