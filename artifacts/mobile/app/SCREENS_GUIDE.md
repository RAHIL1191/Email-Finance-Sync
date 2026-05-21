# Screens Guide

Every screen in the app — what it shows, what state it reads, what it calls.

---

## Tab Screens (`app/(tabs)/`)

### `index.tsx` — Dashboard (Home)

**Purpose:** Financial summary — net worth, recent transactions, spending breakdown.

**Context consumed:**
- `transactions` — filtered to current period for spending totals
- `accounts` — net worth calculation via `computeBalance(accounts, transactions)`
- `bills` — upcoming bills widget
- `goals` — savings goals progress

**Key computations:**
- Net worth = sum of account balances adjusted by pending transactions
- Spending by category — `useMemo` over `transactions` filtered by selected month
- Donut/pie chart — category breakdown using `react-native-svg`

**Navigation:** Taps on section cards navigate to the relevant tab.

**Components used:** `SectionCard` (local), `useDrawer` (sidebar toggle)

**API calls:** None directly — data loaded at startup via `AppContext`.

---

### `transactions.tsx` — Transactions + Portfolio

**Purpose:** Two-tab screen: regular transactions (Expenses/Income/Transfers) and Portfolio (investment transactions + holdings).

#### Transactions Tab
**Context consumed:**
- `transactions` — full list, filtered + grouped by period
- `accounts` — to show account name per transaction
- `categories` — for category picker in filter modal

**Key features:**
- Group by: Monthly / Weekly / Bi-Weekly / Yearly / Custom (configurable via `PeriodSettingsSheet`)
- Filter by: type, category, account, date range (`TransactionFilterModal`)
- Bar chart — monthly spending, tapping a bar opens `MonthDetailModal`
- Tapping a transaction opens `TransactionDetailModal`
- "+" button opens `AddEntrySheet` for manual entry

**Components used:**
- `AddEntrySheet` — manual transaction entry
- `TransactionFilterModal` — filter by type/category/account/date
- `MonthDetailModal` — breakdown of a single month
- `TransactionDetailModal` — full detail + edit for one transaction
- `TransactionItem` — single row renderer

#### Portfolio Tab
**Context consumed:**
- `investmentTransactions` — buy/sell/dividend history grouped by date
- `holdings` — current positions (ticker, quantity, value)
- `accounts` — to show account name per holding/transaction

**Key features:**
- Holdings shown as cards with ticker, name, value, quantity
- Investment transactions grouped by date, sorted newest first
- No API calls — data populated by Plaid sync

**API calls:** None directly — populated by `syncPlaidTransactions`.

---

### `accounts.tsx` — Accounts + Banks

**Purpose:** Shows all accounts (manual + Plaid-linked), net worth, bank connections, sync controls.

**Context consumed:**
- `accounts` — grouped by type (Checking, Savings, Investment, Credit)
- `plaidSync` — list of connected Plaid items (banks)
- `transactions` — to compute running balance via `computeBalance`
- `isSyncing` — shows activity indicator during sync

**Key features:**
- Account groups — collapsible by type (default: collapsed)
- Per-account mini sparkline chart (mock data based on balance)
- Net worth summary card
- Plaid section — each connected bank shows last synced time + Sync button
- Email section — connect Gmail/Outlook, sync emails
- "Add Account" → `AddAccountModal`
- "Connect Bank" → `PlaidLinkModal`

**Actions & API calls:**
- Sync button → `syncPlaidTransactions(itemId)` → `POST /api/plaid/sync/:itemId`
- Sync Emails → `syncEmails()` → `POST /api/email/sync`
- Add account → `addAccount()` → `POST /api/accounts`
- Edit account → `updateAccount()` → `PUT /api/accounts/:id`
- Delete account → `deleteAccount()` → `DELETE /api/accounts/:id`
- Disconnect bank → `POST /api/plaid/disconnect/:itemId`

**Components used:**
- `AddAccountModal` — form to add manual account
- `PlaidLinkModal` — Plaid Link SDK wrapper
- `ConfirmModal` — disconnect confirmation dialog

---

### `budget.tsx` — Budget & Goals

