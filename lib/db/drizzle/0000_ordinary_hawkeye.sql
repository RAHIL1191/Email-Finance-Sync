CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"bank" text NOT NULL,
	"balance" real DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"color" text NOT NULL,
	"last_four" text,
	"plaid_account_id" text,
	"plaid_item_id" text,
	"account_holder" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"date" text NOT NULL,
	"source" text,
	"merchant" text,
	"plaid_item_id" text,
	"plaid_account_id" text,
	"from_email" boolean DEFAULT false,
	"bank" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" real NOT NULL,
	"due_date" text NOT NULL,
	"category" text NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"frequency" text,
	"account_id" text,
	"last_notif_state" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"icon" text,
	"icon_type" text DEFAULT 'icon',
	"color" text DEFAULT '#94a3b8',
	"parent_id" text,
	"provider_type" text,
	"merchant_type" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"merchant_pattern" text NOT NULL,
	"merchant_exact" text,
	"from_category" text,
	"category" text NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'learned' NOT NULL,
	"apply_scope" text DEFAULT 'future' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"item_id" text NOT NULL,
	"access_token" text NOT NULL,
	"bank_name" text NOT NULL,
	"bank_color" text DEFAULT '#1a56db' NOT NULL,
	"cursor" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_household_id_device_id_pk" PRIMARY KEY("household_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" real NOT NULL,
	"category" text,
	"type" text NOT NULL,
	"period" text NOT NULL,
	"include_in_overall" boolean DEFAULT true NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" real NOT NULL,
	"current_amount" real DEFAULT 0 NOT NULL,
	"target_date" text,
	"category" text,
	"color" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"email" text,
	"payment_mode" text,
	"due_date" text NOT NULL,
	"notes" text,
	"priority" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"plaid_item_id" text NOT NULL,
	"plaid_account_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ticker" text,
	"name" text NOT NULL,
	"security_type" text NOT NULL,
	"quantity" real NOT NULL,
	"value" real NOT NULL,
	"cost_basis" real,
	"currency" text NOT NULL,
	"as_of" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"device_id" text NOT NULL,
	"plaid_tx_id" text NOT NULL,
	"plaid_item_id" text NOT NULL,
	"plaid_account_id" text NOT NULL,
	"account_id" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"ticker" text,
	"type" text NOT NULL,
	"subtype" text,
	"quantity" real,
	"amount" real NOT NULL,
	"fees" real,
	"currency" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investment_transactions_plaid_tx_id_unique" UNIQUE("plaid_tx_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;