# Sync Guide — How Data Gets Into the App

All sync logic lives in `AppContext.tsx`. This document explains every sync flow end-to-end.

---

## 1. Plaid — Initial Bank Connect

**Triggered by:** User taps "Connect Bank" in the Accounts tab → `PlaidLinkModal.tsx` opens.

```
PlaidLinkModal.tsx
  │
  ├─ GET /api/plaid/link-token
  │     → Plaid: linkTokenCreate({ products: [transactions, investments] })
  │     ← returns { link_token }
  │
  ├─ Opens Plaid Link SDK (in-app browser/webview)
  │     → User picks institution & logs in
  │     ← Plaid returns public_token + metadata
  │
  └─ POST /api/plaid/exchange-token
        Body: { public_token, bank_name, bank_color }
        │
        ├─ Plaid: itemPublicTokenExchange(public_token)
        │     ← { access_token, item_id }
        │
        ├─ Plaid: accountsGet(access_token)
        │     ← list of accounts (checking, RRSP, credit, etc.)
        │
        ├─ Plaid: transactionsSync(access_token, cursor)
        │     ← paginated loop until has_more = false
        │     collects all "added" transactions
        │
        ├─ Plaid: transactionsGet(access_token, last 90 days, count: 500)
        │     ← merged with sync results by transaction_id (dedup)
        │     ensures credit card + async institutions (e.g. Wealthsimple) are covered
        │
        ├─ Plaid: investmentsHoldingsGet(access_token)
        │     ← current portfolio positions with security metadata
        │
        ├─ Plaid: investmentsTransactionsGet(access_token, last 2 years)
        │     ← paginated (500 per page, offset loop)
        │     ← buy/sell/dividend/transfer history
        │
        ├─ Stores item in DB (plaid_items table): access_token, cursor, bankName
        ├─ Creates accounts in DB (accounts table)
        │
        └─ Returns to client:
              {
                itemId,
                accounts: [{ plaidAccountId, name, type, balance, lastFour }],
                transactions: [...mapped],
                holdings: [...mapped],
                investmentTransactions: [...mapped]
              }

AppContext.tsx → connectPlaid()
  ├─ Dedup accounts:
  │     1. Match by plaidAccountId (already linked) → reuse existing local id
  │     2. Match by lastFour + bankName → merge, stamp plaidAccountId
  │     3. No match → create new account (genId()), POST /api/accounts
  │
  ├─ setAccounts([...existing, ...new])
  │
  ├─ Map transactions: plaidAccountId → local accountId
  ├─ setTransactions (upsert, dedup by amount|date|title key)
  │
  ├─ setHoldings (replace for this item, map plaidAccountId → local accountId)
  ├─ setInvestmentTransactions (append, dedup by plaidTxId)
  │
  └─ setPlaidSync → registers item with { itemId, accountIds, plaidAccountMap, bankName }
```

---

## 2. Plaid — Manual Sync (Refresh)

**Triggered by:** User taps "Sync" button in Accounts tab → `syncPlaidTransactions(itemId)` in `AppContext.tsx`.

```
AppContext.tsx → syncPlaidTransactions(itemId, forceFullSync?)
  │
  ├─ Builds plaidAccountId → localAccountId map from:
  │     - item.plaidAccountMap (persisted in plaidSync state)
  │     - accounts where plaidItemId === itemId
  │
  ├─ Detects mismatched transactions (accountId wrong for this item)
  │
  ├─ POST /api/plaid/sync/:itemId
  │     Body: { force: true } if:
  │       - mismatches found
  │       - forceFullSync = true
  │       - item.lastImported === 0 (never successfully imported)
  │     │
  │     ├─ Plaid: accountsGet(access_token)
  │     │     ← fresh account balances
  │     │
  │     ├─ Plaid: transactionsSync(access_token, cursor from DB)
  │     │     ← only NEW transactions since last sync (incremental)
  │     │     (force=true resets cursor → full history)
  │     │
  │     ├─ Plaid: transactionsGet(access_token, last 90 days)
  │     │     ← always called, merged by transaction_id
  │     │     (catches credit cards + async institutions)
  │     │
  │     ├─ Plaid: investmentsHoldingsGet(access_token)
  │     │     ← refreshed portfolio positions
  │     │
  │     ├─ Plaid: investmentsTransactionsGet(access_token, last 2 years)
  │     │     ← full paginated history every sync
  │     │
  │     ├─ Backfills plaid_item_id + plaid_account_id on DB accounts (self-heal)
  │     ├─ Updates cursor + lastSyncedAt in DB
  │     │
  │     └─ Returns:
  │           {
  │             transactions: [...mapped],
  │             count: N,
  │             holdings: [...mapped],
  │             investmentTransactions: [...mapped],
  │             plaidAccounts: [{ plaidAccountId, name, balance, lastFour }]
  │           }
  │
  ├─ Self-heal account map from plaidAccounts in response:
  │     - Match by plaidAccountId → update map
  │     - Match by lastFour + bankName → update map
  │
  ├─ Update balances: setAccounts (apply fresh Plaid balances)
  │     + PUT /api/accounts/:id { balance } for each account
  │
  ├─ Remap existing transactions with wrong accountId (legacy fix)
  │
  ├─ setTransactions (upsert new, dedup by amount|date|title)
  │
  ├─ setHoldings (replace all holdings for this item)
  │
  ├─ setInvestmentTransactions (append, dedup by plaidTxId)
  │
  └─ setPlaidSync → update lastSynced, lastImported for item
```

