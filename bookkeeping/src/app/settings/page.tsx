"use client";

import * as React from "react";
import { useAppData } from "@/components/AppDataContext";
import { saveSettings } from "@/lib/seed";
import { downloadBackup, restoreBackupZip } from "@/lib/backup";
import { wipeDatabase } from "@/lib/db";
import { Card, CardContent, Input, Label, Modal } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { DownloadCloud, UploadCloud, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { settings, refresh } = useAppData();
  const [capexThreshold, setCapexThreshold] = React.useState(2500);
  const [amountTolerance, setAmountTolerance] = React.useState(0.01);
  const [dateTolerance, setDateTolerance] = React.useState(3);
  const [saved, setSaved] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [restoreMsg, setRestoreMsg] = React.useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (settings) {
      setCapexThreshold(settings.capexThreshold);
      setAmountTolerance(settings.dedupeAmountTolerance);
      setDateTolerance(settings.dedupeDateToleranceDays);
    }
  }, [settings]);

  async function save() {
    if (!settings) return;
    await saveSettings({ ...settings, capexThreshold, dedupeAmountTolerance: amountTolerance, dedupeDateToleranceDays: dateTolerance });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    await refresh();
  }

  async function handleBackup() {
    setBackingUp(true);
    try { await downloadBackup(); await refresh(); } finally { setBackingUp(false); }
  }

  async function handleRestoreFile(file: File) {
    setRestoring(true);
    setRestoreMsg(null);
    const result = await restoreBackupZip(file, "replace");
    if (result.ok) {
      setRestoreMsg(`Restored ${result.counts?.transactions ?? 0} transactions, ${result.counts?.accounts ?? 0} accounts, ${result.counts?.documents ?? 0} documents.`);
      await refresh();
    } else {
      setRestoreMsg(result.error ?? "Restore failed.");
    }
    setRestoring(false);
  }

  async function handleWipe() {
    await wipeDatabase();
    setConfirmWipe(false);
    await refresh();
    window.location.href = "/";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="text-sm font-medium text-slate-700">CAPEX Review Threshold</div>
          <div>
            <Label>Flag expenses at or above this amount as &quot;Potential CAPEX&quot;</Label>
            <Input type="number" step="1" value={capexThreshold} onChange={(e) => setCapexThreshold(Number(e.target.value))} />
          </div>
          <div className="text-xs text-slate-400">Capitalization and tax treatment depend on your specific circumstances and applicable tax rules — this app never auto-classifies a transaction as a capital asset.</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="text-sm font-medium text-slate-700">Duplicate Detection Tolerance</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount tolerance ($)</Label><Input type="number" step="0.01" value={amountTolerance} onChange={(e) => setAmountTolerance(Number(e.target.value))} /></div>
            <div><Label>Date tolerance (days)</Label><Input type="number" step="1" value={dateTolerance} onChange={(e) => setDateTolerance(Number(e.target.value))} /></div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save}>{saved ? "Saved" : "Save Settings"}</Button>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="text-sm font-medium text-slate-700">Backup &amp; Restore</div>
          <div className="text-xs text-slate-400">
            Last backup: {settings?.lastBackupAt ? formatDateTime(settings.lastBackupAt) : "Never"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleBackup} disabled={backingUp}>
              <DownloadCloud size={15} /> {backingUp ? "Backing up…" : "Backup Now"}
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restoring}>
              <UploadCloud size={15} /> {restoring ? "Restoring…" : "Restore Backup"}
            </Button>
            <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files?.[0] && handleRestoreFile(e.target.files[0])} />
          </div>
          {restoreMsg && <div className="text-sm text-slate-600">{restoreMsg}</div>}
          <div className="text-xs text-slate-400">Restoring replaces all current data in this browser with the contents of the backup. Your data is portable — you are never locked into this application.</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-1.5 text-sm font-medium text-red-700"><AlertTriangle size={15} /> Danger Zone</div>
          <Button variant="destructive" onClick={() => setConfirmWipe(true)}>Erase All Local Data</Button>
          <div className="text-xs text-slate-400">This permanently deletes everything in this browser. Back up first.</div>
        </CardContent>
      </Card>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Erase all local data?">
        <div className="space-y-3 text-sm">
          <p>This will permanently delete every entity, account, transaction, rule, and document stored in this browser. This cannot be undone unless you have a backup.</p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleWipe}>Yes, erase everything</Button>
            <Button variant="outline" onClick={() => setConfirmWipe(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
