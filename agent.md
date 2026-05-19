# FinTrack — Complete Project Reference

## Overview

**FinTrack** is a full-stack personal/household finance management app that automatically imports transactions from email (Gmail IMAP) and bank connections (Plaid), allows manual entry, tracks bills/budgets/goals, and provides AI-powered spending insights. It uses a local-first architecture (AsyncStorage on mobile) synced with a PostgreSQL backend via REST API.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile App** | React Native 0.81 + Expo SDK 54, Expo Router 6 (file-based routing) |
| **Language** | TypeScript 5.9 throughout |
| **API Server** | Express 5, Node.js (ESM), esbuild bundled |
| **Database** | PostgreSQL (Neon serverless), Drizzle ORM |
| **AI (cloud)** | OpenRouter API (OpenAI SDK compatible) — Llama 3.3 70B default, swappable to Claude/Gemini/Mistral |
| **AI (on-device)** | llama.rn (Phi-3-mini 4bit GGUF), runs fully offline on mobile |
| **Bank Sync** | Plaid SDK v42 (production environment) |
| **Email Sync** | IMAP via imapflow + mailparser (Gmail, Outlook, Yahoo, iCloud) |
| **State Management** | React Context + AsyncStorage (local-first) |
| **Server Queries** | TanStack React Query v5 |
| **Styling** | React Native StyleSheet, custom design tokens (light/dark), Inter font family |
| **Navigation** | Expo Router (file-based), native tabs (iOS liquid glass), classic tabs (Android) |
| **Animations** | React Native Reanimated 4, Gesture Handler |
| **Notifications** | expo-notifications (bill reminders, task reminders) |
| **Monorepo** | pnpm workspaces (pnpm 11) |
| **Validation** | Zod 3.25 (shared schemas between client and server) |
| **Logging** | Pino + pino-http |
| **Security** | Helmet, CORS, express-rate-limit |

---

## Project Structure

```
Email-Finance-Sync/
├── artifacts/
│   ├── api-server/         # Express REST API (backend)
│   ├── mobile/             # Expo React Native app (frontend)
│   └── mockup-sandbox/     # UI mockup sandbox (Vite web app)
├── lib/
│   ├── db/                 # Drizzle schema + DB client (shared)
│   ├── api-zod/            # Shared Zod validation schemas
│   ├── api-client-react/   # React Query hooks for API consumption
│   ├── integrations-openrouter-ai/  # OpenRouter AI client wrapper
│   └── integrations/       # Other integration packages
├── scripts/                # Build/deploy scripts
├── pnpm-workspace.yaml     # Workspace definition + catalog deps
├── tsconfig.base.json      # Shared TS config
└── package.json            # Root workspace package
```

---

## API Server (`artifacts/api-server/`)

### Entry Point
- `server.mjs` → imports built dist, starts Express on `PORT` (default 80)
- `src/app.ts` → Express app setup (helmet, CORS, rate-limit, pino, JSON body parser)
- `src/routes/index.ts` → route registration with feature flags

### API Routes (all prefixed `/api`)

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check |
| `/config/features` | GET | Returns enabled feature flags |
| `/accounts` | CRUD | Bank accounts management |
| `/transactions` | CRUD | Transaction CRUD |
| `/bills` | CRUD | Bills management |
| `/categories` | CRUD | Category management (per household) |
| `/category-rules` | CRUD | Auto-categorization rules |
| `/email/sync` | POST | Connect IMAP, scan emails, parse transactions |
| `/email/debug` | POST | Debug email parsing |
| `/plaid/link-token` | POST | Create Plaid Link token |
| `/plaid/exchange` | POST | Exchange public token for access token |
| `/plaid/sync` | POST | Sync transactions from Plaid |
| `/plaid/accounts` | GET | List Plaid-connected accounts |
| `/plaid/link-page` | GET | Plaid Link popup HTML page |
| `/ai/review` | POST | AI-powered spending review (rate-limited) |
| `/ai/chat` | POST | Conversational financial AI assistant (rate-limited) |

