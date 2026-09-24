# Email-Finance-Sync — Feature Progress

> Updated automatically as features are implemented.
> Each entry lists the feature, status, and every file touched.

---

## ✅ Reliable Plaid Account Creation & Database Persistence
Fixed an issue where linking accounts via Plaid would succeed, but accounts were never created or saved in the database.
- **Server-Side Account Persistence:** Directly creates and upserts Plaid accounts in `accountsTable` during `/api/plaid/exchange-token` and self-heals any missing accounts during `/api/plaid/sync/:itemId`, ensuring the database always stores linked accounts immediately.
- **Client Account Matching Fix:** Fixed `findAccountMatch` in `AppContext.tsx` so that when `lastFour` is provided and does not match, it returns `undefined` rather than improperly falling back to any account with the same bank name (which previously caused new accounts to be incorrectly skipped as "existing" accounts).
- **Joint Account & ID Preservation:** Included `isJoint` and `sharedPlaidAccounts` in `bulk-upsert` and account PUT routes, and passed through server-generated account IDs from Plaid Link modal to `connectPlaid`.
- **Database Backfill:** Backfilled the 3 missing BMO accounts for item `pi_muezydzy_ym4pp` into Neon PostgreSQL and updated the shared Mortgage account.

**Files touched:**
- `@/artifacts/api-server/src/routes/plaid.ts` — server-side account creation and upsert on exchange-token & sync
- `@/artifacts/api-server/src/routes/accounts.ts` — support `isJoint` and `sharedPlaidAccounts` in bulk-upsert & PUT
- `@/artifacts/mobile/context/AppContext.tsx` — strict `lastFour` matching in `findAccountMatch` and ID preservation in `connectPlaid`
- `@/artifacts/mobile/components/PlaidLinkModal.tsx` — preserve account IDs from exchange-token response

---

## ✅ Accounts Tab — Reset Button Removal & Type Fix
Removed the "Reset All Transactions" button from the Accounts tab header to match design mockups, and resolved the TypeScript warning for `wipeData` on the main `AppProvider` context.

**Files touched:**
- `@/artifacts/mobile/app/(tabs)/accounts.tsx:1-125` — removed Reset Button from header
- `@/artifacts/mobile/context/AppContext.tsx:2100-2210` — fixed context typing for `wipeData`

---

## ✅ Add Entry Validation
Added clear Alerts for when users try to save manual Expenses, Income, or Transfers without entering an amount or selecting an account, replacing silent failures.

**Files touched:**
- `@/artifacts/mobile/components/AddEntrySheet.tsx:830-1410` — implemented input & account validation pop-ups for all tabs

---

## ✅ Bar Chart Visual Fixes
Made the active/selected month indicator in the transactions bar chart a subtle semi-transparent color instead of a solid slate gray. This ensures empty months look empty and do not mimic a massive transaction entry.

**Files touched:**
- `@/artifacts/mobile/app/(tabs)/transactions.tsx:800-815` — updated bar column highlight style

---

## ✅ Date Validation for Reset & Clean Up
The "NEXT" button in the Reset & Clean Up modal now requires both "From Date" and "To Date" to be selected first, alerting the user explicitly if missing.

**Files touched:**
- `@/artifacts/mobile/app/reset-cleanup.tsx:380-400` — added date validation alert to the NEXT button

---

## ✅ Same-Day Data Filtering & Deletion Fix
Normalized date range comparisons to use the start-of-day for the start date and end-of-day for the end date, ensuring that transactions occurring on the selected days are correctly counted and deleted.

**Files touched:**
- `@/artifacts/mobile/app/reset-cleanup.tsx:65-78` — normalized local date range check times
- `@/artifacts/api-server/src/routes/transactions.ts:125-132` — normalized backend date string comparison bounds

---

## ✅ Reset Screen Zero-State Defaults
Ensured that all transaction and bill category counts start at `0` before any date range is selected, rather than displaying unfiltered historical totals.

**Files touched:**
- `@/artifacts/mobile/app/reset-cleanup.tsx:65-86` — adjusted filteredCounts to evaluate to 0 until date bounds are set

---

## ✅ Portfolio Deletion Toggle
Added the **Portfolio** category (holdings & investment transactions) to the Reset & Clean Up screen, allowing atomic local portfolio data wipes alongside transaction wipes.

**Files touched:**
- `@/artifacts/mobile/app/reset-cleanup.tsx:24-155` — added portfolio selection, item counting, and wipe routine

