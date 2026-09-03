"use client";

import * as React from "react";
import { v4 as uuid } from "uuid";
import { useAppData } from "@/components/AppDataContext";
import { getAll, put } from "@/lib/db";
import type { ColumnMapping, SavedMapping } from "@/lib/types";
import { guessMapping, headerSignature, normalizeRows, parseSpreadsheetFile, type ParsedSheet } from "@/lib/csv-import";
import { extractPdfStatement } from "@/lib/pdf-import";
import { runImportPipeline, type ImportResult } from "@/lib/transactions";
import { Card, CardContent, Select, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { UploadCloud, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
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
  const [pdfRows, setPdfRows] = React.useState<ReturnType<typeof normalizeRows> | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [importing, setImporting] = React.useState(false);

  const scopedAccounts = accounts.filter((a) => a.entityId === entityId);

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
    setMapping(saved ? saved.mapping : guessMapping(sheet.headers));
    setStep("map");
  }

  const previewRows = React.useMemo(() => {
    if (pdfRows) return pdfRows;
    if (parsed) return normalizeRows(parsed.rows, mapping);
    return [];
  }, [pdfRows, parsed, mapping]);

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
    setPdfRows(null); setResult(null);
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
          </CardContent>
        </Card>
      )}

      {step === "map" && parsed && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="text-sm text-slate-500">Map the columns from <span className="font-medium">{file?.name}</span>:</div>
            <div className="grid grid-cols-2 gap-3">
              <MapField label="Date" headers={parsed.headers} value={mapping.date} onChange={(v) => setMapping((m) => ({ ...m, date: v }))} />
              <MapField label="Description" headers={parsed.headers} value={mapping.description} onChange={(v) => setMapping((m) => ({ ...m, description: v }))} />
              <MapField label="Amount (single column, signed)" headers={parsed.headers} value={mapping.amount} onChange={(v) => setMapping((m) => ({ ...m, amount: v }))} />
              <MapField label="Debit (if separate)" headers={parsed.headers} value={mapping.debit} onChange={(v) => setMapping((m) => ({ ...m, debit: v }))} />
              <MapField label="Credit (if separate)" headers={parsed.headers} value={mapping.credit} onChange={(v) => setMapping((m) => ({ ...m, credit: v }))} />
              <MapField label="Bank transaction ID" headers={parsed.headers} value={mapping.externalId} onChange={(v) => setMapping((m) => ({ ...m, externalId: v }))} />
            </div>
            <div className="text-xs text-slate-400">This mapping will be remembered for files with the same column headers.</div>
            <Button onClick={() => setStep("preview")} disabled={!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)}>
              Preview <ArrowRight size={14} />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-2 text-sm text-slate-500">{previewRows.length} transaction(s) detected. Duplicate detection runs on import.</div>
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
            <Button className="mt-3" onClick={confirmImport} disabled={importing || previewRows.length === 0}>
              {importing ? "Importing…" : `Import ${previewRows.length} Transactions`}
            </Button>
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
