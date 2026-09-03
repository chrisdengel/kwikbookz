"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { put, remove, getAll } from "@/lib/db";
import type { Category, Transaction } from "@/lib/types";
import { Card, CardContent, Input, Select, Modal, Label, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2 } from "lucide-react";

const GROUPS: Category["group"][] = ["Income", "Operating Expenses", "Property/Equipment", "Financial", "Custom"];

export default function CategoriesPage() {
  const { categories, refresh } = useAppData();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [group, setGroup] = React.useState<Category["group"]>("Operating Expenses");
  const [inUseCount, setInUseCount] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    getAll("transactions").then((txns: Transaction[]) => {
      const counts: Record<string, number> = {};
      for (const t of txns) {
        if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] ?? 0) + 1;
      }
      setInUseCount(counts);
    });
  }, [categories]);

  async function addCategory() {
    if (!name.trim()) return;
    const category: Category = { id: uuid(), name: name.trim(), group, custom: true };
    await put("categories", category);
    setName("");
    setOpen(false);
    await refresh();
  }

  async function deleteCategory(c: Category) {
    if (inUseCount[c.id]) {
      alert(`"${c.name}" is used on ${inUseCount[c.id]} transaction(s). Recategorize those first, or leave it — deleting isn't required.`);
      return;
    }
    await remove("categories", c.id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Categories</h1>
        <Button onClick={() => setOpen(true)}><PlusCircle size={15} /> Add Category</Button>
      </div>
      <div className="text-sm text-slate-500">
        Keep this list short and useful. Something like &quot;Property Taxes&quot; usually belongs under{" "}
        <span className="font-medium">Operating Expenses</span> — separate from Rent and Insurance so you
        can see it clearly on a P&amp;L. Once it exists here, you can assign it manually on a transaction,
        or set a rule at <a href="/rules" className="underline">Rules</a> (e.g. WHEN Description contains
        &quot;COUNTY TAX&quot; → Assign Category → Property Taxes) so future imports categorize it automatically.
      </div>

      {GROUPS.map((g) => {
        const inGroup = categories.filter((c) => c.group === g);
        if (inGroup.length === 0) return null;
        return (
          <div key={g}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{g}</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {inGroup.map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex items-center justify-between pt-3 pb-3">
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      {c.custom && <Badge color="blue">Custom</Badge>}
                    </div>
                    <button className="text-slate-300 hover:text-red-600" onClick={() => deleteCategory(c)}>
                      <Trash2 size={14} />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Category">
        <div className="space-y-3">
          <div>
            <Label>Category name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Property Taxes" autoFocus />
          </div>
          <div>
            <Label>Group</Label>
            <Select value={group} onChange={(e) => setGroup(e.target.value as Category["group"])}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <div className="mt-1 text-xs text-slate-400">This just controls where it's grouped on reports — pick whichever makes your P&amp;L easiest to read.</div>
          </div>
          <Button onClick={addCategory} className="w-full">Add Category</Button>
        </div>
      </Modal>
    </div>
  );
}
