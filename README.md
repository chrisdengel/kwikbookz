# Ledger — local-first bookkeeping

A simple, fast, local-first bookkeeping app for a small-business owner who
finds QuickBooks unnecessarily complicated. Import bank statements,
auto-organize transactions with deterministic rules, reconcile accounts,
attach receipts, and produce reports — all running entirely in the browser
against IndexedDB. No cloud backend, no AI API, works offline after first
load.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS, hand-rolled shadcn-style primitives (`src/components/ui`)
- IndexedDB via `idb`, wrapped in `src/lib/db.ts`
- SheetJS (`xlsx`) for CSV/XLS/XLSX import and export
- `pdfjs-dist` for best-effort text-based PDF statement parsing (no OCR/AI)
- `jszip` for the portable backup/restore ZIP format
- Lightweight service worker (`public/sw.js`) for offline asset caching

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000. All data lives in your browser's
IndexedDB — nothing is sent to a server. Add an entity, add an account,
then either **Import Transactions** or **Add Transaction** manually.

## Deploying

Deploy as-is to Vercel (`vercel deploy`) or any static/edge host — there is
no server-side data layer to provision. The app is a static/edge-compatible
Next.js app; all bookkeeping logic runs client-side against IndexedDB.

## Architecture notes

- **Data model** — `src/lib/types.ts` defines every store (entities,
  accounts, transactions, categories, vendors, rules, reconciliation
  sessions, documents, import batches, settings, audit history).
- **Storage layer** — `src/lib/db.ts` is a thin, generic wrapper around
  `idb`. If cloud sync (Postgres/Supabase) is ever wanted, swap this file's
  internals without touching the rest of the app — every page calls the
  same `getAll` / `getOne` / `put` / `getByIndex` functions.
- **Rule engine** — `src/lib/rules.ts`. Fully deterministic, no AI. Rules
  are edited visually at `/rules` (WHEN / DO builder) and are applied
  before any heuristic suggestions during import. Conflicting
  entity/account assignments (e.g. the same last-four card registered
  under two entities) are flagged rather than guessed — see
  `findCardConflicts`.
- **Duplicate/overlap engine** — `src/lib/dedupe.ts`, using the matching
  hierarchy from the spec (external ID -> exact date+amount+description ->
  tolerant window -> none). This is what lets overlapping statement periods
  import cleanly without prompting for hundreds of individual duplicates.
- **Reconciliation** — `src/lib/reconcile.ts` calculates the expected
  ending balance and, when it doesn't match the statement, searches for the
  smallest set of transactions (single, then pair, then a short ranked
  list) that could explain the difference — instead of dumping the whole
  register on the user.
- **Import pipeline** — `src/lib/transactions.ts#runImportPipeline` wires
  together: card-based entity/account detection -> dedupe -> vendor
  normalization -> rule application -> CAPEX threshold flagging -> exception
  surfacing.
- **PDF statements** — `src/lib/pdf-import.ts` does a conservative,
  line-based text extraction (date + description + amount per line). If a
  statement doesn't parse cleanly (e.g. it's a scanned image), the app says
  so explicitly and asks for CSV/Excel instead of guessing at transactions.
- **Backup/restore** — `src/lib/backup.ts` builds the exact ZIP layout from
  the spec (`database.json`, `transactions.csv/json`, per-entity CSVs,
  `rules.json`, `documents/`, empty `statements/` and `reports/` folders
  for the user's own files). Restore rebuilds IndexedDB — including
  document blobs — from that ZIP in a fresh browser.
- **Reports** — `src/lib/reports.ts` computes P&L, expense by
  category/vendor, account activity, cash flow, a simple balance sheet,
  project profitability, and a tax-documentation-missing report. Every
  report table exports to CSV or XLSX from `/reports`.
- **Search** — `src/lib/search.ts` supports the special tokens from the
  spec ("uncategorized", "no receipt", "potential capex", "unreconciled",
  "$2,500+", month names) alongside free text, across transactions,
  vendors, accounts, and projects.
- **Deterministic "assistant" queries** — the same search/report layer
  answers the plain-language queries called out in the spec ("show
  uncategorized transactions", "expenses over $2,500", etc.) without any
  external AI call. `src/lib/search.ts` and `src/lib/reports.ts` are the
  natural place to plug in a real AI assistant later — they already return
  structured results, not just UI.

## What's intentionally simple in this V1

- PDF parsing is best-effort text extraction, not OCR — scanned statements
  are rejected with a clear message rather than guessed at.
- Receipts are stored as-is with no data extraction (no OCR/AI), per spec.
- The rule engine's "flag potential CAPEX" and the automatic
  threshold-based flag both stop at *flagging* — nothing is ever
  auto-capitalized, and the UI carries a disclaimer that capitalization and
  tax treatment depend on the taxpayer's specific circumstances.
- No cloud sync yet. The storage layer is isolated specifically so this can
  be added later (e.g. swap `src/lib/db.ts` for a Postgres/Supabase-backed
  implementation) without reworking every page.

## Suggested next steps (post-V1)

Item 17 from the build order — PWA polish, better offline UX, and a
service-worker precache list — plus a proper icon set for `manifest.json`
(placeholders are referenced but not included). After that, the natural
extension point for an AI assistant is `src/lib/search.ts`.
