import type { NormalizedImportRow } from "./csv-import";
import { parseFlexibleAmount } from "./format";

export interface PdfExtractionResult {
  ok: boolean;
  reason?: string;
  rows: NormalizedImportRow[];
  statementBeginningBalance?: number;
  statementEndingBalance?: number;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
}

// A conservative line-level parser: looks for lines that start with a date
// (MM/DD or MM/DD/YYYY) and end with a dollar amount. This only works for
// text-based statements laid out roughly one-transaction-per-line; anything
// else (scanned images, multi-column layouts) is explicitly rejected rather
// than guessed at, per the "never invent transactions" requirement.
const LINE_RE =
  /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\$?\(?[\d,]+\.\d{2}\)?)$/;

function toAmount(token: string): number {
  return parseFlexibleAmount(token);
}

function toISO(dateToken: string, fallbackYear: number): string {
  const parts = dateToken.split("/");
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  let year = parts[2] ? parts[2] : String(fallbackYear);
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

export async function extractPdfStatement(file: File): Promise<PdfExtractionResult> {
  try {
    const pdfjs = await import("pdfjs-dist");
    // Use the bundled worker via a CDN-free inline approach: disable worker
    // and run extraction on the main thread, which is fine for statement-
    // sized documents.
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;

    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      fullText += strings + "\n";
    }

    if (fullText.trim().length < 40) {
      return {
        ok: false,
        reason:
          "This statement could not be reliably converted into transactions. Use CSV/Excel from your bank if available.",
        rows: [],
      };
    }

    const year = new Date().getFullYear();
    const lines = fullText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const rows: NormalizedImportRow[] = [];

    for (const line of lines) {
      const m = line.match(LINE_RE);
      if (!m) continue;
      const [, dateToken, description, amountToken] = m;
      const amount = toAmount(amountToken);
      if (!amount) continue;
      const direction = amountToken.trim().startsWith("-") || amountToken.includes("(") ? "debit" : "credit";
      rows.push({
        date: toISO(dateToken, year),
        description: description.trim(),
        amount: Math.abs(amount),
        direction,
        originalData: { rawLine: line },
      });
    }

    if (rows.length === 0) {
      return {
        ok: false,
        reason:
          "This statement could not be reliably converted into transactions. Use CSV/Excel from your bank if available.",
        rows: [],
      };
    }

    const beginMatch = fullText.match(/Beginning Balance[:\s]+\$?([\d,]+\.\d{2})/i);
    const endMatch = fullText.match(/Ending Balance[:\s]+\$?([\d,]+\.\d{2})/i);

    return {
      ok: true,
      rows,
      statementBeginningBalance: beginMatch ? toAmount(beginMatch[1]) : undefined,
      statementEndingBalance: endMatch ? toAmount(endMatch[1]) : undefined,
    };
  } catch {
    return {
      ok: false,
      reason:
        "This statement could not be reliably converted into transactions. Use CSV/Excel from your bank if available.",
      rows: [],
    };
  }
}
