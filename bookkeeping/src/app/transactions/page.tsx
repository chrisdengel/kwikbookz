"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { Transaction, TransactionType } from "@/lib/types";
import { createManualTransaction, updateTransaction, deleteTransaction } from "@/lib/transactions";
import { Card, CardContent, Input, Select, Badge, Modal, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { PlusCircle, Paperclip, Trash2 } from "lucide-react";
import { v4 as uuid } from "uuid";

const TXN_TYPES: TransactionType[] = [
  "Income", "Expense", "Transfer", "Owner Draw", "Owner Contribution", "Loan", "Loan Payment", "Refund", "Reimbursement", "Personal",
];

export default function TransactionsPage() {
  const { accounts, categories, vendors, projects, entities, activeEntityId } = useAppData();
  const params = useSearchParams();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [q, setQ] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState(params.get("type") ?? "");
  const [openNew, setOpenNew] = React.useState(params.get("new") === "1");
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const highlight = params.get("highlight");
  const specialFilter = params.get("filter");

  const load = React.useCallback(async () => {
    setTxns(await getAll("transactions"));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  let scoped = txns.filter((t) => activeEntityId === "all" || t.entityId === activeEntityId);
  if (typeFilter) scoped = scoped.filter((t) => t.type === typeFilter);
  if (specialFilter === "uncategorized") scoped = scoped.filter((t) => !t.categoryId);
  if (specialFilter === "needsReview") scoped = scoped.filter((t) => t.needsReview);
  if (specialFilter === "capex") scoped = scoped.filter((t) => t.capexFlag === "Potential CAPEX");
  if (q.trim()) {
    const s = q.toLowerCase();
    scoped = scoped.filter((t) => t.description.toLowerCase().includes(s) || (t.memo ?? "").toLowerCase().includes(s));
  }
  scoped = [...scoped].sort((a, b) => b.date.localeCompare(a.date));

  async function quickUpdate(t: Transaction, patch: Partial<Transaction>) {
    const prev = { ...t };
    const next = { ...t, ...patch };
    await updateTransaction(next, prev);
    await load();
  }

  async function attachDocument(t: Transaction, file: File) {
    const doc = { id: uuid(), transactionId: t.id, filename: file.name, mimeType: file.type, blob: file, uploadedAt: new Date().toISOString() };
    await put("documents", doc);
    await quickUpdate(t, { documentIds: [...t.documentIds, doc.id], taxDocStatus: "Present" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold mr-auto">Transactions</h1>
        <Input placeholder="Filter by description…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
          <option value="">All types</option>
          {TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Button onClick={() => setOpenNew(true)}><PlusCircle size={15} /> Add Transaction</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Flags</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {scoped.map((t) => (
                <tr key={t.id} className={`border-t border-slate-100 ${highlight === t.id ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{formatDate(t.date)}</td>
                  <td className="px-3 py-1.5">
                    <button className="text-left hover:underline" onClick={() => setEditing(t)}>{t.description}</button>
                  </td>
                  <td className="px-3 py-1.5">
                    <Select value={t.categoryId ?? ""} onChange={(e) => quickUpdate(t, { categoryId: e.target.value || undefined })} className="h-7 text-xs">
                      <option value="">Uncategorized</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Select value={t.type} onChange={(e) => quickUpdate(t, { type: e.target.value as TransactionType })} className="h-7 text-xs">
                      {TXN_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5 space-x-1">
                    {t.needsReview && <Badge color="red">Review</Badge>}
                    {t.capexFlag === "Potential CAPEX" && <Badge color="amber">CAPEX?</Badge>}
                    {t.reconciliationStatus === "Reconciled" && <Badge color="green">Recon</Badge>}
                    <label className="inline-flex cursor-pointer items-center align-middle text-slate-400 hover:text-slate-700">
                      <Paperclip size={13} />
                      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && attachDocument(t, e.target.files[0])} />
                    </label>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${t.direction === "credit" ? "text-emerald-700" : ""}`}>
                    {t.direction === "credit" ? "+" : "-"}{formatCurrency(t.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button className="text-slate-300 hover:text-red-600" onClick={async () => { await deleteTransaction(t); await load(); }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {scoped.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No transactions match.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NewTransactionModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        entities={entities}
        accounts={accounts}
        categories={categories}
        vendors={vendors}
        projects={projects}
        defaultEntityId={activeEntityId !== "all" ? activeEntityId : undefined}
        onSaved={load}
      />

      {editing && (
        <EditTransactionModal
          txn={editing}
          categories={categories}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function NewTransactionModal({
  open, onClose, entities, accounts, categories, projects, defaultEntityId, onSaved,
}: {
  open: boolean; onClose: () => void;
  entities: { id: string; name: string }[]; accounts: { id: string; name: string; entityId: string }[];
  categories: { id: string; name: string }[]; vendors: { id: string; displayName: string }[]; projects: { id: string; name: string }[];
  defaultEntityId?: string; onSaved: () => void;
}) {
  const [entityId, setEntityId] = React.useState(defaultEntityId ?? "");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [direction, setDirection] = React.useState<"debit" | "credit">("debit");
  const [type, setType] = React.useState<TransactionType>("Expense");
  const [categoryId, setCategoryId] = React.useState("");

  React.useEffect(() => { if (defaultEntityId) setEntityId(defaultEntityId); }, [defaultEntityId]);

  const scopedAccounts = accounts.filter((a) => a.entityId === entityId);

  async function save() {
    if (!entityId || !accountId || !description.trim() || !amount) return;
    await createManualTransaction({
      date, description: description.trim(), amount: Math.abs(Number(amount)), direction,
      entityId, accountId, type, categoryId: categoryId || undefined,
      capexFlag: null, transferPairId: undefined,
    });
    onSaved();
    onClose();
    setDescription(""); setAmount("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Entity</Label>
            <Select value={entityId} onChange={(e) => { setEntityId(e.target.value); setAccountId(""); }}>
              <option value="">Select…</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!entityId}>
              <option value="">Select…</option>
              {scopedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Direction</Label>
            <Select value={direction} onChange={(e) => setDirection(e.target.value as "debit" | "credit")}>
              <option value="debit">Money out (debit)</option>
              <option value="credit">Money in (credit)</option>
            </Select>
          </div>
        </div>
        <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              {TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <Button className="w-full" onClick={save}>Add Transaction</Button>
      </div>
    </Modal>
  );
}

function EditTransactionModal({
  txn, categories, projects, onClose, onSaved,
}: {
  txn: Transaction; categories: { id: string; name: string }[]; projects: { id: string; name: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [memo, setMemo] = React.useState(txn.memo ?? "");
  const [categoryId, setCategoryId] = React.useState(txn.categoryId ?? "");
  const [projectId, setProjectId] = React.useState(txn.projectId ?? "");
  const [taxTreatment, setTaxTreatment] = React.useState(txn.taxTreatment ?? "");

  async function save() {
    await updateTransaction(
      { ...txn, memo, categoryId: categoryId || undefined, projectId: projectId || undefined, taxTreatment: taxTreatment || undefined },
      txn
    );
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={txn.description}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">{formatDate(txn.date)} · {formatCurrency(txn.amount)} {txn.direction === "credit" ? "in" : "out"}</div>
        <div>
          <Label>Category</Label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Project</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div><Label>Memo</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
        <div>
          <Label>Tax treatment note</Label>
          <Input value={taxTreatment} onChange={(e) => setTaxTreatment(e.target.value)} placeholder="e.g. 100% deductible, ask CPA, etc." />
        </div>
        {txn.capexFlag === "Potential CAPEX" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <div className="font-medium">⚠ Potential Capital Expenditure</div>
            <div className="mt-1 flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => { await updateTransaction({ ...txn, capexFlag: "Expensed" }, txn); onSaved(); onClose(); }}>Expense</Button>
              <Button size="sm" variant="outline" onClick={async () => { await updateTransaction({ ...txn, capexFlag: "Capitalized" }, txn); onSaved(); onClose(); }}>Capitalize</Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Review Later</Button>
            </div>
            <div className="mt-1 text-xs">Capitalization and tax treatment depend on your specific circumstances and applicable tax rules — this isn&apos;t tax advice.</div>
          </div>
        )}
        <Button className="w-full" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
