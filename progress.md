# Email-Finance-Sync — Feature Progress

> Updated automatically as features are implemented.
> Each entry lists the feature, status, and every file touched.

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

## How to rebuild & restart API server
```powershell
# From project root:
pnpm --filter "@workspace/api-server" run build   # compile TypeScript
pnpm --filter "@workspace/api-server" run start   # start on port 80
# Or both:
pnpm --filter "@workspace/api-server" run dev
```
