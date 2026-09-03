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

    if (t.categoryId) {
      const prev = byCategoryMap.get(t.categoryId) ?? 0;
      byCategoryMap.set(t.categoryId, prev + (t.direction === "credit" ? t.amount : -t.amount));
    }
  }

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized",
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
