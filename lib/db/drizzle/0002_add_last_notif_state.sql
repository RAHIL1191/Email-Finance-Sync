-- Add lastNotifState column to tasks, budgets, and goals tables
-- for server-side idempotent notification tracking (same pattern as bills.last_notif_state)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_notif_state TEXT;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS last_notif_state TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS last_notif_state TEXT;
