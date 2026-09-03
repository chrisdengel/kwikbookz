import type { Transaction } from "./types";

export interface ReconcileCalc {
  calculatedEnding: number;
  difference: number;
  reconciled: boolean;
}

export function calculateReconciliation(
  beginningBalance: number,
  statementEndingBalance: number,
  transactionsInPeriod: Transaction[]
): ReconcileCalc {
  let running = beginningBalance;
  for (const t of transactionsInPeriod) {
    if (t.ignored) continue;
    running += t.direction === "credit" ? t.amount : -t.amount;
  }
  const difference = Math.round((statementEndingBalance - running) * 100) / 100;
  return {
    calculatedEnding: Math.round(running * 100) / 100,
    difference,
    reconciled: Math.abs(difference) < 0.005,
  };
}

/**
 * When the calculated balance doesn't match the statement, find the
 * smallest set of unmatched/suspicious transactions that could explain the
 * difference, rather than dumping every transaction on the user. Strategy:
 * 1. Look for a single transaction whose amount equals the difference
 *    (a likely missing/extra entry).
 * 2. Look for a pair of transactions summing to the difference.
 * 3. Otherwise, surface unreconciled transactions in the period sorted by
 *    how close they get to explaining the gap, capped to a short list.
 */
export function findSuspectTransactions(
  difference: number,
  transactionsInPeriod: Transaction[]
): Transaction[] {
  if (Math.abs(difference) < 0.005) return [];
  const candidates = transactionsInPeriod.filter(
    (t) => !t.ignored && t.reconciliationStatus !== "Reconciled"
  );
  const target = Math.abs(difference);

  const signedAmount = (t: Transaction) => (t.direction === "credit" ? t.amount : -t.amount);

  // Single transaction explains it exactly.
  const single = candidates.find((t) => Math.abs(Math.abs(signedAmount(t)) - target) < 0.01);
  if (single) return [single];

  // Pair of transactions sums to it (small search space is fine here).
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const sum = Math.abs(signedAmount(candidates[i]) + signedAmount(candidates[j]));
      if (Math.abs(sum - target) < 0.01) {
        return [candidates[i], candidates[j]];
      }
    }
  }

  // Fall back: closest few candidates by amount, capped at 5.
  return [...candidates]
    .sort((a, b) => Math.abs(b.amount - target) - Math.abs(a.amount - target))
    .slice(-5)
    .reverse();
}