**Purpose:** Monthly budget targets per category/type, savings goals progress.

**Context consumed:**
- `budgets` — list of budget targets
- `goals` — savings goals with target + current amounts
- `transactions` — to compute actual spending vs budget per month

**Key features:**
- Budget cards — progress bar showing spent vs limit for current month
- Month selector — navigate to past/future months
- "Add Budget" → modal form (amount, category, period, type)
- Goals section — circular progress, target amount, current saved
- "Add Goal" → modal form (name, target, color)

**Actions & API calls:**
- `addBudget()` → `POST /api/budgets`
- `updateBudget()` → `PUT /api/budgets/:id`
- `deleteBudget()` → `DELETE /api/budgets/:id`
- `addGoal()` → `POST /api/goals`
- `updateGoal()` → `PUT /api/goals/:id`
- `deleteGoal()` → `DELETE /api/goals/:id`

**Components used:** `CategoryPickerModal`

---

### `bills.tsx` — Bills & Subscriptions

**Purpose:** Track recurring bills, subscriptions, due dates, overdue alerts.

**Context consumed:**
- `bills` — all bill records
- `accounts` — account picker for bill assignment
- `transactions` — detect auto-paid bills

**Key features:**
- Bills grouped / filtered by status (upcoming, overdue, paid)
- Calendar-style due date display
- Overdue bills modal on load if any bills are past due
- Bill detail sheet — full history, mark paid, edit
- "+" button → `AddEntrySheet` (bill mode)
- Filter → `BillFilterModal`

**Actions & API calls:**
- `addBill()` → `POST /api/bills`
- `updateBill()` → `PUT /api/bills/:id`
- `deleteBill()` → `DELETE /api/bills/:id`

**Components used:**
- `AddEntrySheet` — bill entry form
- `BillDetailSheet` — view + manage individual bill
- `EditBillSheet` — edit bill details
- `BillFilterModal` — filter by status/account/category

---

### `tasks.tsx` — Tasks & Reminders

**Purpose:** Financial to-do list — payment reminders, appointment tracking, subscription cancellations.

**Context consumed:**
- `tasks` — all task records

**Key features:**
- Tasks grouped by category (Subscription, Payment, Appointment, etc.)
- Due date picker, recurring toggle, payment mode selection
- Complete / delete tasks inline

**Actions & API calls:**
- `addTask()` → `POST /api/tasks`
- `updateTask()` → `PUT /api/tasks/:id`
- `deleteTask()` → `DELETE /api/tasks/:id`

---

### `insights.tsx` — AI Insights

**Purpose:** AI-generated financial insights, tips, and spending alerts. AI chat assistant.

**Context consumed:**
- `transactions` — base data for insight generation
- `accounts` — for net worth context
- `bills` — overdue/upcoming for alerts

**Key features:**
- Auto-generated insight cards (tip, alert, achievement, trend) from local transaction analysis
- AI Chat panel — `AIChatPanel` with model gating via `ModelDownloadGate`
- "+" button → `AddEntrySheet` for quick entry

**API calls:**
- `POST /api/ai-chat` — chat message processing
- `POST /api/ai-review` — transaction review (rate-limited)

**Contexts used:** `useAIProvider` (model selection), `useApp`, `useDrawer`

**Components used:** `AIChatPanel`, `ModelDownloadGate`, `AddEntrySheet`

---

## Stack Screens (`app/`)

### `settings.tsx` — App Settings

**Purpose:** App preferences, household ID, data management.

**Context consumed:** `useApp` for wipe actions, `AsyncStorage` for settings persistence.

**Key features:**
- Currency, language, theme, first-day-of-week pickers
- Household ID display + change (wipes all local data on change)
- "Reset & Clean Up" → navigates to `reset-cleanup`
- Biometric login toggle

**API calls:** None directly (navigates to reset-cleanup for data operations).

---

### `reset-cleanup.tsx` — Reset & Clean Up

**Purpose:** Granular data deletion — select what to delete by type, date range, and account.

**Context consumed:** `useApp` (`wipeData`, `accounts`, `transactions`, `bills`, `holdings`, `investmentTransactions`)

