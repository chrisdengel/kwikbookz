# Ledger — local-first bookkeeping

A fast, local-first bookkeeping app for a small-business owner who finds
QuickBooks unnecessarily complicated. It imports bank transactions,
organizes them with deterministic (non-AI) rules, reconciles accounts,
attaches supporting documents, and produces the reports you actually need —
all stored in your browser via IndexedDB, and fully usable offline once loaded.

## Getting started (local development)

```bash
npm install
npm run dev
```

Open http://localhost:3000. All data is stored in your browser's IndexedDB —
nothing is sent to a server, and there is no login.

## Deploying

This is a static/edge-compatible Next.js app with no required backend —
deploy it to Vercel:

```bash
npx vercel deploy
```

or connect the repo in the Vercel dashboard. No environment variables or
database connection are required for V1.

## What's implemented (V1 priority order)

1. **Data model** — `src/lib/types.ts`
2. **IndexedDB storage layer** — `src/lib/db.ts` (via `idb`)
3. **Entities** — unlimited, with an entity selector and an "All Entities"
   consolidated view (`/entities`)
4. **Accounts/cards** — one entity each, with last-four tracking and
   automatic conflict detection when the same card number is registered
   under more than one entity (`/accounts`)
5. **Transaction engine** — full field set, manual entry and editing
   (`/transactions`, `src/lib/transactions.ts`)
6. **CSV import** — `src/lib/csv-import.ts` (SheetJS)
7. **XLS/XLSX import** — same pipeline, same file
8. **Rule engine** — fully deterministic, user-editable, visible rules with
   a WHEN/DO builder UI (`/rules`, `src/lib/rules.ts`). No AI involved.
9. **Duplicate/overlap detection** — exact-ID → exact-fields → tolerant
   matching hierarchy so overlapping statement periods import cleanly
   without hundreds of manual duplicate reviews (`src/lib/dedupe.ts`)
10. **Account reconciliation** — beginning/ending balance math, and when
    there's a difference, a search for the smallest set of transactions
    that could explain it rather than dumping the whole register on the
    user (`/reconcile`, `src/lib/reconcile.ts`)
11. **Vendor normalization** — alias-based merchant matching
    (`/vendors`, `src/lib/vendors.ts`)
12. **Reports** — P&L, Expense by Category, Expense by Vendor, Account
    Activity, Cash Flow, Balance Sheet, Project Profitability, Tax
    Documentation Report — all filterable by date range / entity / account
    / category, exportable to CSV and XLSX (`/reports`, `src/lib/reports.ts`)
13. **Receipt/document attachment** — JPG/PNG/HEIC/PDF, stored as blobs in
    IndexedDB, no OCR (`/documents`, attach button on each transaction row)
14. **Backup/restore** — a portable ZIP (`database.json` +
    `transactions.csv` + `accounts.csv` + `entities.csv` + `vendors.csv` +
    `categories.csv` + `rules.json` + `documents/` folder) that can restore
    into a fresh browser (`src/lib/backup.ts`, Backup Now / Restore in the
    top bar and in Settings)
15. **PDF import** — best-effort line-based text extraction for text-based
    statements (`src/lib/pdf-import.ts`); if a statement can't be reliably
    parsed (e.g. it's scanned), the app says so and asks for CSV/Excel
    instead — it never invents transactions
16. **Projects** — optional, with a simple profitability view (`/projects`)
17. **Offline/PWA polish** — a manifest and a shell-caching service worker
    (`public/manifest.json`, `public/sw.js`) so the app keeps working after
    the first load with no connection

Also included: CAPEX threshold flagging (configurable in Settings, never
auto-classified — you choose Expense / Capitalize / Review Later), transfer
pair suggestion (`src/lib/transfers.ts`), a lightweight local audit log
(written on create/edit/delete/reconcile/rule application via
`logAudit` in `src/lib/db.ts`), and global search supporting free text plus
tokens like `uncategorized`, `needs review`, `no receipt`,
`potential capex`, `unreconciled`, `$2,500+`, and month names
(`src/lib/search.ts`).

## What's intentionally simple in V1

- **No AI.** Card→entity/account assignment, vendor normalization, and all
  categorization run on deterministic rules you can see and edit. The data
  model leaves room for a future AI assistant to be layered on without a
  rebuild — but nothing calls out to an external API in V1.
- **No cloud sync.** Everything lives in this browser's IndexedDB. The
  storage layer (`src/lib/db.ts`) is a thin, swappable data-access layer so
  a Postgres/Supabase backend could be added later if you ever want sync
  across devices — but V1 intentionally does not require one.
- **No receipt OCR.** Attach a receipt; the app doesn't try to read it.
- **PDF import is conservative.** It only handles text-based, roughly
  one-line-per-transaction statement layouts. Anything else is rejected
  with a clear message rather than guessed at.

## Your data is portable

Use **Backup Now** (top bar, or Settings) regularly — it downloads a ZIP
you can restore into any browser with **Restore Backup**. You are never
locked into this application.

## Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · IndexedDB (via
`idb`) · SheetJS (`xlsx`) for CSV/Excel · `pdfjs-dist` for PDF text
extraction · JSZip for backup/restore · lucide-react icons.
