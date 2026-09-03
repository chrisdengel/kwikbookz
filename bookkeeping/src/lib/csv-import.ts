import * as XLSX from "xlsx";
import type { ColumnMapping } from "./types";
import { parseFlexibleAmount, parseFlexibleDate } from "./format";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = json.length > 0 ? Object.keys(json[0]) : [];
  return { headers, rows: json };
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
  };
}

export interface NormalizedImportRow {
  date: string;
  postedDate?: string;
  description: string;
  amount: number; // magnitude
  direction: "debit" | "credit";
  externalId?: string;
  originalData: Record<string, unknown>;
}

export function normalizeRows(rows: Record<string, unknown>[], mapping: ColumnMapping): NormalizedImportRow[] {
  return rows
    .map((row) => {
      const date = mapping.date ? parseFlexibleDate(row[mapping.date]) : "";
      const description = mapping.description ? String(row[mapping.description] ?? "").trim() : "";
      let amount = 0;
      let direction: "debit" | "credit" = "debit";

      if (mapping.amount && row[mapping.amount] !== undefined && row[mapping.amount] !== "") {
        const raw = parseFlexibleAmount(row[mapping.amount]);
        amount = Math.abs(raw);
        direction = raw < 0 ? "debit" : "credit";
      } else {
        const debitVal = mapping.debit ? parseFlexibleAmount(row[mapping.debit]) : 0;
        const creditVal = mapping.credit ? parseFlexibleAmount(row[mapping.credit]) : 0;
        if (debitVal) {
          amount = Math.abs(debitVal);
          direction = "debit";
        } else if (creditVal) {
          amount = Math.abs(creditVal);
          direction = "credit";
        }
      }

      return {
        date,
        description,
        amount,
        direction,
        externalId: mapping.externalId ? String(row[mapping.externalId] ?? "") || undefined : undefined,
        originalData: row,
      };
    })
    .filter((r) => r.date && r.description && r.amount > 0);
}