**Step 1 — Select what to delete:**
- Toggles: Bills, Expenses, Income, Transfers, Portfolio
- Date range picker
- Account filter (multi-select)

**Step 2 — Preview counts + confirm:**
- Shows how many records match the filter
- Confirm triggers `wipeData()` which:
  - Filters `transactions` by type + date + account
  - Optionally clears `holdings` + `investmentTransactions` (portfolio)
  - Optionally clears `bills`
  - Calls `DELETE /api/transactions/bulk` with matching IDs
  - Updates AsyncStorage

**API calls:** `DELETE /api/transactions/bulk`

---

### `ai-review.tsx` — AI Transaction Review

**Purpose:** AI reviews your recent transactions and labels them (Good spend / Worth reviewing / Consider cutting).

**Context consumed:** `transactions`, `accounts`, `useAIProvider`

**Flow:**
- Fetches unreviewed transactions
- `POST /api/ai-review` with transaction list
- Displays verdict cards per transaction
- User marks as reviewed → `markTransactionReviewed(id)`

**API calls:** `POST /api/ai-review` (rate-limited)

---

### `category-mapping.tsx` — Category Rules

**Purpose:** Define auto-categorization rules — when a transaction matches a merchant/keyword, auto-assign a category.

**Context consumed:** `categories`, `categoryRules`

**Actions & API calls:**
- `addCategoryRule()` → `POST /api/category-rules`
- `updateCategoryRule()` → `PUT /api/category-rules/:id`
- `deleteCategoryRule()` → `DELETE /api/category-rules/:id`

---

### `data-storage.tsx` — Data Storage Overview

**Purpose:** Shows a breakdown of all stored data — counts per type, storage usage, export options.

**Context consumed:** All context state (transactions, accounts, bills, budgets, goals, tasks, investmentTransactions, holdings).

**API calls:** None — reads local state only.

---

### `notifications.tsx` — Notifications

**Purpose:** Push notification settings — bill reminders, sync alerts.

**API calls:** `POST /api/push-tokens` — registers Expo push token with server.

---

### `refunds.tsx` — Refund Tracker

**Purpose:** Track expected refunds — cross-references income transactions to flag likely refunds.

**Context consumed:** `transactions` (filtered to income type)

---

### `projects.tsx` / `project-detail.tsx` — Projects

**Purpose:** Track spending against a named project/goal (e.g. "Home Renovation").

**Context consumed:** `projects`, `transactions`

**API calls:**
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

---

### `email-debug.tsx` — Email Debug

**Purpose:** Developer tool — test email parsing, see raw parsed output from IMAP sync.

**API calls:** `POST /api/email/sync` (same as production sync, displays raw response)

---

### `account/[id].tsx` — Account Detail

**Purpose:** Deep-dive into a single account — transaction history, balance chart.

**Context consumed:** `accounts` (single account by route param), `transactions` (filtered to accountId)

---

## Component Library (`components/`)

| Component | Used By | Purpose |
|---|---|---|
| `AddEntrySheet` | transactions, bills, insights | Universal entry form (transaction + bill) |
| `PlaidLinkModal` | accounts | Plaid Link SDK integration |
| `AddAccountModal` | accounts | Manual account creation form |
| `TransactionDetailModal` | transactions | Full transaction view + edit |
| `TransactionFilterModal` | transactions | Multi-axis filter UI |
| `MonthDetailModal` | transactions | Month drill-down breakdown |
| `TransactionItem` | transactions | Single transaction row |
| `BillDetailSheet` | bills | Bill view + history |
| `EditBillSheet` | bills | Bill edit form |
| `BillFilterModal` | bills | Bill filter UI |
| `AIChatPanel` | insights | AI chat interface |
| `ModelDownloadGate` | insights | AI model availability check |
| `CategoryPickerModal` | budget, category-mapping | Category selection |
| `ConfirmModal` | accounts | Generic confirm dialog |
| `Drawer` | all tabs | Side navigation drawer |
| `AddBillModal` | bills | Quick add bill |
| `MerchantPickerModal` | transactions | Merchant selection |
| `AccountCard` | accounts | Account summary card |
