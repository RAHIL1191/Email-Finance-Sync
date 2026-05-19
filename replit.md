# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation**: Zod (manual schemas in `lib/db/src/schema/`)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Finance Tracker Mobile App

**Purpose**: Personal finance tracker with Gmail/email sync to auto-import bank transaction alerts.

**Artifacts**:
- `artifacts/mobile` — Expo React Native app (5 tabs: Home, Transactions/Insights, Accounts, Bills, AI Insights)
- `artifacts/api-server` — Production-grade Express 5 backend with security, feature flags, CRUD API, and real IMAP email sync

---

## Backend Architecture (`artifacts/api-server`)

### Security Middleware (`src/middlewares/security.ts`)
- **Helmet**: Security headers (X-Content-Type-Options, Strict-Transport-Security, etc.)
- **CORS**: Open in dev, `ALLOWED_ORIGINS` env var controls production origins
- **Rate limiting**: 200 req/15min general; 10 req/min for email sync (strict)

### Validation Middleware (`src/middlewares/validate.ts`)
- `validate(schema)` — Zod schema validation factory; rejects with 400 + field errors
- `requireDeviceId` — Enforces `X-Device-ID` header; attaches to `res.locals.deviceId`

### Feature Flags (`src/config/features.ts`)
All flags are env-var controlled. Set `FEATURE_<NAME>=false` to disable any feature:

| Env Var | Default | Controls |
|---|---|---|
| `FEATURE_EMAIL_SYNC` | `true` | Gmail/IMAP sync. When disabled, `/api/email/*` returns 403 |
| `FEATURE_MANUAL_TRANSACTIONS` | `true` | Manual transaction entry |
| `FEATURE_ACCOUNTS` | `true` | Accounts management |
| `FEATURE_BILLS` | `true` | Bills tracking |
| `FEATURE_AI_INSIGHTS` | `true` | AI insights tab |
| `FEATURE_INSIGHTS` | `true` | Cash flow / spending insights |
| `FEATURE_BUDGET` | `true` | Budget tracking |
| `FEATURE_EXPORT` | `true` | Data export |
| `FEATURE_BACKEND_SYNC` | `true` | Backend persistence sync |

### API Routes (`src/routes/`)

```
GET  /api/healthz                  — Health check (public)
GET  /api/config/features          — Feature flags (public)

GET  /api/accounts                 — List accounts (X-Device-ID required)
POST /api/accounts                 — Create account
PUT  /api/accounts/:id             — Update account
DEL  /api/accounts/:id             — Delete account

GET  /api/transactions             — List transactions (X-Device-ID required)
POST /api/transactions             — Create transaction
POST /api/transactions/bulk        — Upsert many (used for email sync import)
PUT  /api/transactions/:id         — Update transaction
DEL  /api/transactions/:id         — Delete transaction

GET  /api/bills                    — List bills (X-Device-ID required)
POST /api/bills                    — Create bill
PUT  /api/bills/:id                — Update bill
POST /api/bills/:id/pay            — Mark bill as paid
DEL  /api/bills/:id                — Delete bill

POST /api/email/sync               — IMAP sync (feature-flagged, strict rate limit)
POST /api/email/test               — Test email credentials
```

### Data Isolation
Each device gets a permanent UUID (`@fintrack/deviceId` in AsyncStorage). This is sent as the `X-Device-ID` header with every API request. All server-side queries filter by this ID.

---

## Database Schema (`lib/db/src/schema/`)

Three tables defined with Drizzle + manual Zod schemas (no drizzle-zod due to version conflict):

- `accounts` — user bank accounts
- `transactions` — income/expense records
- `bills` — recurring bills tracker

Run `pnpm --filter @workspace/db run push` to apply schema changes to the database.

---

## Mobile Architecture (`artifacts/mobile`)

### Contexts
- **`FeatureFlagsContext.tsx`** — Fetches flags from `/api/config/features` on startup, caches in AsyncStorage for 5 minutes, provides `useFeatureFlags()` and `useFeature(key)` hooks
- **`AppContext.tsx`** — Primary state store. Loads from AsyncStorage first (offline support), syncs writes to backend fire-and-forget. Provides all CRUD operations.

### Data Sync Strategy
1. On startup: load from AsyncStorage immediately (fast, works offline)
2. On write: update state + AsyncStorage synchronously, then fire-and-forget API call
3. Email sync: imports via backend IMAP, deduplicates, bulk-syncs to API

### Email Sync Flow
1. User opens Accounts tab → taps "Connect Email"
2. Enters email + App Password (Gmail: requires 2FA + IMAP enabled + App Password)
3. App calls `/api/email/test` to verify via IMAP
4. User taps "Sync Now" → `/api/email/sync` connects to IMAP, fetches last 30 days
5. Supports Gmail (`imap.gmail.com:993`), Outlook, Yahoo, iCloud
6. Parses amounts via regex in `emailParser.ts`; deduplicates by `amount-merchant-date`
7. Bulk-upserts fresh transactions to backend

---

## Key Files

- `artifacts/api-server/src/config/features.ts` — Feature flags (edit to add new flags)
- `artifacts/api-server/src/middlewares/security.ts` — Helmet, CORS, rate limiting
- `artifacts/api-server/src/middlewares/validate.ts` — Zod validation + device ID middleware
- `artifacts/api-server/src/routes/index.ts` — Route registration + feature flag gating
- `lib/db/src/schema/` — Drizzle table definitions and Zod schemas
- `artifacts/mobile/context/FeatureFlagsContext.tsx` — Feature flag provider for mobile
- `artifacts/mobile/context/AppContext.tsx` — Main app state + API sync
- `artifacts/mobile/app/_layout.tsx` — Provider tree (FeatureFlags > App)
- `artifacts/api-server/src/lib/emailParser.ts` — Bank email parsing logic

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run before api-server typecheck)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Local Development (Windows)

### Running on Windows
1. **Preinstall fix**: The root `preinstall` script was removed as it required `sh`.
2. **Env Files**: Use the root `.env` file. The backend uses `node --env-file=.env` (Node 24+ required).
3. **Expo IP**: To use your local IP for mobile testing, set:
   `$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.2.19"`
   Then run: `pnpm --filter @workspace/mobile exec expo start --lan`

### Tab Bar Fix
If the tab bar is hidden behind system buttons, ensured `ClassicTabLayout` in `app/(tabs)/_layout.tsx` uses `useSafeAreaInsets`.

