import type { Transaction } from "./types";
import { roughNormalize } from "./vendors";

export interface CandidateMatch {
  existing: Transaction;
  confidence: "exact-id" | "exact-fields" | "tolerant" | "none";
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
}

function similar(a: string, b: string): boolean {
  const na = roughNormalize(a);
  const nb = roughNormalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter) && shorter.length >= 4;
}

/**
 * Match an incoming (not-yet-saved) transaction against already-imported
 * transactions for the same account, using the matching hierarchy from the
 * spec: exact external id, then exact date+amount+description, then a
 * tolerant window, then nothing.
 */
export function matchDuplicate(
  incoming: Pick<Transaction, "date" | "amount" | "description" | "direction" | "externalId">,
  existingForAccount: Transaction[],
  amountTolerance: number,
  dateToleranceDays: number
): CandidateMatch {
  // 1. exact external id
  if (incoming.externalId) {
    const hit = existingForAccount.find((e) => e.externalId && e.externalId === incoming.externalId);
    if (hit) return { existing: hit, confidence: "exact-id" };
  }

  // 2. exact date + amount + normalized description
  const exact = existingForAccount.find(
    (e) =>
      e.date === incoming.date &&
      e.direction === incoming.direction &&
      Math.abs(e.amount - incoming.amount) < 0.001 &&
      roughNormalize(e.description) === roughNormalize(incoming.description)
  );
  if (exact) return { existing: exact, confidence: "exact-fields" };

  // 3. same amount, date within tolerance, similar description
  const tolerant = existingForAccount.find(
    (e) =>
      e.direction === incoming.direction &&
      Math.abs(e.amount - incoming.amount) <= amountTolerance &&
      daysBetween(e.date, incoming.date) <= dateToleranceDays &&
      similar(e.description, incoming.description)
  );
  if (tolerant) return { existing: tolerant, confidence: "tolerant" };

  return { existing: undefined as unknown as Transaction, confidence: "none" };
}

export interface DedupeResult<T> {
  toImport: T[];
  duplicates: { row: T; match: Transaction; confidence: CandidateMatch["confidence"] }[];
}

/**
 * Given a batch of freshly-parsed rows for one account and the existing
 * transactions already on record for that account, split the batch into
 * genuinely new rows vs. proven duplicates. This is what lets overlapping
 * statement periods import cleanly without asking the user to review every
 * row individually.
 */
export function dedupeBatch<
  T extends { date: string; amount: number; description: string; direction: "debit" | "credit"; externalId?: string }
>(
  rows: T[],
  existingForAccount: Transaction[],
  amountTolerance: number,
  dateToleranceDays: number
): DedupeResult<T> {
  const toImport: T[] = [];
  const duplicates: DedupeResult<T>["duplicates"] = [];
  // Track matches made within this batch too, so two identical rows in the
  // same file don't both get discarded against a single existing row.
  const consumedExistingIds = new Set<string>();

  for (const row of rows) {
    const pool = existingForAccount.filter((e) => !consumedExistingIds.has(e.id));
    const match = matchDuplicate(row, pool, amountTolerance, dateToleranceDays);
    if (match.confidence === "none") {
      toImport.push(row);
    } else {
      duplicates.push({ row, match: match.existing, confidence: match.confidence });
      consumedExistingIds.add(match.existing.id);
    }
  }

  return { toImport, duplicates };
}
