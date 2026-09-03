"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { Account, AccountType, Transaction } from "@/lib/types";
import { Card, CardContent, Input, Select, Modal, Label, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { accountBalance } from "@/lib/reports";
import { findCardConflicts } from "@/lib/rules";
import { PlusCircle, AlertTriangle } from "lucide-react";

const ACCOUNT_TYPES: AccountType[] = [
  "Checking", "Savings", "Credit Card", "Cash", "Loan", "Investment", "Other Asset", "Other Liability",
];

export default function AccountsPage() {
  const { entities, accounts, activeEntityId, refresh } = useAppData();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [open, setOpen] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<Awaited<ReturnType<typeof findCardConflicts>>>([]);
  const [form, setForm] = React.useState<Partial<Account>>({ type: "Checking", entityId: entities[0]?.id, openingBalance: 0, active: true });

  React.useEffect(() => {
    getAll("transactions").then(setTxns);
    findCardConflicts().then(setConflicts);
  }, [accounts]);

  React.useEffect(() => {
    if (!form.entityId && entities[0]) setForm((f) => ({ ...f, entityId: entities[0].id }));
  }, [entities, form.entityId]);

  const scoped = accounts.filter((a) => activeEntityId === "all" || a.entityId === activeEntityId);

  async function saveAccount() {
    if (!form.name?.trim() || !form.entityId) return;
    const account: Account = {
      id: uuid(),
      entityId: form.entityId,
      name: form.name.trim(),
      institution: form.institution,
      type: (form.type as AccountType) ?? "Checking",
      lastFour: form.lastFour?.trim() || undefined,
      openingBalance: Number(form.openingBalance) || 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await put("accounts", account);
    setOpen(false);
    setForm({ type: "Checking", entityId: entities[0]?.id, openingBalance: 0, active: true });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <Button onClick={() => setOpen(true)} disabled={entities.length === 0}><PlusCircle size={15} /> Add Account</Button>
      </div>

      {entities.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Create an entity first, then add accounts to it.
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> Card conflicts detected</div>
          {conflicts.map((c) => (
            <div key={c.lastFour}>
              ••{c.lastFour} is registered on accounts across multiple entities: {c.accounts.map((a) => a.name).join(", ")}. Imports on this card will not be auto-assigned until this is resolved.
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {scoped.map((a) => {
          const acctTxns = txns.filter((t) => t.accountId === a.id);
          const bal = accountBalance(a.openingBalance, acctTxns);
          const entity = entities.find((e) => e.id === a.entityId);
          return (
            <Card key={a.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-400">{entity?.name}</div>
                  </div>
                  <Badge>{a.type}</Badge>
                </div>
                <div className={`mt-2 text-xl font-semibold ${bal < 0 ? "text-red-600" : ""}`}>{formatCurrency(bal)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {a.institution ?? "—"} {a.lastFour ? `••${a.lastFour}` : ""}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {scoped.length === 0 && entities.length > 0 && (
          <div className="text-sm text-slate-400">No accounts for this entity yet.</div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Account">
        <div className="space-y-3">
          <div>
            <Label>Entity</Label>
            <Select value={form.entityId} onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Account name</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Chase Visa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>Last 4 digits</Label>
              <Input value={form.lastFour ?? ""} onChange={(e) => setForm((f) => ({ ...f, lastFour: e.target.value }))} maxLength={4} placeholder="1234" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Institution</Label>
              <Input value={form.institution ?? ""} onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))} placeholder="Chase" />
            </div>
            <div>
              <Label>Opening balance</Label>
              <Input type="number" step="0.01" value={form.openingBalance ?? 0} onChange={(e) => setForm((f) => ({ ...f, openingBalance: Number(e.target.value) }))} />
            </div>
          </div>
          <Button onClick={saveAccount} className="w-full">Add Account</Button>
        </div>
      </Modal>
    </div>
  );
}
