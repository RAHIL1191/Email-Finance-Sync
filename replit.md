# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Finance Tracker Mobile App

**Purpose**: Personal finance tracker with Gmail/email sync to auto-import bank transaction alerts.

**Artifacts**:
- `artifacts/mobile` — Expo React Native app (5 tabs: Home, Transactions, Accounts, Bills, AI Insights)
- `artifacts/api-server` — Express 5 backend with real IMAP email sync

**Email Sync Flow**:
1. User opens Accounts tab → taps "Connect Email"
2. Enters their email + App Password (not regular password)
3. Backend calls `/api/email/test` to verify credentials via IMAP
4. On success, user taps "Sync Now" → backend calls `/api/email/sync`
5. Backend connects to IMAP (Gmail: `imap.gmail.com:993`, Outlook: `outlook.office365.com:993`, Yahoo: `imap.mail.yahoo.com:993`)
6. Searches last 30 days for bank alert emails (Chase, BofA, Amex, Wells Fargo, Capital One, Citi + generic fallback)
7. Parses amounts and merchant names via regex in `emailParser.ts`
8. Returns transactions to app; deduplication by `amount-merchant-date`

**Key Files**:
- `artifacts/mobile/context/AppContext.tsx` — state, connectEmail, syncEmailTransactions
- `artifacts/api-server/src/routes/email.ts` — IMAP sync and test endpoints
- `artifacts/api-server/src/lib/emailParser.ts` — bank email parsing logic
- `artifacts/mobile/app/(tabs)/accounts.tsx` — EmailConnectModal UI
- `artifacts/mobile/constants/colors.ts` — design tokens (light + dark)

**Important**: Gmail requires an App Password (not regular password). User must enable 2FA + IMAP in Gmail settings. The `imapflow` and `mailparser` packages are marked as external in `build.mjs`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
