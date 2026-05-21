# API Routes Guide

All routes (except public ones) require headers:
- `X-Household-ID: <householdId>`
- `X-Device-ID: <deviceId>`

Base URL (production): `https://your-render-url.onrender.com/api`

---

## Public Routes

### `GET /health`
**File:** `health.ts`
Returns `{ status: "ok" }`. No auth required. Used by Render health checks.

### `GET /config`
**File:** `config.ts`
Returns runtime feature flags so the client knows which features are enabled.
```json
{ "emailSync": true, "plaidSync": true }
```

### `GET /plaid/link-page`
**File:** `plaid.ts`
Serves the HTML page that hosts the Plaid Link SDK in a browser popup (no auth headers — browser-opened).

---

## Accounts — `accounts.ts`

### `GET /api/accounts`
Returns all accounts for the household.
```json
[{ "id": "...", "name": "...", "type": "checking", "balance": 1234.56, "plaidAccountId": "...", "plaidItemId": "..." }]
```

### `POST /api/accounts`
Create a new account.
```json
// Body
{ "name": "TD Chequing", "type": "checking", "balance": 500, "bank": "TD", "lastFour": "1234", "color": "#1a56db" }
```

### `PUT /api/accounts/:id`
Update an account (balance, name, type, etc.).
```json
// Body — any subset of account fields
{ "balance": 999.99 }
```
Returns `404` if account not found for this household.

### `DELETE /api/accounts`
Delete **all** accounts for the household.

### `DELETE /api/accounts/:id`
Delete a single account by ID.

---

## Transactions — `transactions.ts`

### `GET /api/transactions`
Returns all transactions for the household, ordered by date descending.

### `POST /api/transactions`
Create a single transaction.
```json
// Body
{ "title": "Coffee", "amount": 4.50, "type": "expense", "category": "Food", "date": "2025-05-01", "accountId": "..." }
```

### `POST /api/transactions/bulk`
Upsert multiple transactions at once (used by email sync + Plaid sync). Deduplicates by `(householdId, accountId, amount, date)`.
```json
// Body
{ "transactions": [...] }
```

### `PUT /api/transactions/:id`
Update a single transaction.

### `DELETE /api/transactions`
Delete all transactions for the household.

### `DELETE /api/transactions/bulk`
Delete transactions by IDs.
```json
// Body
{ "ids": ["tx_abc", "tx_def"] }
```

### `DELETE /api/transactions/:id`
Delete a single transaction.

---

## Bills — `bills.ts`

### `GET /api/bills`
Returns all bills for the household.

### `POST /api/bills`
Create a bill.
```json
{ "name": "Netflix", "amount": 16.99, "dueDay": 15, "category": "Subscription", "accountId": "..." }
```

### `PUT /api/bills/:id`
Update a bill.

### `DELETE /api/bills/:id`
Delete a bill.

---

## Budgets — `budgets.ts`

### `GET /api/budgets`
Returns all budgets.

### `POST /api/budgets`
Create a budget.
```json
{ "name": "Food Budget", "amount": 500, "period": "monthly", "category": "Food", "type": "expense", "color": "#f97316" }
```

### `PUT /api/budgets/:id`
Update a budget.

### `DELETE /api/budgets/:id`
Delete a budget.

---

## Goals — `goals.ts`

### `GET /api/goals`
Returns all savings goals.

### `POST /api/goals`
Create a goal.
```json
{ "name": "Emergency Fund", "targetAmount": 10000, "currentAmount": 2500, "color": "#10b981" }
```

### `PUT /api/goals/:id`
Update a goal (e.g. increment `currentAmount`).

### `DELETE /api/goals/:id`
Delete a goal.

---

## Tasks — `tasks.ts`

### `GET /api/tasks`
Returns all tasks for the household.

### `POST /api/tasks`
Create a task/reminder.
```json
{ "title": "Cancel Spotify", "category": "Bill Cancel", "dueDate": "2025-06-01", "recurring": false }
```

### `PUT /api/tasks/:id`
Update a task (mark complete, change due date, etc.).

### `DELETE /api/tasks/:id`
Delete a task.

---

## Categories — `categories.ts`

### `GET /api/categories`
Returns all categories for the household.

### `POST /api/categories`
Create a custom category.

### `POST /api/categories/seed`
Seeds the default category set for the household (called automatically on first launch if no categories exist).

### `PUT /api/categories/:id`
Update a category.