### Authentication Model
- **Household-based**: All routes requiring data access use `X-Household-ID` header
- **No user auth**: Designed for family/household use — any device with the household code sees the same data
- `X-Device-ID` header for per-device attribution

### Middleware
- `requireHouseholdId` — validates household header, attaches to `res.locals`
- `validate(zodSchema)` — body validation via Zod
- `helmetMiddleware` — security headers
- `corsMiddleware` — CORS with `ALLOWED_ORIGINS`
- `generalRateLimit` / `strictRateLimit` — rate limiting

### Email Parser (`src/lib/parser/`)
- Parses Canadian bank email notifications (TD, BMO, CIBC, RBC, Scotiabank, etc.)
- Extracts: amount, merchant, bank, last-four digits, transaction type
- Supports forwarded email detection
- Uses regex-based pattern matching with bank identification

### Feature Flags
Controlled via environment variables (`FEATURE_<NAME>=true|false`):
- `emailSync`, `plaidSync`, `manualTransactions`, `accounts`, `bills`
- `aiInsights`, `insights`, `budget`, `export`, `backendSync`

---

## Mobile App (`artifacts/mobile/`)

### App Name: **FinTrack**
- Package: `com.rahil1191.mobile`
- New Architecture enabled
- React Compiler enabled (experimental)
- Typed routes enabled

### Navigation (Tabs)

| Tab | File | Description |
|-----|------|-------------|
| **Home** | `app/(tabs)/index.tsx` | Dashboard — balances, monthly summary, recent transactions, quick actions |
| **Transactions** | `app/(tabs)/transactions.tsx` | Full transaction list with filters, search, bulk actions |
| **Accounts** | `app/(tabs)/accounts.tsx` | Bank accounts list, Plaid connection, email sync |
| **Bills** | `app/(tabs)/bills.tsx` | Bill tracking, payment status, recurring bills |
| **Budget** | `app/(tabs)/budget.tsx` | Budget categories, spending vs budget, goals |
| **Insights** | `app/(tabs)/insights.tsx` | AI-powered spending analysis, charts |
| **Tasks** | `app/(tabs)/tasks.tsx` | Financial tasks/todos (hidden tab, accessible via drawer) |

### Additional Screens

| Screen | Description |
|--------|-------------|
| `ai-review.tsx` | AI review of large expenses |
| `refunds.tsx` | Track refund status for transactions |
| `projects.tsx` | Group transactions by project |
| `project-detail.tsx` | Project spending breakdown |
| `notifications.tsx` | Notification history |
| `email-debug.tsx` | Debug email parsing results |
| `account/[id].tsx` | Single account detail |

### Context Providers (wrap entire app)

1. **`FeatureFlagsProvider`** — Fetches feature flags from server, caches in AsyncStorage (5min TTL)
2. **`AppProvider`** (AppContext) — Main state: transactions, accounts, bills, budgets, goals, projects, categories, tasks, email/plaid sync state. All persisted to AsyncStorage.
3. **`AIProviderProvider`** — Manages AI mode (local vs API), model download, llama.rn inference
4. **`DrawerProvider`** — Navigation drawer state
5. **`QueryClientProvider`** — TanStack React Query

### Key Components

| Component | Purpose |
|-----------|---------|
| `AddEntrySheet` | Universal add form (transaction, bill, transfer) |
| `PlaidLinkModal` | Plaid Link integration flow |
| `AddAccountModal` | Manual account creation |
| `TransactionDetailModal` | Full transaction view/edit |
| `TransactionFilterModal` | Advanced filtering |
| `BillDetailSheet` / `EditBillSheet` | Bill management |
| `CategoryPickerModal` | Category selection with hierarchy |
| `AIChatPanel` | In-app AI chat interface |
| `ModelDownloadGate` | Gate for on-device AI model download |
| `MonthDetailModal` | Monthly spending breakdown |
| `Drawer` | Side navigation drawer |
| `ErrorBoundary` / `ErrorFallback` | Error handling UI |