---

## ✅ Closed Accounts Dropdown by Default
Defaulted all account groups (Chequing, Savings, Credit Cards, Investment) in the Accounts Tab to a collapsed state on launch, allowing users to expand them dynamically.

**Files touched:**
- `@/artifacts/mobile/app/(tabs)/accounts.tsx:735-895` — defaulted category dropdown states to collapsed

---

## ✅ Reliable Credit Card & Investment Transaction Sync
Upgraded the Plaid sync flows to combine both `/transactions/sync` and `/transactions/get` endpoints, deduplicating the results by their unique `transaction_id`. This guarantees credit card transactions (such as the Wealthsimple Cash card) are immediately fetched even when Plaid is processing sync events asynchronously.

Additionally, fixed a critical typo in the Plaid Node SDK call where `client.investmentTransactionsGet` (singular) was being invoked instead of the correct `client.investmentsTransactionsGet` (plural, corresponding to the `/investments/transactions/get` endpoint). This typo was causing investment transaction fetches to fail with a silent JavaScript error on the backend, returning empty arrays and leaving the client with no RRSP or Spousal RRSP transaction activity.

**Files touched:**
- `@/artifacts/api-server/src/routes/plaid.ts:195-410` — integrated and deduplicated dual-sync endpoints, corrected singular investment typo to plural investments for investmentsTransactionsGet inside exchange-token and sync routes.

---

## ✅ Merchant Picker Modal
Allow users to pick a merchant when adding or editing a transaction.

**Files touched:**
- `artifacts/mobile/components/MerchantPickerModal.tsx` — new component (full implementation)
- `artifacts/mobile/components/AddEntrySheet.tsx` — wired MerchantPickerModal into ExpenseTab and IncomeTab
- `artifacts/mobile/components/TransactionDetailModal.tsx` — wired MerchantPickerModal into edit form

---

## ✅ Transfer Exclusions from Spending
Transactions marked as transfers are excluded from expense totals, merchant lists, and subcategory breakdowns.

**Files touched:**
- `artifacts/mobile/app/(tabs)/transactions.tsx` — exclude transfers from `expenseTxs`, `merchantItems`, `subcategoryItems`, `subTransactions`
- `artifacts/mobile/components/MerchantPickerModal.tsx` — exclude transfers from merchant list

---

## ✅ Revert Transfer Button
When a transaction is a transfer, the "Mark as transfer" button is replaced with "Revert to Expense/Income".

**Files touched:**
- `artifacts/mobile/components/TransactionDetailModal.tsx` — toggle button label based on `isTransfer` state

---

## ✅ Plaid Data Migration
Migrated 5 Plaid items (Tangerine, CIBC ×2, BMO, Wealthsimple) from old project's Neon DB into current project's Neon DB, preserving access tokens.

- BMO: 77 transactions fetched directly from Plaid and stored in DB.
- Tangerine, CIBC ×2, Wealthsimple: tokens need re-authentication via Plaid Link update mode in the app (login expired on bank side).

**Files touched:**
- `migrate-plaid.mjs` — root migration script (direct Plaid REST calls, no API server dependency)
- `lib/db/migrate-plaid.mjs` — synced copy run from lib/db (has pg available)
- `lib/db/check-schema.mjs` — one-time schema diagnostic helper
- `lib/db/check-bmo.mjs` — one-time query to inspect BMO titles
- `lib/db/fix-bmo-titles.mjs` — one-time DB cleanup for garbled BMO names