### `DELETE /api/categories/:id`
Delete a category.

---

## Category Rules — `categoryRules.ts`

Auto-categorization rules — when a transaction title/merchant matches, assign a category automatically.

### `GET /api/category-rules`
Returns all rules.

### `POST /api/category-rules`
Create a rule.
```json
{ "keyword": "Netflix", "category": "Subscription", "type": "expense" }
```

### `PUT /api/category-rules/:id`
Update a rule.

### `DELETE /api/category-rules/:id`
Delete a rule.

---

## Projects — `projects.ts`

### `GET /api/projects`
Returns all projects.

### `POST /api/projects`
Create a project.

### `PUT /api/projects/:id`
Update a project.

### `DELETE /api/projects/:id`
Delete a project.

---

## Plaid — `plaid.ts`

### `GET /api/plaid/link-token`
Generates a Plaid Link token so the mobile app can open the Plaid Link SDK.
```json
// Response
{ "link_token": "link-sandbox-..." }
```

### `POST /api/plaid/exchange-token`
Exchanges a public_token after user connects a bank. Full initial data load.
```json
// Body
{ "public_token": "...", "bank_name": "Wealthsimple", "bank_color": "#000000", "existing_item_id": null }
```
```json
// Response
{
  "itemId": "pi_...",
  "accounts": [{ "plaidAccountId": "...", "name": "RRSP", "type": "investment", "balance": 50000, "lastFour": "1234" }],
  "transactions": [...],
  "holdings": [...],
  "investmentTransactions": [...]
}
```

**What it calls on Plaid:**
1. `itemPublicTokenExchange` — get access_token
2. `accountsGet` — list accounts
3. `transactionsSync` (loop) — paginated transaction history
4. `transactionsGet` — last 90 days (merged with sync for completeness)
5. `investmentsHoldingsGet` — current portfolio positions
6. `investmentsTransactionsGet` (paginated) — last 2 years of investment activity

### `POST /api/plaid/sync/:itemId`
Incremental sync for an already-connected bank item.
```json
// Body (optional)
{ "force": true }   // force=true resets cursor for full re-fetch
```
```json
// Response
{
  "transactions": [...],
  "count": 45,
  "holdings": [...],
  "investmentTransactions": [...],
  "plaidAccounts": [{ "plaidAccountId": "...", "balance": 50000, "lastFour": "1234" }]
}
```

**What it calls on Plaid:**
1. `accountsGet` — fresh balances
2. `transactionsSync` — from stored cursor (or full if force=true)
3. `transactionsGet` — last 90 days (always, for completeness)
4. `investmentsHoldingsGet` — refreshed positions
5. `investmentsTransactionsGet` (paginated) — full 2-year history

### `GET /api/plaid/items`
Returns all connected Plaid items (banks) for the household.

### `DELETE /api/plaid/disconnect/:itemId`
Disconnects a bank — calls `Plaid.itemRemove`, deletes item from DB.
> ⚠️ This revokes the access_token. Re-linking will create a new item and may trigger Plaid billing.

---

## Email — `email.ts`

### `POST /api/email/sync`
Connects to Gmail/Outlook via IMAP, scans inbox, parses financial emails.
```json
// Body
{ "email": "you@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx", "daysBack": 90 }
```
```json
// Response
{
  "transactions": [...],
  "parsed": [...],
  "emailsScanned": 312
}
```

---

## AI — `ai-review.ts` / `ai-chat.ts`

Both endpoints are **rate-limited** (strict rate limit middleware).

### `POST /api/ai-review`
Reviews a batch of transactions and returns verdicts.
```json
// Body
{ "transactions": [...] }
```
```json
// Response
{ "reviews": [{ "id": "...", "verdict": "Consider cutting", "reason": "..." }] }
```

### `POST /api/ai-chat`
Chat message to the AI financial assistant.
```json
// Body
{ "message": "How much did I spend on food this month?", "context": { "transactions": [...] } }
```
```json
// Response
{ "reply": "You spent $342 on food in May." }
```

---

## Push Tokens — `pushTokens.ts`

### `POST /api/push-tokens`
Registers an Expo push notification token for the device.
```json
// Body
{ "token": "ExponentPushToken[...]" }
```

---

## Bill Check — `billCheck.ts`

### `POST /api/bill-check`
Cron-triggered endpoint (authenticated via `X-Cron-Secret` header, not household auth). Checks for overdue bills across all households and sends push notifications.
