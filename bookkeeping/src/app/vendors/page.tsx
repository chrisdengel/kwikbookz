"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { Transaction, Vendor } from "@/lib/types";
import { Card, CardContent, Input, Select, Modal, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { PlusCircle } from "lucide-react";

export default function VendorsPage() {
  const { vendors, categories, refresh } = useAppData();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [alias, setAlias] = React.useState("");
  const [defaultCategoryId, setDefaultCategoryId] = React.useState("");

  React.useEffect(() => { getAll("transactions").then(setTxns); }, []);

  async function addVendor() {
    if (!name.trim()) return;
    const vendor: Vendor = {
      id: uuid(), displayName: name.trim(),
      aliases: alias.trim() ? [alias.trim()] : [],
      defaultCategoryId: defaultCategoryId || undefined,
    };
    await put("vendors", vendor);
    setOpen(false); setName(""); setAlias(""); setDefaultCategoryId("");
    await refresh();
  }

  async function addAlias(v: Vendor, newAlias: string) {
    if (!newAlias.trim() || v.aliases.includes(newAlias)) return;
    await put("vendors", { ...v, aliases: [...v.aliases, newAlias.trim()] });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vendors</h1>
        <Button onClick={() => setOpen(true)}><PlusCircle size={15} /> Add Vendor</Button>
      </div>

      <div className="space-y-2">
        {vendors.map((v) => {
          const spend = txns.filter((t) => t.vendorId === v.id && t.direction === "debit").reduce((s, t) => s + t.amount, 0);
          return (
            <Card key={v.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{v.displayName}</div>
                  <div className="text-sm text-slate-500">{formatCurrency(spend)} total</div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-400">
                  {v.aliases.map((a) => <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5">{a}</span>)}
                </div>
                <AddAliasInline onAdd={(a) => addAlias(v, a)} />
              </CardContent>
            </Card>
          );
        })}
        {vendors.length === 0 && <div className="text-sm text-slate-400">No vendors yet. They&apos;ll also be created automatically as you confirm merchant matches during import.</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Vendor">
        <div className="space-y-3">
          <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="LOWE'S" /></div>
          <div><Label>Alias to map (optional)</Label><Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="LOWES #1234" /></div>
          <div>
            <Label>Default category (optional)</Label>
            <Select value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <Button className="w-full" onClick={addVendor}>Add Vendor</Button>
        </div>
      </Modal>
    </div>
  );
}

function AddAliasInline({ onAdd }: { onAdd: (v: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="mt-2 flex gap-2">
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add alias…" className="h-7 text-xs" />
      <Button size="sm" variant="outline" onClick={() => { onAdd(value); setValue(""); }}>Add</Button>
    </div>
  );
}