---

## Data Models

### Transaction
```typescript
{
  id, title, merchant?, amount, type ("income"|"expense"),
  category, accountId, date, source ("plaid"|"email"|"manual"),
  bank?, note?, receipts?, projectId?, projectName?,
  isRefund?, isRefundComplete?, plaidItemId?, plaidAccountId?,
  splitGroupId?
}
```

### Account
```typescript
{
  id, name, bank, balance, type ("checking"|"savings"|"credit"|"investment"),
  color, lastFour?, currency?, includeInNetworth?, isJoint?,
  accountHolder?, plaidItemId?, plaidAccountId?
}
```

### Bill
```typescript
{
  id, title, amount, dueDate, category, isPaid, isRecurring,
  frequency? ("daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"semiannual"|"yearly"),
  accountId?, receipts?, notes?, remindDays?, autoPaid?, billNumber?
}
```

### Budget
```typescript
{ id, name, amount, category?, type ("expense"|"income"), period ("weekly"|"monthly"|"yearly"), includeInOverall, color? }
```

### Goal
```typescript
{ id, name, targetAmount, currentAmount, targetDate?, category?, color?, notes? }
```

### Task
```typescript
{ id, title, category, email?, paymentMode?, dueDate, notes?, priority ("low"|"medium"|"high"), isCompleted, reminderEnabled, reminderDate? }
```

### Project
```typescript
{ id, name, description?, color }
```

### Category
```typescript
{ id, householdId, name, description?, type ("expense"|"income"|"both"), icon?, iconType?, color, parentId?, providerType?, merchantType?, isDefault? }
```

### CategoryRule
```typescript
{ id, householdId, merchantPattern, merchantExact?, category, hitCount, source ("manual"|"learned") }
```

---

## What's Stored Locally (AsyncStorage on device)

All primary data lives in AsyncStorage under `@fintrack/` prefix:

| Key | Data |
|-----|------|
| `@fintrack/transactions` | All transactions array |
| `@fintrack/accounts` | All accounts array |
| `@fintrack/bills` | All bills array |
| `@fintrack/budgets` | All budgets array |
| `@fintrack/goals` | All goals array |
| `@fintrack/projects` | All projects array |
| `@fintrack/categories` | All categories array |
| `@fintrack/categoryRules` | Auto-categorization rules |
| `@fintrack/tasks` | Financial tasks |
| `@fintrack/emailSync` | Email connection config (email, appPassword, sync state) |
| `@fintrack/plaidSync` | Connected Plaid items with account mappings |
| `@fintrack/deviceId` | Unique device identifier |
| `@fintrack/householdId` | Shared household/family code |
| `@fintrack/userName` | User display name |
| `@fintrack/reviewedTransactionIds` | IDs of AI-reviewed transactions |
| `@fintrack/featureFlags` | Cached feature flags from server |
| `@fintrack/storageVersion` | Storage migration version (currently "2") |

**On-device AI model** is stored in the app's document directory:
- `phi3-mini-q4.gguf` (~2.2 GB) — downloaded from HuggingFace on demand

---

## What's on the Server (PostgreSQL via Neon)

Database tables (Drizzle schema in `lib/db/src/schema/`):

| Table | Purpose |
|-------|---------|
| `accounts` | Persisted bank accounts |
| `transactions` | Persisted transactions |
| `bills` | Persisted bills |
| `categories` | Category definitions per household |
| `category_rules` | Auto-categorization rules per household |
| `plaid_items` | Plaid connection metadata (access tokens, item IDs) |
| `conversations` | AI chat conversation history |
| `messages` | Individual AI chat messages |

The server also handles:
- **Plaid access tokens** — stored securely in `plaid_items` table
- **Email parsing** — done server-side via IMAP (credentials sent per-request, not stored on server)
- **AI inference** — proxied through OpenRouter API

