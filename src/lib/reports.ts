import type { Account, Category, Project, Transaction, Vendor } from "./types";

export interface ReportFilters {
  entityId?: string; // undefined/"all" = all entities
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
}

export function filterTransactions(txns: Transaction[], f: ReportFilters): Transaction[] {
  return txns.filter((t) => {
    if (t.ignored) return false;
    if (f.entityId && f.entityId !== "all" && t.entityId !== f.entityId) return false;
    if (f.accountId && t.accountId !== f.accountId) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.startDate && t.date < f.startDate) return false;
    if (f.endDate && t.date > f.endDate) return false;
    return true;
  });
}

export interface PLReport {
  income: number;
  expenses: number;
  netProfit: number;
  byCategory: { categoryId: string; categoryName: string; amount: number }[];
}

export function profitAndLoss(txns: Transaction[], categories: Category[]): PLReport {
  let income = 0;
  let expenses = 0;
  const byCategoryMap = new Map<string, number>();

  for (const t of txns) {
    if (t.type === "Transfer" || t.type === "Personal" || t.type === "Owner Draw" || t.type === "Owner Contribution" || t.type === "Loan") continue;
    if (t.direction === "credit") income += t.amount;
    else expenses += t.amount;

    const bucket = t.categoryId ?? "uncategorized";
    const prev = byCategoryMap.get(bucket) ?? 0;
    byCategoryMap.set(bucket, prev + (t.direction === "credit" ? t.amount : -t.amount));
  }

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: categoryId === "uncategorized" ? "Uncategorized" : categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized",
      amount,
    }))
    .sort((a, b) => a.amount - b.amount);

  return { income, expenses, netProfit: income - expenses, byCategory };
}