**Credentials required:**
- `SOURCE_DB_URL`, `TARGET_DB_URL`, `HOUSEHOLD_ID` env vars
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` — auto-loaded from `artifacts/api-server/.env`

---

## ✅ Transaction Deduplication Fix (Gmail ↔ Plaid)
Prevents duplicate transactions when the same purchase is imported by both Gmail sync and Plaid sync.

**Root cause:** `dedupKey` included `title`, which differs between Gmail ("Transaction at Amazon") and Plaid ("Amazon").

**Fix:** `dedupKey` now matches on `amount + date + accountId + bank` only (no title).

**Files touched:**
- `artifacts/mobile/context/AppContext.tsx` — updated `dedupKey` function (line ~313)

---

## ✅ Server Pull on App Init
On startup the app now calls `GET /api/transactions` and merges any server-side transactions into local state. This surfaces transactions inserted externally (migration script, other devices).

**Behavior:**
- Adds net-new transactions not in AsyncStorage
- Updates `title` / `bank` of existing transactions if the server has a different value (picks up DB name fixes)
- Never overwrites user-edited fields (category, note, etc.)

**Files touched:**
- `artifacts/mobile/context/AppContext.tsx` — background fetch added in init `useEffect` (line ~498)

---

## ✅ BMO Transaction Name Cleaning
Cleans garbled BMO transaction names from Plaid (bracket codes, raw bank descriptions, Interac patterns).

**Patterns handled:**
| Raw | Cleaned |
|-----|---------|
| `[CW]VIR INTERAC RECU RAHIL DINESH SHAH 202…` | Interac from Rahil Dinesh Shah |
| `[TF]MTG/HYP532 BR 2000` | Mortgage Payment |
| `[CW] TF 2145#8885-982` | Wire Transfer |
| `[IN]` | Interest |
| `[SC]REMBOURSEMENT DES FRAIS` | Service Fee Refund |
| `Dshydro` | Hydro |
| `Dsws Investments Inv Pla` | Wealthsimple Investments |
| `Dscl Cad S&y Insu` | Sun Life Insurance |
| `Scprogramme Performance` | Programmes & Fees |

**Files touched:**
- `artifacts/api-server/src/routes/plaid.ts` — added `cleanPlaidName()` and `toTitleCase()` helpers; used in `mapPlaidTransaction()` for all future Plaid syncs
- `lib/db/fix-bmo-titles.mjs` — one-time DB cleanup applied to existing 77 BMO rows

---

## ✅ Accounts Tab — Premium Matte Redesign + Auto-Account Creation

### UI
- **`PremiumAccountCard`** replaces the old flat `AccountRow`. Each account is a standalone full-width matte card with:
  - Bank badge (colored circle with emoji or initials)
  - Account name + type pill (icon + label) + last-four
  - Bank name subtitle
  - Bold balance (red if negative)
  - Colored 2.5px bottom accent bar per account color
  - Chevron → navigates to account detail drill-down
- Groups split into: **Chequing**, **Savings**, **Credit Cards**, **Investment** (each with icon + section total)

### Auto-Account Creation
- **Gmail sync**: after each sync, checks `parsed` results for unique bank/lastFour combos. If no matching account exists → auto-creates with inferred type (credit/checking) and bank color. Remaps imported transactions with empty `accountId` to the new account.
- **Plaid connect**: after `connectPlaid` creates/merges accounts, remaps any existing transactions whose `accountId` is a raw Plaid account ID (e.g., from migration script) to the new local account ID.

**Files touched:**
- `artifacts/mobile/app/(tabs)/accounts.tsx` — replaced `AccountRow` with `PremiumAccountCard`, updated `AccountGroup` (icon + individual cards), split checking/savings groups, updated styles
- `artifacts/mobile/context/AppContext.tsx` — `syncEmailTransactions` auto-account creation; `connectPlaid` transaction remapping

---

## 🔲 Reconnect Expired Banks (Pending User Action)
Tangerine, CIBC ×2, and Wealthsimple tokens have expired on the bank side. Requires user to re-authenticate via Plaid Link update mode inside the app.

**No code change needed** — standard Plaid re-link flow.

---

## ✅ Android Release APK Build

Standalone release APK that works without a Metro server — JS bundle is embedded inside the APK.

**Root cause of "Unable to load script" error:** The existing `app-debug.apk` (built May 17) was a debug build that tried to load JS from Metro at `localhost:8081`. Release builds bake the bundle in.

**Build output:**
- `artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk` — 180.2 MB (May 18, 2026)
- Signed with `android/app/debug.keystore` (debug key, sufficient for sideloading)

**Signing config** (already in `android/app/build.gradle`):
- `buildTypes.release.signingConfig = signingConfigs.debug` — uses debug keystore for release

**Windows fixes already applied:**
- `android.experimental.cxxBuildOutputDirectory=C:/cxx` in `android/gradle.properties`
- `LongPathsEnabled=1` registry key
- Ninja 1.12.1 at `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`

**Full build guide:** `artifacts/mobile/BUILD.md`

---

## ✅ Render Deployment

api-server deployed to Render as a Web Service at `https://fintrack-api-fmfl.onrender.com`.

**Files touched:**
- `render.yaml` — Blueprint config: build command, start command, env vars, health check path
- `artifacts/api-server/src/routes/health.ts` — added `/api/health` alias (Render probes this; actual route was `/api/healthz`)
- `artifacts/mobile/context/AppContext.tsx` — updated `getApiBase()` fallback to Render URL
- `artifacts/mobile/app/email-debug.tsx` — updated hardcoded fallback to Render URL

