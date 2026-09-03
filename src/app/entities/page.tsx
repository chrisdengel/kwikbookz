"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { put, remove } from "@/lib/db";
import type { Entity } from "@/lib/types";
import { Card, CardContent, Input, Modal, Label, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PlusCircle, Archive, ArchiveRestore } from "lucide-react";

export default function EntitiesPage() {
  const { entities, accounts, refresh } = useAppData();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  async function addEntity() {
    if (!name.trim()) return;
    const entity: Entity = { id: uuid(), name: name.trim(), archived: false, createdAt: new Date().toISOString() };
    await put("entities", entity);
    setName("");
    setOpen(false);
    await refresh();
  }

  async function toggleArchive(e: Entity) {
    await put("entities", { ...e, archived: !e.archived });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Entities</h1>
        <Button onClick={() => setOpen(true)}><PlusCircle size={15} /> Add Entity</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {entities.map((e) => {
          const acctCount = accounts.filter((a) => a.entityId === e.id).length;
          return (
            <Card key={e.id}>
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-slate-400">{acctCount} account{acctCount === 1 ? "" : "s"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {e.archived && <Badge color="slate">Archived</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => toggleArchive(e)}>
                    {e.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {entities.length === 0 && <div className="text-sm text-slate-400">No entities yet — add your first one (e.g. your LLC, or &quot;Personal&quot;).</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Entity">
        <div className="space-y-3">
          <div>
            <Label>Entity name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laketown Properties LLC" autoFocus />
          </div>
          <Button onClick={addEntity} className="w-full">Add</Button>
        </div>
      </Modal>
    </div>
  );
}