export function expenseByVendor(txns: Transaction[], vendors: Vendor[]) {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const key = t.vendorId ?? "unassigned";
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return Array.from(map.entries())
    .map(([vendorId, amount]) => ({
      vendorId,
      vendorName: vendorId === "unassigned" ? "Unassigned" : vendors.find((v) => v.id === vendorId)?.displayName ?? "Unknown",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function accountActivity(txns: Transaction[], accounts: Account[]) {
  const map = new Map<string, { income: number; expense: number; count: number }>();
  for (const t of txns) {
    const entry = map.get(t.accountId) ?? { income: 0, expense: 0, count: 0 };
    if (t.direction === "credit") entry.income += t.amount;
    else entry.expense += t.amount;
    entry.count++;
    map.set(t.accountId, entry);
  }
  return Array.from(map.entries()).map(([accountId, stats]) => ({
    accountId,
    accountName: accounts.find((a) => a.id === accountId)?.name ?? "Unknown",
    ...stats,
  }));
}

export function cashFlow(txns: Transaction[]) {
  const byMonth = new Map<string, { in: number; out: number }>();
  for (const t of txns) {
    const month = t.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { in: 0, out: 0 };
    if (t.direction === "credit") entry.in += t.amount;
    else entry.out += t.amount;
    byMonth.set(month, entry);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.in - v.out }));
}

export function balanceSheetSnapshot(accounts: Account[], balances: Map<string, number>) {
  const assets = accounts.filter((a) => ["Checking", "Savings", "Cash", "Investment", "Other Asset"].includes(a.type));
  const liabilities = accounts.filter((a) => ["Credit Card", "Loan", "Other Liability"].includes(a.type));
  const totalAssets = assets.reduce((sum, a) => sum + (balances.get(a.id) ?? a.openingBalance), 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + (balances.get(a.id) ?? a.openingBalance), 0);
  return { assets, liabilities, totalAssets, totalLiabilities, equity: totalAssets - totalLiabilities };
}

export function projectProfitability(txns: Transaction[], projects: Project[]) {
  const map = new Map<string, { income: number; expense: number }>();
  for (const t of txns) {
    if (!t.projectId) continue;
    const entry = map.get(t.projectId) ?? { income: 0, expense: 0 };
    if (t.direction === "credit") entry.income += t.amount;
    else entry.expense += t.amount;
    map.set(t.projectId, entry);
  }
  return Array.from(map.entries()).map(([projectId, v]) => ({
    projectId,
    projectName: projects.find((p) => p.id === projectId)?.name ?? "Unknown",
    income: v.income,
    expense: v.expense,
    profit: v.income - v.expense,
  }));
}

export function taxDocumentationReport(txns: Transaction[]) {
  const deductible = txns.filter((t) => t.direction === "debit" && t.type === "Expense");
  const withDocs = deductible.filter((t) => t.taxDocStatus === "Present");
  const missing = deductible.filter((t) => t.taxDocStatus !== "Present");
  return { total: deductible.length, withDocs: withDocs.length, missing };
}

export function accountBalance(accountOpening: number, txns: Transaction[]): number {
  let balance = accountOpening;
  for (const t of txns) {
    if (t.ignored) continue;
    balance += t.direction === "credit" ? t.amount : -t.amount;
  }
  return Math.round(balance * 100) / 100;
}

// ---------------- CPA-STYLE REPORTS ----------------

const ASSET_TYPES = ["Checking", "Savings", "Cash", "Investment", "Other Asset"] as const;
const LIABILITY_TYPES = ["Credit Card", "Loan", "Other Liability"] as const;

export interface ChartOfAccountsRow {
  code: string;
  name: string;
  classification: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  detail: string; // account type, or category group
  normalBalance: "Debit" | "Credit";
}

/**
 * A CPA expects a chart of accounts to list every account the business
 * tracks — both balance-sheet accounts (bank/credit/loan accounts) and
 * income-statement accounts (your categories) — each with its
 * classification and normal balance side. No dollar amounts here; that's
 * what the Trial Balance is for.
 */
export function chartOfAccounts(accounts: Account[], categories: Category[]): ChartOfAccountsRow[] {
  const rows: ChartOfAccountsRow[] = [];

  for (const a of accounts) {
    const isAsset = (ASSET_TYPES as readonly string[]).includes(a.type);
    rows.push({
      code: a.code ?? "",
      name: a.name,
      classification: isAsset ? "Asset" : "Liability",
      detail: a.type,
      normalBalance: isAsset ? "Debit" : "Credit",
    });
  }

  // A minimal, implicit Equity section — this app doesn't maintain a formal
  // retained-earnings ledger. Owner Draw / Owner Contribution transaction
  // types, plus an Opening Balance Equity plug, function as the equity
  // accounts shown on the Trial Balance below.
  rows.push({ code: "", name: "Owner Contributions", classification: "Equity", detail: "Equity", normalBalance: "Credit" });
  rows.push({ code: "", name: "Owner Draws", classification: "Equity", detail: "Equity", normalBalance: "Debit" });
  rows.push({ code: "", name: "Opening Balance Equity", classification: "Equity", detail: "Equity", normalBalance: "Credit" });

  for (const c of categories) {
    if (c.group === "Financial") continue; // Loan Payment/Interest/Transfer/Owner* handled structurally, not as their own COA line
    const isIncome = c.group === "Income";
    rows.push({
      code: c.code ?? "",
      name: c.name,
      classification: isIncome ? "Income" : "Expense",
      detail: c.group,
      normalBalance: isIncome ? "Credit" : "Debit",
    });
  }

  const order: ChartOfAccountsRow["classification"][] = ["Asset", "Liability", "Equity", "Income", "Expense"];
  return rows.sort((a, b) => {
    const byClass = order.indexOf(a.classification) - order.indexOf(b.classification);
    if (byClass !== 0) return byClass;
    if (a.code && b.code) return a.code.localeCompare(b.code);
    return a.name.localeCompare(b.name);
  });
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  classification: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  excludedPersonalCount: number;
  excludedTransferCount: number;
  excludedLoanProceedsCount: number;
}

/**
 * Builds a debit/credit trial balance as of the given transactions (already
 * date/entity filtered by the caller). This app tracks money single-entry
 * style (per-account running balances + categories) rather than a formal
 * double-entry general ledger, so this reconstructs a CPA-familiar trial
 * balance from that data:
 *  - Bank/credit/loan Accounts -> Asset or Liability lines, from their
 *    computed running balance.
 *  - Categories -> Income or Expense lines, from net activity in the period
 *    (shown as their own unclosed balances, same as any "adjusted" trial
 *    balance that hasn't been closed to retained earnings yet).
 *  - Owner Draw / Owner Contribution transaction types -> Equity lines.
 *  - Every account's opening balance rolls into an "Opening Balance Equity"
 *    line — the same mechanism QuickBooks and similar tools use to keep the
 *    books balanced from day one, since a starting balance otherwise has no
 *    offsetting entry anywhere.
 * Transfers and Personal transactions are intentionally excluded from the
 * Income/Expense/Equity lines (transfers already move money between two
 * accounts whose balances are counted directly; personal transactions are
 * non-business activity) — both exclusion counts are returned so the report
 * can disclose them rather than silently dropping activity.
 */
export function trialBalance(
  accounts: Account[],
  categories: Category[],
  allTxnsByAccount: Map<string, Transaction[]>,
  allRelevantTxns: Transaction[]
): TrialBalanceReport {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let openingBalanceSum = 0;

  for (const a of accounts) {
    openingBalanceSum += a.openingBalance;
    const txns = allTxnsByAccount.get(a.id) ?? [];
    const bal = accountBalance(a.openingBalance, txns);
    const isAsset = (ASSET_TYPES as readonly string[]).includes(a.type);
    let debit = 0, credit = 0;
    if (isAsset) {
      if (bal >= 0) debit = bal; else credit = -bal;
    } else {
      // Liability accounts: a positive running balance in our
      // opening+credits-debits model represents amount owed being paid down;
      // the true liability owed is the negative of that running balance.
      const owed = -bal;
      if (owed >= 0) credit = owed; else debit = -owed;
    }
    if (debit || credit) rows.push({ code: a.code ?? "", name: a.name, classification: isAsset ? "Asset" : "Liability", debit, credit });
    totalDebit += debit;
    totalCredit += credit;
  }

  let excludedPersonalCount = 0;
  let excludedTransferCount = 0;
  let excludedLoanProceedsCount = 0;
  let ownerDraw = 0;
  let ownerContribution = 0;
  const categoryNet = new Map<string, number>(); // categoryId -> net (credit positive, debit negative)

  for (const t of allRelevantTxns) {
    if (t.ignored) continue;
    if (t.type === "Transfer") { excludedTransferCount++; continue; }
    if (t.type === "Owner Draw") { ownerDraw += t.amount; continue; }
    if (t.type === "Owner Contribution") { ownerContribution += t.amount; continue; }
    if (t.type === "Loan") { excludedLoanProceedsCount++; continue; } // loan proceeds — balance-sheet only, not P&L; may need a matching liability entry to stay balanced
    if (t.type === "Personal") {
      // Money moved between the business and the owner for non-business
      // reasons is, structurally, a distribution or contribution — folding
      // it into the same equity buckets as Owner Draw/Contribution (rather
      // than excluding it outright) is what keeps the trial balance
      // balanced. Still counted separately so the report can disclose how
      // many personal transactions were involved.
      excludedPersonalCount++;
      if (t.direction === "debit") ownerDraw += t.amount; else ownerContribution += t.amount;
      continue;
    }

    const signed = t.direction === "credit" ? t.amount : -t.amount;
    const bucket = t.categoryId ?? "uncategorized";
    categoryNet.set(bucket, (categoryNet.get(bucket) ?? 0) + signed);
  }

  for (const [categoryId, net] of categoryNet.entries()) {
    const cat = categories.find((c) => c.id === categoryId);
    const name = cat?.name ?? "Uncategorized";
    const isIncomeCat = cat ? cat.group === "Income" : net >= 0;
    let debit = 0, credit = 0;
    if (isIncomeCat) {
      if (net >= 0) credit = net; else debit = -net;
    } else {
      if (net <= 0) debit = -net; else credit = net;
    }
    if (debit || credit) {
      rows.push({ code: cat?.code ?? "", name, classification: isIncomeCat ? "Income" : "Expense", debit, credit });
      totalDebit += debit;
      totalCredit += credit;
    }
  }

  if (ownerContribution) { rows.push({ code: "", name: "Owner Contributions", classification: "Equity", debit: 0, credit: ownerContribution }); totalCredit += ownerContribution; }
  if (ownerDraw) { rows.push({ code: "", name: "Owner Draws", classification: "Equity", debit: ownerDraw, credit: 0 }); totalDebit += ownerDraw; }
  // Opening Balance Equity: every account's starting balance needs an
  // offsetting equity entry to keep the books balanced from day one — the
  // same role "Opening Balance Equity" plays in QuickBooks. This is NOT the
  // same thing as current-period net income (which is already fully
  // represented by the individual Income/Expense rows above — closing them
  // into a separate Net Income line here would double-count that activity).
  if (openingBalanceSum >= 0) { rows.push({ code: "", name: "Opening Balance Equity", classification: "Equity", debit: 0, credit: openingBalanceSum }); totalCredit += openingBalanceSum; }
  else { rows.push({ code: "", name: "Opening Balance Equity", classification: "Equity", debit: -openingBalanceSum, credit: 0 }); totalDebit += -openingBalanceSum; }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  const order: TrialBalanceRow["classification"][] = ["Asset", "Liability", "Equity", "Income", "Expense"];
  rows.sort((a, b) => order.indexOf(a.classification) - order.indexOf(b.classification));

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    excludedPersonalCount,
    excludedTransferCount,
    excludedLoanProceedsCount,
  };
}