**Keep-alive:** cron-job.org pings `GET /api/healthz` every 13 min to prevent free-tier sleep.

---

## ✅ Bill Payment Auto-Verification

Server-side bill checker triggered every 2 hours via cron-job.org. Detects matching transactions, marks bills paid, and sends push notifications — once per state change only.

**How it works:**
- External cron calls `POST /api/cron/bill-check` with `X-Cron-Secret` header every 2 hours
- Checks unpaid bills in ±2 day window around due date
- Matches by **amount ±10%** (not category — manual bill categories ≠ Plaid taxonomy)
- On match: marks bill paid, tags transaction note, sends "✅ paid" push
- On no match: sends state alert (upcoming / due today / overdue) — **once per state only** (`lastNotifState`)
- Recurring bills: on match, advances `dueDate` to next cycle + resets state (no permanent isPaid)

**State machine:** `upcoming → due_unpaid → overdue → paid` — each fires exactly once per bill per cycle

**⚠️ Routing gotcha — MUST register before household-auth routers:**
Express `router.use(requireHouseholdId)` at the top of a router runs for **all paths through that router**, not just matched ones. Every data router (accounts, transactions, bills, categories, etc.) has this. Any new "public" endpoint (no household auth) **must be registered in the public section of `routes/index.ts`**, before the data CRUD block — otherwise it gets a 400 from the wrong router's middleware.

```ts
// routes/index.ts — correct order
router.use(healthRouter);
router.use(configRouter);
router.use(billCheckRouter);   // ✅ public — cron secret auth, placed here
// router.use(accountsRouter); // ❌ would intercept if placed after this
```

**Files touched:**
- `lib/db/src/schema/bills.ts` — added `lastNotifState text` column
- `lib/db/src/schema/push_tokens.ts` — new table, composite PK `(householdId, deviceId)`
- `lib/db/src/schema/index.ts` — exported `pushTokensTable`
- `artifacts/api-server/src/lib/billChecker.ts` — core checker logic
- `artifacts/api-server/src/lib/pushNotifications.ts` — Expo Push API via fetch, stale token cleanup
- `artifacts/api-server/src/routes/billCheck.ts` — `POST /api/cron/bill-check`
- `artifacts/api-server/src/routes/pushTokens.ts` — `POST /api/push-token` upsert
- `artifacts/api-server/src/routes/index.ts` — billCheckRouter in public section (before data routers)
- `artifacts/mobile/services/notificationService.ts` — added `registerPushTokenWithServer()`
- `artifacts/mobile/context/AppContext.tsx` — calls token registration after household init

**cron-job.org jobs:**
- Keep-alive: `GET https://fintrack-api-fmfl.onrender.com/api/healthz` every 13 min
- Bill checker: `POST https://fintrack-api-fmfl.onrender.com/api/cron/bill-check` with `X-Cron-Secret` header, every 2 hours (`0 */2 * * *`)

---

## ✅ Data Storage Settings Screen

Drawer → "Data Storage" screen showing which data lives in server DB vs AsyncStorage, with toggles to opt async-only data types (Budgets, Goals, Tasks, Projects) into DB sync.

### Storage map
| Data type | Default storage | Toggleable? |
|-----------|----------------|-------------|
| Transactions | DB + Local | ❌ Always synced |
| Accounts | DB + Local | ❌ Always synced |
| Bills | DB + Local | ❌ Always synced |
| Categories | DB + Local | ❌ Always synced |
| Category Rules | DB + Local | ❌ Always synced |
| **Budgets** | Local only | ✅ Optional |
| **Goals** | Local only | ✅ Optional |
| **Tasks** | Local only | ✅ Optional |
| **Projects** | Local only | ✅ Optional |

### Confirmation flows
- **Toggle ON (first time):** Alert with "Upload All existing + Sync" or "Start Fresh Sync" choice
- **Toggle OFF:** Warning that data remains in DB; records `stoppedAt` timestamp
- **Toggle ON again:** "Resume from [stoppedAt]" — pulls delta via `?since=` query, merges locally

### Ongoing CRUD sync
When a type has sync enabled, every `add*` / `update*` / `delete*` call in AppContext also fires the corresponding API endpoint (fire-and-forget).

