"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { ColumnMapping, SavedMapping } from "@/lib/types";
import {
  guessMapping, headerSignature, normalizeRowsWithDiagnostics, parseSpreadsheetFile,
  type ParsedSheet, type NormalizedImportRow, type SkipReason,
} from "@/lib/csv-import";
import { extractPdfStatement } from "@/lib/pdf-import";
import { runImportPipeline, type ImportResult } from "@/lib/transactions";
import { Card, CardContent, Select, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { UploadCloud, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import Link from "next/link";

type Step = "select" | "upload" | "map" | "preview" | "done";

export default function ImportPage() {
  const { entities, accounts, refresh } = useAppData();
  const [step, setStep] = React.useState<Step>("select");
  const [entityId, setEntityId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [pdfRows, setPdfRows] = React.useState<NormalizedImportRow[] | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [showSkipped, setShowSkipped] = React.useState(false);

  const scopedAccounts = accounts.filter((a) => a.entityId === entityId);
  const selectedAccount = accounts.find((a) => a.id === accountId);

  async function handleFile(f: File) {
    setFile(f);
    setPdfError(null);
    setPdfRows(null);
    setParsed(null);

    if (f.name.toLowerCase().endsWith(".pdf")) {
      const res = await extractPdfStatement(f);
      if (!res.ok) {
        setPdfError(res.reason ?? "Could not read this PDF.");
        return;
      }
      setPdfRows(res.rows);
      setStep("preview");
      return;
    }

    const sheet = await parseSpreadsheetFile(f);
    setParsed(sheet);
    const sig = headerSignature(sheet.headers);
    const saved = (await getAll("savedMappings")).find((m) => m.signature === sig);
    const guessed = guessMapping(sheet.headers);
    // Credit cards typically report charges as positive and payments/credits
    // as negative — the opposite of a checking account. Default accordingly
    // so the common case is right without the user having to know this.
    if (selectedAccount?.type === "Credit Card") {
      guessed.amountSignConvention = "positive-is-debit";
    }
    setMapping(saved ? saved.mapping : guessed);
    setStep("map");
  }

  const { rows: previewRows, skipped } = React.useMemo(() => {
    if (pdfRows) return { rows: pdfRows, skipped: [] as SkipReason[] };
    if (parsed) return normalizeRowsWithDiagnostics(parsed.rows, mapping);
    return { rows: [] as NormalizedImportRow[], skipped: [] as SkipReason[] };
  }, [pdfRows, parsed, mapping]);

  const skipReasonCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of skipped) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
    return counts;
  }, [skipped]);

  async function confirmImport() {
    if (!file || !entityId || !accountId) return;
    setImporting(true);

    if (parsed) {
      const sig = headerSignature(parsed.headers);
      const existing = (await getAll("savedMappings")).find((m) => m.signature === sig);
      const saved: SavedMapping = {
        id: existing?.id ?? uuid(),
        signature: sig,
        bankLabel: file.name,
        mapping,
      };
      await put("savedMappings", saved);
    }

    const format = file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : file.name.toLowerCase().endsWith(".csv")
      ? "csv"
      : file.name.toLowerCase().endsWith(".xls")
      ? "xls"
      : "xlsx";

    const res = await runImportPipeline(previewRows, {
      entityId, accountId, filename: file.name, format,
    });
    setResult(res);
    setStep("done");
    setImporting(false);
    await refresh();
  }

  function reset() {
    setStep("select"); setFile(null); setParsed(null); setMapping({}); setPdfError(null);
    setPdfRows(null); setResult(null); setShowSkipped(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold">Import Transactions</h1>
      <Steps step={step} />

      {step === "select" && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div>
              <Label>Entity</Label>
              <Select value={entityId} onChange={(e) => { setEntityId(e.target.value); setAccountId(""); }}>
                <option value="">Select entity…</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Account</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!entityId}>
                <option value="">Select account…</option>
                {scopedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} {a.lastFour ? `••${a.lastFour}` : ""}</option>)}
              </Select>
              <div className="mt-1 text-xs text-slate-400">If a card number is detected in the statement that matches a registered account, the entity/account will be auto-assigned instead.</div>
            </div>
            <Button disabled={!entityId || !accountId} onClick={() => setStep("upload")}>Continue <ArrowRight size={14} /></Button>
          </CardContent>
        </Card>
      )}

      {step === "upload" && (
        <Card>
          <CardContent className="pt-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 p-10 text-sm text-slate-500 hover:border-slate-400">
              <UploadCloud size={28} />
              <span>Drop or select a CSV, XLS, XLSX, or PDF bank statement</span>
              <input type="file" accept=".csv,.xls,.xlsx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {pdfError && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{pdfError}</div>
            )}
            <Button variant="outline" className="mt-3" onClick={() => setStep("select")}><ArrowLeft size={14} /> Back</Button>
          </CardContent>
        </Card>
      )}

      {step === "map" && parsed && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="text-sm text-slate-500">Map the columns from <span className="font-medium">{file?.name}</span>:</div>

            {parsed.skippedPreambleRows.length > 0 && (
              <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <Info size={14} className="mt-0.5 shrink-0" />
                <div>
                  Skipped {parsed.skippedPreambleRows.length} row(s) above the header that looked like a
                  title block, not columns (e.g. account name, statement period, &quot;Prepared for&quot;).
                  Detected header: <span className="font-medium">{parsed.headers.join(", ")}</span>.
                  If that&apos;s wrong, this file&apos;s layout is unusual enough to map by hand below, or try
                  re-exporting a cleaner CSV from your bank.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <MapField label="Date" headers={parsed.headers} value={mapping.date} onChange={(v) => setMapping((m) => ({ ...m, date: v }))} />
              <MapField label="Description" headers={parsed.headers} value={mapping.description} onChange={(v) => setMapping((m) => ({ ...m, description: v }))} />
              <MapField label="Amount (single column, signed)" headers={parsed.headers} value={mapping.amount} onChange={(v) => setMapping((m) => ({ ...m, amount: v }))} />
              <MapField label="Debit (if separate)" headers={parsed.headers} value={mapping.debit} onChange={(v) => setMapping((m) => ({ ...m, debit: v }))} />
              <MapField label="Credit (if separate)" headers={parsed.headers} value={mapping.credit} onChange={(v) => setMapping((m) => ({ ...m, credit: v }))} />
              <MapField label="Bank transaction ID" headers={parsed.headers} value={mapping.externalId} onChange={(v) => setMapping((m) => ({ ...m, externalId: v }))} />
              <MapField label="Merchant name (cleaner than Description, if available)" headers={parsed.headers} value={mapping.merchantHint} onChange={(v) => setMapping((m) => ({ ...m, merchantHint: v }))} />
              <MapField label="Memo / extended details" headers={parsed.headers} value={mapping.memo} onChange={(v) => setMapping((m) => ({ ...m, memo: v }))} />
              <MapField label="Category hint (bank's own category label)" headers={parsed.headers} value={mapping.categoryHint} onChange={(v) => setMapping((m) => ({ ...m, categoryHint: v }))} />
            </div>

            {(() => {
              const used = new Set(
                [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit, mapping.externalId, mapping.merchantHint, mapping.memo, mapping.categoryHint].filter(Boolean)
              );
              const remaining = parsed.headers.filter((h) => !used.has(h));
              if (remaining.length === 0) return null;
              const selected = new Set(mapping.extraColumns ?? []);
              function toggle(h: string) {
                const next = new Set(selected);
                if (next.has(h)) next.delete(h);
                else next.add(h);
                setMapping((m) => ({ ...m, extraColumns: Array.from(next) }));
              }
              return (
                <div>
                  <Label>Also keep these columns (any number) — shown on each transaction under &quot;Additional Data&quot;</Label>
                  <div className="flex flex-wrap gap-2">
                    {remaining.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => toggle(h)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected.has(h) ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-500 hover:border-slate-400"
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Nothing from the file is ever discarded — every column stays attached to each transaction as
                    backup data regardless — but anything you select here also shows up directly when you open a
                    transaction, instead of being buried.
                  </div>
                </div>
              );
            })()}

            {mapping.amount && (
              <div>
                <Label>In the Amount column, a negative number means…</Label>
                <Select
                  value={mapping.amountSignConvention ?? "negative-is-debit"}
                  onChange={(e) => setMapping((m) => ({ ...m, amountSignConvention: e.target.value as ColumnMapping["amountSignConvention"] }))}
                >
                  <option value="negative-is-debit">Money going out — most checking/savings exports</option>
                  <option value="positive-is-debit">Money coming in (a payment/credit) — most credit card exports</option>
                </Select>
                <div className="mt-1 text-xs text-slate-400">
                  Credit card statements usually show a purchase as a positive number and a payment as
                  negative — the opposite of a checking account. Pick whichever matches what you see in
                  the file; the Preview step will show you the +/− result either way.
                </div>
              </div>
            )}

            <div className="text-xs text-slate-400">This mapping will be remembered for files with the same column headers.</div>
            <div className="flex gap-2">
              <Button onClick={() => setStep("preview")} disabled={!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)}>
                Preview <ArrowRight size={14} />
              </Button>
              <Button variant="outline" onClick={() => setStep("upload")}><ArrowLeft size={14} /> Back to Upload</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-2 text-sm text-slate-500">{previewRows.length} transaction(s) detected. Duplicate detection runs on import.</div>

            {previewRows.length === 0 && skipped.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> Every row was skipped — nothing to import.</div>
                <div className="mt-1">This almost always means a mapping is pointed at the wrong column. Go back to Map Columns and double check Date, Description, and Amount against the file.</div>
              </div>
            )}

            {skipped.length > 0 && (
              <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <button className="flex w-full items-center justify-between text-left" onClick={() => setShowSkipped((v) => !v)}>
                  <span>
                    <strong>{skipped.length}</strong> row(s) skipped — {Object.entries(skipReasonCounts).map(([reason, n]) => `${n} ${reason}`).join(", ")}
                  </span>
                  <span className="text-xs text-slate-400">{showSkipped ? "Hide" : "Show"}</span>
                </button>
                {showSkipped && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <tbody>
                        {skipped.slice(0, 100).map((s, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1 text-red-600 whitespace-nowrap">{s.reason}</td>
                            <td className="px-2 py-1 text-slate-500">{JSON.stringify(s.row).slice(0, 140)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-400">
                  <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-500">{formatDate(r.date)}</td>
                      <td className="px-3 py-1.5">{r.description}</td>
                      <td className={`px-3 py-1.5 text-right ${r.direction === "credit" ? "text-emerald-700" : ""}`}>
                        {r.direction === "credit" ? "+" : "-"}{formatCurrency(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={confirmImport} disabled={importing || previewRows.length === 0}>
                {importing ? "Importing…" : `Import ${previewRows.length} Transactions`}
              </Button>
              <Button variant="outline" onClick={() => setStep(parsed ? "map" : "upload")}>
                <ArrowLeft size={14} /> {parsed ? "Back to Mapping" : "Back to Upload"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18} /> Import complete</div>
            <div className="text-sm">
              <div>{result.imported.length} new transaction(s) imported.</div>
              <div>{result.duplicateCount} duplicate(s) skipped automatically.</div>
              <div>{result.imported.filter((t) => t.needsReview).length} flagged for review.</div>
              <div>{result.imported.filter((t) => t.capexFlag === "Potential CAPEX").length} flagged as potential CAPEX.</div>
            </div>
            {result.cardConflicts.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> Card conflicts need attention</div>
                {result.cardConflicts.map((c) => (
                  <div key={c.lastFour}>••{c.lastFour} is registered on accounts in more than one entity — resolve in Accounts.</div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Link href="/transactions"><Button>Review Transactions</Button></Link>
              <Button variant="outline" onClick={reset}>Import Another File</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MapField({ label, headers, value, onChange }: { label: string; headers: string[]; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </Select>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["select", "upload", "map", "preview", "done"];
  const labels: Record<Step, string> = { select: "Account", upload: "Upload", map: "Map Columns", preview: "Preview", done: "Done" };
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2 text-xs">
      {order.map((s, i) => (
        <React.Fragment key={s}>
          <span className={i <= idx ? "font-medium text-slate-900" : "text-slate-400"}>{labels[s]}</span>
          {i < order.length - 1 && <span className="text-slate-300">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
