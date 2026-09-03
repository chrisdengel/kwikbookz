"use client";

import * as React from "react";
import { useAppData } from "@/components/AppDataContext";
import { getAll } from "@/lib/db";
import type { Transaction } from "@/lib/types";
import {
  accountActivity, cashFlow, expenseByVendor, filterTransactions, profitAndLoss,
  projectProfitability, taxDocumentationReport, accountBalance, balanceSheetSnapshot,
} from "@/lib/reports";
import { Card, CardContent, Select, Label, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { Download } from "lucide-react";

const REPORT_TYPES = [
  "Profit & Loss", "Expense by Category", "Expense by Vendor", "Account Activity",
  "Cash Flow", "Balance Sheet", "Project Profitability", "Tax Documentation Report",
] as const;
type ReportType = (typeof REPORT_TYPES)[number];

export default function ReportsPage() {
  const { accounts, categories, vendors, projects, activeEntityId } = useAppData();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [reportType, setReportType] = React.useState<ReportType>("Profit & Loss");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [accountId, setAccountId] = React.useState("");

  React.useEffect(() => { getAll("transactions").then(setTxns); }, []);

  const filtered = filterTransactions(txns, { entityId: activeEntityId, startDate, endDate, accountId: accountId || undefined });

  function exportRows(rows: Record<string, unknown>[], filename: string, xlsx = false) {
    if (xlsx) downloadXLSX(filename, rows);
    else downloadCSV(filename, rows);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Reports</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div>
            <Label>Report</Label>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="w-56">
              {REPORT_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><Label>End date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div>
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-48">
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      {reportType === "Profit & Loss" && <PLReport txns={filtered} categories={categories} onExport={exportRows} />}
      {reportType === "Expense by Category" && <PLReport txns={filtered} categories={categories} onExport={exportRows} expenseOnly />}
      {reportType === "Expense by Vendor" && <VendorReport txns={filtered} vendors={vendors} onExport={exportRows} />}
      {reportType === "Account Activity" && <AccountActivityReport txns={filtered} accounts={accounts} onExport={exportRows} />}
      {reportType === "Cash Flow" && <CashFlowReport txns={filtered} onExport={exportRows} />}
      {reportType === "Balance Sheet" && <BalanceSheetReport txns={txns} accounts={accounts} activeEntityId={activeEntityId} onExport={exportRows} />}
      {reportType === "Project Profitability" && <ProjectReport txns={filtered} projects={projects} onExport={exportRows} />}
      {reportType === "Tax Documentation Report" && <TaxDocReport txns={filtered} onExport={exportRows} />}
    </div>
  );
}

type ExportFn = (rows: Record<string, unknown>[], filename: string, xlsx?: boolean) => void;

function ExportButtons({ rows, filename, onExport }: { rows: Record<string, unknown>[]; filename: string; onExport: ExportFn }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => onExport(rows, filename)}><Download size={13} /> CSV</Button>
      <Button size="sm" variant="outline" onClick={() => onExport(rows, filename, true)}><Download size={13} /> XLSX</Button>
    </div>
  );
}

