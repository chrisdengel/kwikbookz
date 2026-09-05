"use client";

import * as React from "react";
import Link from "next/link";
import { useAppData } from "@/components/AppDataContext";
import { getAll } from "@/lib/db";
import type { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { accountBalance } from "@/lib/reports";
import { Upload, PlusCircle, Scale, DownloadCloud, HelpCircle } from "lucide-react";
import { downloadBackup } from "@/lib/backup";

export default function DashboardPage() {
  const { accounts, activeEntityId, refresh } = useAppData();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [backingUp, setBackingUp] = React.useState(false);

  React.useEffect(() => {
    getAll("transactions").then((t) => {
      setTxns(t);
      setLoading(false);
    });
  }, [activeEntityId]);

  const scopedAccounts = accounts.filter((a) => activeEntityId === "all" || a.entityId === activeEntityId);
  const scopedTxns = txns.filter((t) => (activeEntityId === "all" || t.entityId === activeEntityId) && !t.ignored);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTxns = scopedTxns.filter((t) => t.date.startsWith(thisMonth));
  const revenue = monthTxns.filter((t) => t.direction === "credit" && t.type !== "Transfer").reduce((s, t) => s + t.amount, 0);
  const expenses = monthTxns.filter((t) => t.direction === "debit" && t.type !== "Transfer").reduce((s, t) => s + t.amount, 0);

  const uncategorized = scopedTxns.filter((t) => !t.categoryId).length;
  const needsReview = scopedTxns.filter((t) => t.needsReview).length;
  const unreconciled = scopedTxns.filter((t) => t.reconciliationStatus !== "Reconciled").length;
  const potentialCapex = scopedTxns.filter((t) => t.capexFlag === "Potential CAPEX").length;

  const recent = [...scopedTxns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  async function handleBackup() {
    setBackingUp(true);
    try {
      await downloadBackup();
      await refresh();
    } finally {
      setBackingUp(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/import"><Button><Upload size={15} /> Import Transactions</Button></Link>
        <Link href="/transactions?new=1"><Button variant="outline"><PlusCircle size={15} /> Add Transaction</Button></Link>
        <Link href="/reconcile"><Button variant="outline"><Scale size={15} /> Reconcile</Button></Link>
        <Button variant="outline" onClick={handleBackup} disabled={backingUp}>
          <DownloadCloud size={15} /> {backingUp ? "Backing up…" : "Backup Now"}
        </Button>
        <Link href="/help"><Button variant="ghost"><HelpCircle size={15} /> How to use this site</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Revenue (this month)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-emerald-700">{formatCurrency(revenue)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Expenses (this month)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-red-700">{formatCurrency(expenses)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Net Profit (this month)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{formatCurrency(revenue - expenses)}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <ExceptionCard href="/transactions?filter=uncategorized" label="Uncategorized" count={uncategorized} />
        <ExceptionCard href="/transactions?filter=needsReview" label="Needs Review" count={needsReview} />
        <ExceptionCard href="/reconcile" label="Unreconciled" count={unreconciled} />
        <ExceptionCard href="/transactions?filter=capex" label="Potential CAPEX" count={potentialCapex} color="amber" />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Account Balances</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {scopedAccounts.filter((a) => a.active).map((a) => {
            const acctTxns = scopedTxns.filter((t) => t.accountId === a.id);
            const bal = accountBalance(a.openingBalance, acctTxns);
            return (
              <Card key={a.id}>
                <CardContent className="pt-4">
                  <div className="text-xs text-slate-400">{a.name}</div>
                  <div className={`text-lg font-semibold ${bal < 0 ? "text-red-600" : "text-slate-900"}`}>
                    {formatCurrency(bal)}
                  </div>
                  <div className="text-xs text-slate-400">{a.type}{a.lastFour ? ` ••${a.lastFour}` : ""}</div>
                </CardContent>
              </Card>
            );
          })}
          {scopedAccounts.length === 0 && (
            <div className="col-span-full text-sm text-slate-400">
              No accounts yet. <Link href="/accounts" className="underline">Add an account</Link> to get started.
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Recent Transactions</h2>
        <Card>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">No transactions yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 text-slate-400">{formatDate(t.date)}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2">
                        {!t.categoryId && <Badge color="amber">Uncategorized</Badge>}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${t.direction === "credit" ? "text-emerald-700" : "text-slate-900"}`}>
                        {t.direction === "credit" ? "+" : "-"}
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExceptionCard({ href, label, count, color }: { href: string; label: string; count: number; color?: "amber" }) {
  return (
    <Link href={href}>
      <Card className="hover:border-slate-400 transition-colors">
        <CardContent className="pt-4">
          <div className="text-xs text-slate-400">{label}</div>
          <div className={`text-2xl font-semibold ${count > 0 ? (color === "amber" ? "text-amber-600" : "text-slate-900") : "text-slate-300"}`}>
            {count}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
