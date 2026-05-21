# System Architecture

## Overview

This is a personal finance app with three primary services:

| Service | Location | Purpose |
|---|---|---|
| **Mobile App** | `artifacts/mobile/` | React Native / Expo — the user-facing app |
| **API Server** | `artifacts/api-server/` | Node.js / Express — business logic, Plaid integration, AI, email |
| **Database** | Neon (Postgres) via Drizzle ORM | Persistent storage for all data |

---

## Service Map

```
┌────────────────────────────────────────────────────────────┐
│                     Mobile App (Expo)                      │
│  AppContext (global state) ──── AsyncStorage (local cache) │
│        │                                                   │
│        │ HTTP (X-Household-ID, X-Device-ID headers)        │
│        ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               API Server (Express on Render)        │   │
│  │  /api/accounts        /api/transactions             │   │
│  │  /api/bills           /api/budgets                  │   │
│  │  /api/goals           /api/tasks                    │   │
│  │  /api/categories      /api/category-rules           │   │
│  │  /api/plaid/*         /api/email/*                  │   │
│  │  /api/ai-review       /api/ai-chat                  │   │
│  └──────┬──────────────────────┬────────────────────────┘  │
│         │                      │                           │
│    ┌────▼────┐           ┌─────▼─────┐                     │
│    │  Neon   │           │  Plaid /  │                     │
│    │Postgres │           │  OpenAI / │                     │
│    │   DB    │           │  IMAP     │                     │
│    └─────────┘           └───────────┘                     │
└────────────────────────────────────────────────────────────┘
```

---

## Authentication

All routes (except `/health`, `/config`, `/plaid/link-page`, `/bill-check`) require two headers:

- `X-Household-ID` — shared household identifier (stored in AsyncStorage)
- `X-Device-ID` — unique per device (stored in AsyncStorage)

These headers are set automatically by `apiCall()` in `AppContext.tsx`.

---

## Data Flow: App Startup

```
1. App launches → _layout.tsx bootstraps AppProvider
2. AppProvider useEffect reads AsyncStorage:
   - householdId, deviceId, transactions, accounts, bills, budgets,
     goals, categories, categoryRules, plaidSync, emailSync, tasks,
     investmentTransactions, holdings, userName, reviewedTransactionIds
3. Background fetches (non-blocking, parallel):
   - GET /api/transactions    → merge server + local (upsertTransactions)
   - GET /api/accounts        → merge server + local; auto-POST missing accounts
   - GET /api/categories      → load or seed defaults
   - GET /api/category-rules  → load rules
4. setInitialized(true) → app renders
```

---

## Data Sources

| Data Type | Source | Stored In |
|---|---|---|
| Regular transactions | Plaid, Email, Manual | DB + AsyncStorage |
| Investment transactions | Plaid only | AsyncStorage only |
| Holdings (positions) | Plaid only | AsyncStorage only |
| Accounts | Plaid (auto), Manual | DB + AsyncStorage |
| Bills | Manual | DB + AsyncStorage |
| Budgets / Goals | Manual | DB + AsyncStorage |
| Tasks | Manual | DB + AsyncStorage |
| Categories | Seeded + custom | DB + AsyncStorage |
| Category rules | Manual | DB + AsyncStorage |

---

## Key Files Reference

| File | Role |
|---|---|
| `artifacts/mobile/context/AppContext.tsx` | Central state, all sync functions, AsyncStorage persistence |
| `artifacts/mobile/app/(tabs)/_layout.tsx` | Tab bar navigation definition |
| `artifacts/mobile/app/_layout.tsx` | Root stack navigator, AppProvider wrapper |
| `artifacts/api-server/src/routes/plaid.ts` | All Plaid API integration (connect, sync, disconnect) |
| `artifacts/api-server/src/routes/email.ts` | IMAP email scraping + transaction parsing |
| `artifacts/api-server/src/routes/transactions.ts` | CRUD for transactions |
| `artifacts/api-server/src/routes/accounts.ts` | CRUD for accounts |
| `artifacts/api-server/src/lib/` | DB schema, Drizzle client, Plaid client, AI client |

---

## Feature Flags

Controlled via environment variables, checked in `artifacts/api-server/src/config/features.ts`:

- `ENABLE_EMAIL_SYNC` — enables `/api/email/*` routes
- `ENABLE_PLAID_SYNC` — enables `/api/plaid/*` routes

---

## Deployment

- **API Server** → Render (auto-deploy on `main` branch push via `render.yaml`)
- **Mobile App** → Expo Go (dev) / EAS Build (production APK/IPA)
- **Database** → Neon serverless Postgres (connection string in `.env`)
