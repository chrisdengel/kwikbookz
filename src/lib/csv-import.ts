import * as XLSX from "xlsx";
import type { ColumnMapping } from "./types";
import { parseFlexibleAmount, parseFlexibleDate } from "./format";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  headerRowIndex: number; // 0-based index into the raw sheet where headers were found
  skippedPreambleRows: unknown[][]; // rows above the detected header, for a "does this look right?" preview
}

// Header rows for bank/card exports almost always contain at least a couple
// of these words. A title block ("Transaction Details", "Prepared for",
// account numbers, etc.) won't match any of them, which is what lets us
// tell the two apart.
const HEADER_KEYWORDS = [
  "date", "description", "amount", "debit", "credit", "withdrawal", "deposit",
  "memo", "payee", "merchant", "balance", "transaction", "reference", "receipt",
  "category", "type", "posted",
];

function scoreRowAsHeader(row: unknown[]): number {
  let score = 0;
  let hasDateLike = false;
  let hasAmountLike = false;
  for (const cell of row) {
    if (typeof cell !== "string") continue;
    const lower = cell.trim().toLowerCase();
    if (!lower) continue;
    if (HEADER_KEYWORDS.some((k) => lower.includes(k))) {
      score++;
      if (lower.includes("date")) hasDateLike = true;
      if (lower.includes("amount") || lower.includes("debit") || lower.includes("credit")) hasAmountLike = true;
    }
  }
  // Require at least a date-ish AND an amount-ish column — a row that only
  // says "Description" (e.g. a stray label) shouldn't outrank the real header.
  if (!hasDateLike || !hasAmountLike) return 0;
  return score;
}

/**
 * Bank and credit-card exports frequently prepend a title block (account
 * name, statement period, "Prepared for", account number, blank rows)
 * before the real header row. Blindly treating row 1 as the header — as a
 * naive spreadsheet import does — silently produces garbage column names
 * and, downstream, zero importable transactions. This scans the first 20
 * rows and picks whichever one looks most like a real transaction header.
 */
function findHeaderRowIndex(rawRows: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = 0;
  const searchLimit = Math.min(rawRows.length, 20);
  for (let i = 0; i < searchLimit; i++) {
    const score = scoreRowAsHeader(rawRows[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore > 0 ? bestIndex : 0;
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  const headerRowIndex = findHeaderRowIndex(rawRows);
  const headerRow = (rawRows[headerRowIndex] ?? []) as unknown[];
  const headers = headerRow.map((h, i) => (String(h).trim() ? String(h).trim() : `Column ${i + 1}`));

  const dataRows = rawRows.slice(headerRowIndex + 1);
  const rows: Record<string, unknown>[] = dataRows
    .filter((r) => r.some((cell) => cell !== "" && cell !== undefined && cell !== null))
    .map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
      return obj;
    });

  return {
    headers,
    rows,
    headerRowIndex,
    skippedPreambleRows: rawRows.slice(0, headerRowIndex),
  };
}

// A stable signature for a header row, used to auto-recall a saved column
// mapping the next time a statement from the same bank export is dropped in.
export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .sort()
    .join("|");
}

export function guessMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = lower.findIndex((h) => h.includes(c));
      if (idx >= 0) return headers[idx];
    }
    return undefined;
  };
  return {
    date: find("date", "posted"),
    description: find("description", "memo", "payee", "merchant"),
    debit: find("debit", "withdrawal"),
    credit: find("credit", "deposit"),
    amount: find("amount"),
    externalId: find("transaction id", "reference", "id"),
    amountSignConvention: "negative-is-debit",
  };
}

export interface NormalizedImportRow {
  date: string;
  postedDate?: string;
  description: string;
  amount: number; // magnitude
  direction: "debit" | "credit";
  externalId?: string;
  merchantHint?: string;
  memo?: string;
  categoryHint?: string;
  extraFields?: Record<string, string>;
  originalData: Record<string, unknown>;
}

export interface SkipReason {
  row: Record<string, unknown>;
  reason: "missing date" | "missing description" | "missing or zero amount" | "unparseable date" | "unparseable amount";
}

export interface NormalizeResult {
  rows: NormalizedImportRow[];
  skipped: SkipReason[];
}

export function normalizeRowsWithDiagnostics(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): NormalizeResult {
  const convention = mapping.amountSignConvention ?? "negative-is-debit";
  const result: NormalizedImportRow[] = [];
  const skipped: SkipReason[] = [];

  for (const row of rows) {
    const dateRaw = mapping.date ? row[mapping.date] : undefined;
    const date = mapping.date ? parseFlexibleDate(dateRaw) : "";
    const description = mapping.description ? String(row[mapping.description] ?? "").trim() : "";

    let amount = 0;
    let direction: "debit" | "credit" = "debit";
    let amountFound = false;

    if (mapping.amount && row[mapping.amount] !== undefined && row[mapping.amount] !== "") {
      const raw = parseFlexibleAmount(row[mapping.amount]);
      amount = Math.abs(raw);
      const negativeIsDebit = convention === "negative-is-debit";
      direction = (raw < 0) === negativeIsDebit ? "debit" : "credit";
      amountFound = amount > 0;
    } else {
      const debitVal = mapping.debit ? parseFlexibleAmount(row[mapping.debit]) : 0;
      const creditVal = mapping.credit ? parseFlexibleAmount(row[mapping.credit]) : 0;
      if (debitVal) {
        amount = Math.abs(debitVal);
        direction = "debit";
        amountFound = true;
      } else if (creditVal) {
        amount = Math.abs(creditVal);
        direction = "credit";
        amountFound = true;
      }
    }

    if (!mapping.date || !dateRaw) {
      skipped.push({ row, reason: "missing date" });
      continue;
    }
    if (!date) {
      skipped.push({ row, reason: "unparseable date" });
      continue;
    }
    if (!description) {
      skipped.push({ row, reason: "missing description" });
      continue;
    }
    if (!amountFound) {
      skipped.push({ row, reason: "missing or zero amount" });
      continue;
    }

    let extraFields: Record<string, string> | undefined;
    if (mapping.extraColumns && mapping.extraColumns.length > 0) {
      extraFields = {};
      for (const col of mapping.extraColumns) {
        const val = row[col];
        if (val !== undefined && val !== "") extraFields[col] = String(val);
      }
      if (Object.keys(extraFields).length === 0) extraFields = undefined;
    }

    result.push({
      date,
      description,
      amount,
      direction,
      externalId: mapping.externalId ? String(row[mapping.externalId] ?? "") || undefined : undefined,
      merchantHint: mapping.merchantHint ? String(row[mapping.merchantHint] ?? "").trim() || undefined : undefined,
      memo: mapping.memo ? String(row[mapping.memo] ?? "").trim() || undefined : undefined,
      categoryHint: mapping.categoryHint ? String(row[mapping.categoryHint] ?? "").trim() || undefined : undefined,
      extraFields,
      originalData: row,
    });
  }

  return { rows: result, skipped };
}

// Back-compat convenience wrapper for callers that only want the happy path.
export function normalizeRows(rows: Record<string, unknown>[], mapping: ColumnMapping): NormalizedImportRow[] {
  return normalizeRowsWithDiagnostics(rows, mapping).rows;
}
