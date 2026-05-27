-- Add plaid_transaction_id column to transactions table for robust Plaid dedup
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "plaid_transaction_id" text;
--> statement-breakpoint
-- Partial unique index: prevents duplicate Plaid transactions at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS "idx_transactions_plaid_tx_id"
  ON "transactions" ("plaid_transaction_id")
  WHERE plaid_transaction_id IS NOT NULL;
