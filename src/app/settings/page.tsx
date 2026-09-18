"use client";

import * as React from "react";
import { useAppData } from "@/components/AppDataContext";
import { saveSettings } from "@/lib/seed";
import { downloadBackup, restoreBackupZip } from "@/lib/backup";
import { wipeDatabase } from "@/lib/db";
import { getGistCredentials, saveGistToken, forgetGistSync, pushToGist, pullFromGist } from "@/lib/github-gist";
import { Card, CardContent, Input, Label, Modal } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { DownloadCloud, UploadCloud, AlertTriangle, GitFork } from "lucide-react";

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

  const [gistToken, setGistToken] = React.useState("");
  const [gistId, setGistId] = React.useState<string | null>(null);
  const [gistLastSync, setGistLastSync] = React.useState<string | null>(null);
  const [gistBusy, setGistBusy] = React.useState<"push" | "pull" | null>(null);
  const [gistMsg, setGistMsg] = React.useState<{ text: string; ok: boolean } | null>(null);
  const [confirmPull, setConfirmPull] = React.useState(false);

  React.useEffect(() => {
    const creds = getGistCredentials();
    setGistToken(creds.token);
    setGistId(creds.gistId);
    setGistLastSync(creds.lastSyncAt);
  }, []);

  function handleSaveToken(token: string) {
    setGistToken(token);
    saveGistToken(token);
  }

  async function handlePush() {
    setGistBusy("push");
    setGistMsg(null);
    const result = await pushToGist();
    if (result.ok) {
      setGistMsg({ text: `Pushed ${result.counts?.transactions ?? 0} transactions and everything else to your gist.`, ok: true });
      setGistId(getGistCredentials().gistId);
      setGistLastSync(getGistCredentials().lastSyncAt);
    } else {
      setGistMsg({ text: result.error ?? "Push failed.", ok: false });
    }
    setGistBusy(null);
  }

  async function handlePull() {
    setConfirmPull(false);
    setGistBusy("pull");
    setGistMsg(null);
    const result = await pullFromGist();
    if (result.ok) {
      setGistMsg({ text: `Pulled ${result.counts?.transactions ?? 0} transactions from your gist and replaced local data. Note: receipts/documents are never part of gist sync — restore a ZIP backup for those.`, ok: true });
      setGistLastSync(getGistCredentials().lastSyncAt);
      await refresh();
    } else {
      setGistMsg({ text: result.error ?? "Pull failed.", ok: false });
    }
    setGistBusy(null);
  }

  function handleForgetGist() {
    forgetGistSync();
    setGistToken("");
    setGistId(null);
    setGistLastSync(null);
    setGistMsg(null);
  }

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
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><GitFork size={15} /> GitHub Gist Sync</div>
          <div className="text-xs text-slate-400">
            An alternative to manual ZIP backups: sync your data (everything except receipts/documents — gists
            don&apos;t handle binary files well) to a private GitHub Gist, so you can pull it down on another
            device. Requires a GitHub personal access token with the <code>gist</code> scope — create one at{" "}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="underline">github.com/settings/tokens</a>.
            The token is stored only in this browser and is never included in your ZIP backups.
          </div>

          <div>
            <Label>GitHub personal access token</Label>
            <Input
              type="password"
              value={gistToken}
              onChange={(e) => handleSaveToken(e.target.value)}
              placeholder="ghp_…"
              autoComplete="off"
            />
          </div>

          <div className="text-xs text-slate-400">
            {gistId ? (
              <>Synced gist: <a href={`https://gist.github.com/${gistId}`} target="_blank" rel="noreferrer" className="underline">gist.github.com/{gistId}</a>. </>
            ) : (
              <>No gist yet — the first push will create one. </>
            )}
            Last sync: {gistLastSync ? formatDateTime(gistLastSync) : "Never"}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handlePush} disabled={!gistToken || gistBusy !== null}>
              {gistBusy === "push" ? "Pushing…" : "Push to Gist"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmPull(true)} disabled={!gistToken || !gistId || gistBusy !== null}>
              {gistBusy === "pull" ? "Pulling…" : "Pull from Gist"}
            </Button>
            {(gistToken || gistId) && (
              <Button variant="ghost" onClick={handleForgetGist} disabled={gistBusy !== null}>Disconnect</Button>
            )}
          </div>

          {gistMsg && (
            <div className={`text-sm ${gistMsg.ok ? "text-emerald-700" : "text-amber-700"}`}>{gistMsg.text}</div>
          )}
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

      <Modal open={confirmPull} onClose={() => setConfirmPull(false)} title="Pull from Gist?">
        <div className="space-y-3 text-sm">
          <p>This replaces everything currently in this browser with whatever is in the gist. If you&apos;ve made changes here since your last push, they&apos;ll be lost.</p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={handlePull}>Yes, pull and replace</Button>
            <Button variant="outline" onClick={() => setConfirmPull(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