function PLReport({ txns, categories, onExport, expenseOnly }: { txns: Transaction[]; categories: { id: string; name: string }[]; onExport: ExportFn; expenseOnly?: boolean }) {
  const report = profitAndLoss(txns, categories as never);
  const rows = report.byCategory.map((c) => ({ Category: c.categoryName, Amount: c.amount }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        {!expenseOnly && (
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Income" value={report.income} color="text-emerald-700" />
            <Stat label="Expenses" value={report.expenses} color="text-red-700" />
            <Stat label="Net Profit" value={report.netProfit} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">By Category</div>
          <ExportButtons rows={rows} filename={expenseOnly ? "expense-by-category" : "profit-and-loss-by-category"} onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function VendorReport({ txns, vendors, onExport }: { txns: Transaction[]; vendors: { id: string; displayName: string }[]; onExport: ExportFn }) {
  const report = expenseByVendor(txns, vendors as never);
  const rows = report.map((r) => ({ Vendor: r.vendorName, Amount: r.amount }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Expense by Vendor</div>
          <ExportButtons rows={rows} filename="expense-by-vendor" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function AccountActivityReport({ txns, accounts, onExport }: { txns: Transaction[]; accounts: { id: string; name: string }[]; onExport: ExportFn }) {
  const report = accountActivity(txns, accounts as never);
  const rows = report.map((r) => ({ Account: r.accountName, Income: r.income, Expense: r.expense, Transactions: r.count }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Account Activity</div>
          <ExportButtons rows={rows} filename="account-activity" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function CashFlowReport({ txns, onExport }: { txns: Transaction[]; onExport: ExportFn }) {
  const report = cashFlow(txns);
  const rows = report.map((r) => ({ Month: r.month, In: r.in, Out: r.out, Net: r.net }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Cash Flow by Month</div>
          <ExportButtons rows={rows} filename="cash-flow" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function BalanceSheetReport({ txns, accounts, activeEntityId, onExport }: { txns: Transaction[]; accounts: import("@/lib/types").Account[]; activeEntityId: string; onExport: ExportFn }) {
  const scoped = accounts.filter((a) => activeEntityId === "all" || a.entityId === activeEntityId);
  const balances = new Map<string, number>();
  for (const a of scoped) {
    const acctTxns = txns.filter((t) => t.accountId === a.id);
    balances.set(a.id, accountBalance(a.openingBalance, acctTxns));
  }
  const snap = balanceSheetSnapshot(scoped, balances);
  const rows = [
    ...snap.assets.map((a) => ({ Type: "Asset", Account: a.name, Balance: balances.get(a.id) ?? a.openingBalance })),
    ...snap.liabilities.map((a) => ({ Type: "Liability", Account: a.name, Balance: balances.get(a.id) ?? a.openingBalance })),
  ];
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total Assets" value={snap.totalAssets} color="text-emerald-700" />
          <Stat label="Total Liabilities" value={snap.totalLiabilities} color="text-red-700" />
          <Stat label="Equity" value={snap.equity} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Balance Sheet</div>
          <ExportButtons rows={rows} filename="balance-sheet" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function ProjectReport({ txns, projects, onExport }: { txns: Transaction[]; projects: { id: string; name: string }[]; onExport: ExportFn }) {
  const report = projectProfitability(txns, projects as never);
  const rows = report.map((r) => ({ Project: r.projectName, Revenue: r.income, Expenses: r.expense, Profit: r.profit }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Project Profitability</div>
          <ExportButtons rows={rows} filename="project-profitability" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
        {rows.length === 0 && <div className="text-sm text-slate-400">No transactions assigned to projects in this range.</div>}
      </CardContent>
    </Card>
  );
}

function TaxDocReport({ txns, onExport }: { txns: Transaction[]; onExport: ExportFn }) {
  const report = taxDocumentationReport(txns);
  const rows = report.missing.map((t) => ({ Date: formatDate(t.date), Description: t.description, Amount: t.amount }));
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Deductible Expenses" value={report.total} isCount />
          <Stat label="With Documentation" value={report.withDocs} isCount color="text-emerald-700" />
          <Stat label="Missing Documentation" value={report.missing.length} isCount color="text-amber-600" />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-500">Expenses Missing Documentation</div>
          <ExportButtons rows={rows} filename="tax-documentation-missing" onExport={onExport} />
        </div>
        <ReportTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color, isCount }: { label: string; value: number; color?: string; isCount?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-semibold ${color ?? ""}`}>{isCount ? value : formatCurrency(value)}</div>
    </div>
  );
}

function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <div className="text-sm text-slate-400">No data for this range.</div>;
  const headers = Object.keys(rows[0]);
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-400">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5">
                  {typeof r[h] === "number" ? formatCurrency(r[h] as number) : String(r[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
