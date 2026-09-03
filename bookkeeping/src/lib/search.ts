import { getAll } from "./db";
import type { Account, Project, Transaction, Vendor } from "./types";

export interface SearchResult {
  type: "transaction" | "vendor" | "account" | "project" | "document";
  id: string;
  label: string;
  sublabel?: string;
  transaction?: Transaction;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Global search supporting free text plus a handful of special tokens
 * ("uncategorized", "no receipt", "potential capex", "unreconciled",
 * "$2,500+", month names) as described in the spec.
 */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [transactions, vendors, accounts, projects] = await Promise.all([
    getAll("transactions"),
    getAll("vendors"),
    getAll("accounts"),
    getAll("projects"),
  ]);

  let candidates = transactions;

  if (q === "uncategorized") {
    candidates = candidates.filter((t) => !t.categoryId);
  } else if (q === "needs review" || q === "review") {
    candidates = candidates.filter((t) => t.needsReview);
  } else if (q === "no receipt" || q === "no receipts") {
    candidates = candidates.filter((t) => t.documentIds.length === 0);
  } else if (q.includes("potential capex") || q === "capex") {
    candidates = candidates.filter((t) => t.capexFlag === "Potential CAPEX");
  } else if (q === "unreconciled") {
    candidates = candidates.filter((t) => t.reconciliationStatus !== "Reconciled");
  } else {
    const amountPlus = q.match(/\$?([\d,]+(?:\.\d+)?)\+/);
    const monthName = Object.keys(MONTHS).find((m) => q.includes(m));
    if (amountPlus) {
      const threshold = parseFloat(amountPlus[1].replace(/,/g, ""));
      candidates = candidates.filter((t) => t.amount >= threshold);
    } else if (monthName) {
      const monthNum = MONTHS[monthName];
      candidates = candidates.filter((t) => {
        const m = parseInt(t.date.slice(5, 7), 10);
        return m === monthNum;
      });
    } else {
      candidates = candidates.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          (t.normalizedMerchant ?? "").toLowerCase().includes(q) ||
          (t.memo ?? "").toLowerCase().includes(q)
      );
    }
  }

  const txnResults: SearchResult[] = candidates.slice(0, 100).map((t) => ({
    type: "transaction",
    id: t.id,
    label: `${t.description} — $${t.amount.toFixed(2)}`,
    sublabel: t.date,
    transaction: t,
  }));

  const vendorMatches: SearchResult[] = vendors
    .filter((v: Vendor) => v.displayName.toLowerCase().includes(q))
    .map((v) => ({ type: "vendor" as const, id: v.id, label: v.displayName }));

  const accountMatches: SearchResult[] = accounts
    .filter((a: Account) => a.name.toLowerCase().includes(q))
    .map((a) => ({ type: "account" as const, id: a.id, label: a.name, sublabel: a.type }));

  const projectMatches: SearchResult[] = projects
    .filter((p: Project) => p.name.toLowerCase().includes(q))
    .map((p) => ({ type: "project" as const, id: p.id, label: p.name }));

  return [...txnResults, ...vendorMatches, ...accountMatches, ...projectMatches];
}
