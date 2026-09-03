"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put, logAudit } from "@/lib/db";
import type { Transaction } from "@/lib/types";
import { calculateReconciliation, findSuspectTransactions } from "@/lib/reconcile";
import { Card, CardContent, Input, Select, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function ReconcilePage() {
  const { accounts, activeEntityId } = useAppData();
  const [accountId, setAccountId] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState(new Date().toISOString().slice(0, 10));
  const [beginBal, setBeginBal] = React.useState("");
  const [endBal, setEndBal] = React.useState("");
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [calc, setCalc] = React.useState<ReturnType<typeof calculateReconciliation> | null>(null);
  const [suspects, setSuspects] = React.useState<Transaction[]>([]);
  const [periodTxns, setPeriodTxns] = React.useState<Transaction[]>([]);
  const [confirming, setConfirming] = React.useState(false);
  const [justReconciled, setJustReconciled] = React.useState(false);

  const scopedAccounts = accounts.filter((a) => activeEntityId === "all" || a.entityId === activeEntityId);

  React.useEffect(() => { getAll("transactions").then(setTxns); }, []);

  function runCalculation() {
    if (!accountId || !beginBal || !endBal) return;
    const acct = accounts.find((a) => a.id === accountId);
    if (!acct) return;
    const inPeriod = txns.filter(
      (t) => t.accountId === accountId && (!start || t.date >= start) && t.date <= end
    );
    setPeriodTxns(inPeriod);
    const result = calculateReconciliation(Number(beginBal), Number(endBal), inPeriod);
    setCalc(result);
    setSuspects(result.reconciled ? [] : findSuspectTransactions(result.difference, inPeriod));
    setJustReconciled(false);
  }

  async function confirmReconciled() {
    if (!calc || !accountId) return;
    setConfirming(true);
    const now = new Date().toISOString();
    const sessionId = uuid();
    for (const t of periodTxns) {
      if (t.ignored) continue;
      await put("transactions", { ...t, reconciliationStatus: "Reconciled", reconciliationSessionId: sessionId, updatedAt: now });
    }
    await put("reconciliationSessions", {
      id: sessionId, accountId, entityId: accounts.find((a) => a.id === accountId)!.entityId,
      statementStart: start, statementEnd: end, beginningBalance: Number(beginBal), endingBalance: Number(endBal),
      calculatedEndingBalance: calc.calculatedEnding, difference: calc.difference, status: "reconciled",
      transactionIds: periodTxns.map((t) => t.id), suspectTransactionIds: [], createdAt: now, completedAt: now,
    });
    await logAudit({ id: uuid(), timestamp: now, action: "reconciliation_completed", entityRef: sessionId, notes: `${periodTxns.length} transactions reconciled` });
    const fresh = await getAll("transactions");
    setTxns(fresh);
    setConfirming(false);
    setJustReconciled(true);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">Reconcile</h1>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div>
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setCalc(null); }}>
              <option value="">Select account…</option>
              {scopedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Statement start (optional)</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>Statement end</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Beginning statement balance</Label><Input type="number" step="0.01" value={beginBal} onChange={(e) => setBeginBal(e.target.value)} /></div>
            <div><Label>Ending statement balance</Label><Input type="number" step="0.01" value={endBal} onChange={(e) => setEndBal(e.target.value)} /></div>
          </div>
          <Button onClick={runCalculation} disabled={!accountId || !beginBal || !endBal}>Calculate</Button>
        </CardContent>
      </Card>

      {calc && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            {calc.reconciled ? (
              <div className="flex items-center gap-2 text-emerald-700 text-lg font-medium">
                <CheckCircle2 size={20} /> RECONCILED
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 text-amber-700 text-lg font-medium">
                  <AlertCircle size={20} /> Difference: {formatCurrency(calc.difference)}
                </div>
                <div className="mt-1 text-sm text-slate-500">Calculated ending balance: {formatCurrency(calc.calculatedEnding)}</div>
              </div>
            )}

            {!calc.reconciled && suspects.length > 0 && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">
                  These {suspects.length} transaction(s) could explain the difference:
                </div>
                <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {suspects.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <div>{t.description}</div>
                        <div className="text-xs text-slate-400">{formatDate(t.date)}</div>
                      </div>
                      <div className={t.direction === "credit" ? "text-emerald-700" : ""}>
                        {t.direction === "credit" ? "+" : "-"}{formatCurrency(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {calc.reconciled && (
              <Button onClick={confirmReconciled} disabled={confirming}>
                {confirming ? "Marking reconciled…" : "Done — Mark as Reconciled"}
              </Button>
            )}
            {justReconciled && <div className="text-sm text-emerald-700">Account reconciled through {formatDate(end)}.</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