---

## Shared Libraries (`lib/`)

| Package | Purpose |
|---------|---------|
| `@workspace/db` | Drizzle ORM client + PostgreSQL schema definitions |
| `@workspace/api-zod` | Shared Zod schemas for request/response validation |
| `@workspace/api-client-react` | React Query hooks wrapping API calls |
| `@workspace/integrations-openrouter-ai` | OpenAI-compatible client configured for OpenRouter (with retry + concurrency) |

---

## AI System

### Cloud Mode (default: `mode = "api"`)
- Mobile sends chat messages + financial context to `/api/ai/chat`
- Server uses OpenRouter (configurable model via `AI_MODEL` env var)
- Supports: Llama 3.3 70B, Claude 3.5 Sonnet, Gemini 1.5 Pro, Mistral, GPT-4o, etc.
- Also supports local Ollama by changing base URL to `localhost:11434`

### On-Device Mode (`mode = "local"`)
- Downloads Phi-3-mini 4bit GGUF model (~2.2GB) to device
- Runs inference via `llama.rn` with 2048 context, 4 threads
- Fully offline — no API calls needed
- `ModelDownloadGate` component shows download progress

### AI Features
1. **AI Chat** — Conversational assistant with full financial context
2. **AI Review** — Analyzes large expenses, scores spending patterns
3. **Auto-categorization** — Learned rules from user behavior (local, no AI needed)

---

## Key Integrations

### Plaid (Bank Connection)
- Production environment (real bank accounts)
- Products: `transactions`
- Countries: US, CA
- Flow: Create Link Token → Open Plaid Link → Exchange Token → Sync Transactions
- Supports multiple bank connections per household
- Server stores access tokens; mobile stores account mappings

### Email Sync (IMAP)
- Connects to Gmail/Outlook/Yahoo/iCloud via IMAP
- Scans last 90 days of bank notification emails
- Parses Canadian bank formats (TD, BMO, CIBC, RBC, Scotiabank, Tangerine, etc.)
- Extracts transaction details from email subject/body
- App password required (not OAuth)

### Notifications
- Bill due date reminders (configurable days before)
- Task reminders at specified date/time
- Uses `expo-notifications` with local scheduling

---

## Environment Variables

### Server (`artifacts/api-server/.env`)
```
PORT=80
DATABASE_URL=postgresql://...
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=production
AI_INTEGRATIONS_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_INTEGRATIONS_OPENROUTER_API_KEY=sk-or-...
AI_MODEL=meta-llama/llama-3.3-70b-instruct
FEATURE_*=true|false (feature flags)
ALLOWED_ORIGINS=http://localhost:8081,...
```

### Mobile (`artifacts/mobile/.env`)
```
EXPO_PUBLIC_API_URL=http://<server-ip>:80
EXPO_PUBLIC_DOMAIN=<server-ip>:80
```

---

## Build & Run

```bash
# Install dependencies (from repo root)
pnpm install

# Run API server
cd artifacts/api-server && pnpm dev

# Run mobile app
cd artifacts/mobile && npx expo start

# Build Android
cd artifacts/mobile && npx expo run:android

# Push DB schema
cd lib/db && pnpm push

# Type check everything
pnpm run typecheck
```

---

## Architecture Decisions

1. **Local-first**: All data is stored in AsyncStorage first, then synced to backend. App works fully offline.
2. **Household model**: No individual user auth. A shared household code groups all family members' data together.
3. **Feature flags**: Server controls which features are visible. Mobile caches flags with 5-min TTL.
4. **Dual AI**: API mode for powerful cloud models, local mode for privacy/offline use.
5. **Monorepo**: Shared packages (`db`, `api-zod`, `api-client-react`) keep types and validation in sync between frontend and backend.
6. **Category learning**: App tracks merchant→category mappings and auto-suggests categories based on transaction title patterns.