**Files touched:**
- `lib/db/src/schema/budgets.ts|goals.ts|tasks.ts|projects.ts` — new Drizzle tables (created)
- `lib/db/src/schema/index.ts` — exports 4 new schemas
- `artifacts/api-server/src/routes/budgets.ts|goals.ts|tasks.ts|projects.ts` — CRUD routers with `?since=` and `onConflictDoUpdate`
- `artifacts/api-server/src/routes/index.ts` — registered 4 new routers
- `artifacts/mobile/context/DbSyncPrefsContext.tsx` — new context: per-type `enabled/lastSync/stoppedAt` in AsyncStorage
- `artifacts/mobile/context/AppContext.tsx` — `useDbSyncPrefs` hook, `syncPrefsRef`, sync-aware CRUD, `uploadToDb`/`pullFromDb` helpers
- `artifacts/mobile/app/_layout.tsx` — added `DbSyncPrefsProvider` wrapping `AppProvider`; registered `data-storage` screen
- `artifacts/mobile/app/data-storage.tsx` — new settings screen
- `artifacts/mobile/components/Drawer.tsx` — "Data Storage" menu item

**DB migration:** `drizzle-kit push` run — 4 new tables created in Neon ✅

---

## ✅ Bulk Account Upsert (Single Request)

Replaced N individual `PUT /api/accounts/:id` requests (one per account) with a single `POST /api/accounts/bulk-upsert` that does one SQL `INSERT … ON CONFLICT DO UPDATE` for all accounts at once. Applied to all three call sites: balance updates after Plaid sync, new account creation in `connectPlaid`, and the startup self-heal loop.

**Files touched:**
- `artifacts/api-server/src/routes/accounts.ts` — new `POST /api/accounts/bulk-upsert` endpoint
- `artifacts/mobile/context/AppContext.tsx` — replaced 3 × `forEach(bgCall)` loops with single `bgCall("/api/accounts/bulk-upsert")`

---

## ✅ Health Check Log Suppression

Render pings `GET /api/healthz` every ~5 s. Added `autoLogging.ignore` to `pino-http` so these appear in Render's routing layer but are dropped before they reach the structured log stream, reducing log noise significantly.

**Files touched:**
- `artifacts/api-server/src/app.ts` — `autoLogging: { ignore: req => req.url?.startsWith("/api/healthz") }`

---

## ✅ Net Worth Period Change Indicator

The Week / Month / Year filter in the Accounts tab now computes the net income/expense change for the selected window and displays it as a coloured delta below the main balance: `↑ +$1,234 this month` or `↓ −$500 this week`. The headline net worth figure remains the authoritative current value.

**Files touched:**
- `artifacts/mobile/app/(tabs)/accounts.tsx` — `periodStart`, `networthAccountIds`, `periodChange` memos; delta row rendered below `netWorthAmount`

---

## ✅ Investment Transactions on Account Detail

Account detail screen now correctly surfaces investment transactions for an RRSP/investment account. Root cause: the filter used only `t.accountId === id`, but if `plaidAccMap` had a miss during sync, `accountId` was stored as `""`. Fix adds an OR check on `t.plaidAccountId === account.plaidAccountId`.

**Files touched:**
- `artifacts/mobile/app/account/[id].tsx` — `accountInvTxns` filter extended with `plaidAccountId` fallback

---

## ✅ Portfolio Tab Collapsible Sections

Holdings and Activity sections in the Portfolio subtab are now collapsible. Each section header shows the item count and a chevron that toggles open/closed. Both start expanded by default.

**Files touched:**
- `artifacts/mobile/app/(tabs)/transactions.tsx` — `holdingsOpen`/`activityOpen` state; `TouchableOpacity` toggle headers with chevron + count

---

## ✅ Account Detail Collapsible Sections

Both "Recent Transactions" and "Investment Activity" sections on the account detail screen are now collapsible with a chevron toggle. The "View All" button remains visible inside the header when the section is open, and uses `e.stopPropagation()` so it doesn't accidentally collapse the section.

**Files touched:**
- `artifacts/mobile/app/account/[id].tsx` — `txOpen`/`invTxOpen` state; `TouchableOpacity` section headers; proper `&&(ternary)` guard for both sections

---

## How to rebuild & restart API server
```powershell
# From project root:
pnpm --filter "@workspace/api-server" run build   # compile TypeScript
pnpm --filter "@workspace/api-server" run start   # start on port 80
# Or both:
pnpm --filter "@workspace/api-server" run dev
```