---

## 3. Email Sync

**Triggered by:** User taps "Sync Emails" in Accounts tab → `syncEmails()` in `AppContext.tsx`.

```
AppContext.tsx → syncEmails()
  │
  └─ POST /api/email/sync
        Body: { email, appPassword, daysBack: 90 }
        │
        ├─ IMAP connect to Gmail/Outlook
        ├─ Scan inbox (last 90 days)
        ├─ Parse financial emails (bank notifications, e-transfers)
        ├─ Extract: amount, bank, lastFour, date, merchant, type
        │
        └─ Returns:
              {
                transactions: [...parsed as Transaction],
                parsed: [...raw parsed data],
                emailsScanned: N
              }

  ├─ Auto-create missing accounts from parsed bank names
  │     (match by bank name + lastFour, create if not found)
  │     POST /api/accounts for each new account
  │
  ├─ Map transactions: bank → local accountId using category rules
  │
  ├─ setTransactions (upsert, dedup by amount|date|title)
  │     POST /api/transactions/bulk
  │
  └─ Update emailSync state: lastSynced, lastEmailsScanned, lastImported
```

---

## 4. Manual Transaction Entry

**Triggered by:** "+" button on Transactions or Bills tab → `AddEntrySheet.tsx`.

```
AddEntrySheet.tsx
  └─ User fills: amount, category, account, date, notes

AppContext.tsx → addTransaction(tx)
  ├─ Validate: amount required, account required
  ├─ genId() → local id
  ├─ setTransactions([...prev, newTx])
  └─ POST /api/transactions { ...tx }
```

---

## 5. App Startup Self-Healing (Sequenced Sync)

Every time the app launches, these processes run in order:

```
App launch
  │
  ├─ Load AsyncStorage → populate all state (accounts, transactions, etc.)
  │
  ├─ GET /api/categories
  │     → if server has categories: use them
  │     → if empty + local empty: seed defaults (POST /api/categories/seed)
  │
  ├─ GET /api/category-rules
  │     → load auto-categorization rules
  │
  ├─ SEQUENCED transaction sync (pull → merge → push diff):
  │     1. GET /api/transactions
  │        → merge with local using upsertTransactions
  │     2. Compute local-only diff (txs server doesn't have by id, content key, or plaidTransactionId)
  │     3. POST /api/transactions/bulk (ONLY local-only diff)
  │        → server dedup catches any remaining edge cases
  │     Fallback: if server unreachable, push all local txs
  │
  └─ GET /api/accounts (concurrent with tx sync)
        → compare server accounts vs local accounts
        → accounts missing on server (e.g. after DB wipe): POST /api/accounts
        → merge server accounts with local, preserve plaid metadata
```

---

## State Persistence (AsyncStorage Keys)

| Key | Data |
|---|---|
| `transactions` | All regular transactions |
| `accounts` | All accounts (checking, savings, investment, credit) |
| `investmentTransactions` | Investment buy/sell/dividend history |
| `holdings` | Current portfolio positions |
| `plaidSync` | Plaid item registry (tokens, cursors, accountIds) |
| `emailSync` | Email credentials + last sync metadata |
| `bills` | Bills and subscriptions |
| `budgets` | Budget targets |
| `goals` | Savings goals |
| `tasks` | Financial reminders/tasks |
| `categories` | Transaction categories |
| `categoryRules` | Auto-categorization rules |
| `householdId` | Shared household ID |
| `deviceId` | Unique device ID |
| `userName` | Display name |
| `reviewedTransactionIds` | IDs of AI-reviewed transactions |

---

## Deduplication Logic

Regular transactions are deduped by three dimensions (any match = duplicate):

1. **ID** — exact match on `transaction.id`
2. **Content key** — `accountId|amountCents|date(YYYY-MM-DD)`
   - Amount is normalised to integer cents via `Math.round(amount * 100)` to prevent
     float4 (PostgreSQL `real`) round-trip precision drift from causing false negatives.
3. **plaidTransactionId** — Plaid's unique transaction ID, when present

```
contentKey = `${accountId.toLowerCase()}|${Math.round(amount * 100)}|${date.slice(0,10)}`
```

Investment transactions are deduped by `plaidTxId` (Plaid's unique investment transaction ID).

Source priority (highest wins): `plaid` > `manual` > `email`

### DB-level safety
- Primary key on `id` prevents row-level duplicates
- Partial unique index on `plaid_transaction_id WHERE plaid_transaction_id IS NOT NULL`
  prevents the same Plaid transaction from being stored twice
- `onConflictDoUpdate` on bulk upsert ensures existing rows are updated, never duplicated
