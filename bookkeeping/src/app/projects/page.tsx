"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { Project, Transaction } from "@/lib/types";
import { projectProfitability } from "@/lib/reports";
import { Card, CardContent, Input, Select, Modal, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { PlusCircle } from "lucide-react";

export default function ProjectsPage() {
  const { projects, entities, activeEntityId, refresh } = useAppData();
  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [entityId, setEntityId] = React.useState(activeEntityId !== "all" ? activeEntityId : "");

  React.useEffect(() => { getAll("transactions").then(setTxns); }, []);

  const scoped = projects.filter((p) => activeEntityId === "all" || p.entityId === activeEntityId);
  const profitability = projectProfitability(txns, projects);

  async function addProject() {
    if (!name.trim() || !entityId) return;
    const project: Project = { id: uuid(), entityId, name: name.trim(), active: true };
    await put("projects", project);
    setOpen(false); setName("");
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button onClick={() => setOpen(true)}><PlusCircle size={15} /> Add Project</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {scoped.map((p) => {
          const stats = profitability.find((x) => x.projectId === p.id);
          return (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="font-medium">{p.name}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-slate-400">Revenue</div><div className="text-emerald-700 font-medium">{formatCurrency(stats?.income ?? 0)}</div></div>
                  <div><div className="text-xs text-slate-400">Expenses</div><div className="font-medium">{formatCurrency(stats?.expense ?? 0)}</div></div>
                  <div><div className="text-xs text-slate-400">Profit</div><div className="font-medium">{formatCurrency(stats?.profit ?? 0)}</div></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {scoped.length === 0 && <div className="text-sm text-slate-400">No projects yet. Projects are optional — use them to track profitability on a specific job.</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Project">
        <div className="space-y-3">
          <div>
            <Label>Entity</Label>
            <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">Select…</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div><Label>Project name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith Building Repair" /></div>
          <Button className="w-full" onClick={addProject}>Add Project</Button>
        </div>
      </Modal>
    </div>
  );
}
