import type { Transaction } from "./types";

export interface TransferSuggestion {
  a: Transaction;
  b: Transaction;
}

/**
 * Find pairs of transactions on different accounts, within a small date
 * window, with matching (opposite-sign) amounts — a likely internal
 * transfer between two of the user's own accounts.
 */
export function suggestTransferPairs(
  transactions: Transaction[],
  dateToleranceDays = 3
): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = [];
  const candidates = transactions.filter(
    (t) => !t.transferPairId && t.type !== "Transfer" && !t.ignored
  );

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.accountId === b.accountId) continue;
      if (Math.abs(a.amount - b.amount) > 0.01) continue;
      if (a.direction === b.direction) continue; // must be opposite legs
      const days = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000;
      if (days > dateToleranceDays) continue;
      suggestions.push({ a, b });
    }
  }
  return suggestions;
}
