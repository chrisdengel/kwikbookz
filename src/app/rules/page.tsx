"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put, remove } from "@/lib/db";
import type { Rule, RuleAction, RuleActionType, RuleCondition, RuleField, RuleOperator } from "@/lib/types";
import { reapplyAllRules } from "@/lib/rules";
import { Card, CardContent, Input, Select, Modal, Label, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2, Play, GripVertical } from "lucide-react";

const FIELD_LABELS: Record<RuleField, string> = {
  entity: "Entity", account: "Account", cardLastFour: "Card (last 4)", merchant: "Merchant",
  description: "Description", amount: "Amount", amountRange: "Amount range", category: "Category",
  transactionType: "Transaction type", dateRange: "Date range",
};
const ACTION_LABELS: Record<RuleActionType, string> = {
  assignEntity: "Assign Entity", assignAccount: "Assign Account", assignVendor: "Assign Vendor",
  assignCategory: "Assign Category", assignProject: "Assign Project", markPersonal: "Mark Personal",
  markOwnerDraw: "Mark Owner Draw", markTransfer: "Mark Transfer", flagCapex: "Flag Potential CAPEX",
  ignore: "Ignore Transaction", requireReview: "Require Review",
};

function emptyCondition(): RuleCondition {
  return { field: "merchant", operator: "contains", value: "" };
}
function emptyAction(): RuleAction {
  return { type: "assignCategory", value: "" };
}

export default function RulesPage() {
  const { entities, accounts, categories, vendors, projects, refresh } = useAppData();
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Rule | null>(null);
  const [reapplying, setReapplying] = React.useState(false);
  const [reapplyMsg, setReapplyMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await getAll("rules");
    setRules(r.sort((a, b) => a.priority - b.priority));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  function startNew() {
    setEditing({
      id: uuid(), name: "", enabled: true, priority: rules.length,
      conditions: [emptyCondition()], actions: [emptyAction()], createdAt: new Date().toISOString(),
    });
    setOpen(true);
  }

  async function saveRule() {
    if (!editing || !editing.name.trim()) return;
    await put("rules", editing);
    setOpen(false);
    setEditing(null);
    await load();
  }

  async function deleteRule(id: string) {
    await remove("rules", id);
    await load();
  }

  async function toggleEnabled(rule: Rule) {
    await put("rules", { ...rule, enabled: !rule.enabled });
    await load();
  }

  async function handleReapply() {
    setReapplying(true);
    setReapplyMsg(null);
    const result = await reapplyAllRules();
    setReapplyMsg(`Updated ${result.updated} transaction(s). ${result.conflicts > 0 ? `${result.conflicts} conflict(s) flagged for review.` : ""}`);
    setReapplying(false);
    await refresh();
  }

  function updateCondition(idx: number, patch: Partial<RuleCondition>) {
    if (!editing) return;
    const conditions = editing.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setEditing({ ...editing, conditions });
  }
  function updateAction(idx: number, patch: Partial<RuleAction>) {
    if (!editing) return;
    const actions = editing.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    setEditing({ ...editing, actions });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rules</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReapply} disabled={reapplying}>
            <Play size={15} /> {reapplying ? "Applying…" : "Re-apply All Rules"}
          </Button>
          <Button onClick={startNew}><PlusCircle size={15} /> New Rule</Button>
        </div>
      </div>
      {reapplyMsg && <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{reapplyMsg}</div>}

      <div className="space-y-2">
        {rules.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3">
                <GripVertical size={15} className="text-slate-300" />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {r.name} {!r.enabled && <Badge color="slate">Disabled</Badge>}
                  </div>
                  <div className="text-xs text-slate-400">
                    WHEN {r.conditions.map((c) => `${FIELD_LABELS[c.field]} ${c.operator} ${c.value}`).join(" AND ")}
                    {" → "}
                    {r.actions.map((a) => ACTION_LABELS[a.type] + (a.value ? `: ${a.value}` : "")).join(", ")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(r)}>{r.enabled ? "Disable" : "Enable"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 size={14} /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && (
          <div className="text-sm text-slate-400">
            No rules yet. Try: WHEN Card equals ****1234 → Assign Entity + Assign Account.
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing?.name ? "Edit Rule" : "New Rule"} wide>
        {editing && (
          <div className="space-y-4">
            <div>
              <Label>Rule name</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Chase Visa ****1234" />
            </div>

            <div>
              <Label>WHEN (all conditions must match)</Label>
              <div className="space-y-2">
                {editing.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select className="w-40" value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value as RuleField })}>
                      {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                    </Select>
                    <Select className="w-32" value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value as RuleOperator })}>
                      <option value="equals">equals</option>
                      <option value="contains">contains</option>
                      <option value="startsWith">starts with</option>
                      <option value="gte">&gt;=</option>
                      <option value="lte">&lt;=</option>
                      <option value="between">between</option>
                    </Select>
                    <Input value={String(c.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="value" />
                    {c.operator === "between" && (
                      <Input value={String(c.value2 ?? "")} onChange={(e) => updateCondition(i, { value2: e.target.value })} placeholder="to" />
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...editing, conditions: editing.conditions.filter((_, idx) => idx !== i) })}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, conditions: [...editing.conditions, emptyCondition()] })}>
                  + Condition
                </Button>
              </div>
            </div>

            <div>
              <Label>DO</Label>
              <div className="space-y-2">
                {editing.actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select className="w-48" value={a.type} onChange={(e) => updateAction(i, { type: e.target.value as RuleActionType, value: "" })}>
                      {(Object.keys(ACTION_LABELS) as RuleActionType[]).map((k) => <option key={k} value={k}>{ACTION_LABELS[k]}</option>)}
                    </Select>
                    <ActionValuePicker action={a} entities={entities} accounts={accounts} categories={categories} vendors={vendors} projects={projects} onChange={(v) => updateAction(i, { value: v })} />
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...editing, actions: editing.actions.filter((_, idx) => idx !== i) })}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, actions: [...editing.actions, emptyAction()] })}>
                  + Action
                </Button>
              </div>
            </div>

            <Button onClick={saveRule} className="w-full">Save Rule</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ActionValuePicker({
  action, entities, accounts, categories, vendors, projects, onChange,
}: {
  action: RuleAction;
  entities: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  vendors: { id: string; displayName: string }[];
  projects: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  if (action.type === "assignEntity") {
    return <Select className="flex-1" value={action.value} onChange={(e) => onChange(e.target.value)}><option value="">Select entity…</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>;
  }
  if (action.type === "assignAccount") {
    return <Select className="flex-1" value={action.value} onChange={(e) => onChange(e.target.value)}><option value="">Select account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>;
  }
  if (action.type === "assignCategory") {
    return <Select className="flex-1" value={action.value} onChange={(e) => onChange(e.target.value)}><option value="">Select category…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>;
  }
  if (action.type === "assignVendor") {
    return <Select className="flex-1" value={action.value} onChange={(e) => onChange(e.target.value)}><option value="">Select vendor…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}</Select>;
  }
  if (action.type === "assignProject") {
    return <Select className="flex-1" value={action.value} onChange={(e) => onChange(e.target.value)}><option value="">Select project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>;
  }
  return <div className="flex-1 text-xs text-slate-400 px-2">No value needed</div>;
}
