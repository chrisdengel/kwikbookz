"use client";

import * as React from "react";
import { getAll } from "@/lib/db";
import type { DocumentRecord, Transaction } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/primitives";
import { formatDateTime, formatCurrency, formatDate } from "@/lib/format";
import { FileText } from "lucide-react";

export default function DocumentsPage() {
  const [docs, setDocs] = React.useState<DocumentRecord[]>([]);
  const [txns, setTxns] = React.useState<Transaction[]>([]);

  React.useEffect(() => {
    getAll("documents").then(setDocs);
    getAll("transactions").then(setTxns);
  }, []);

  function open(doc: DocumentRecord) {
    const url = URL.createObjectURL(doc.blob);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Documents</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {docs.map((d) => {
          const txn = txns.find((t) => t.id === d.transactionId);
          return (
            <Card key={d.id} className="cursor-pointer hover:border-slate-400" onClick={() => open(d)}>
              <CardContent className="pt-4 text-sm">
                <FileText size={18} className="mb-1 text-slate-400" />
                <div className="truncate font-medium">{d.filename}</div>
                {txn && <div className="text-xs text-slate-400">{txn.description} · {formatCurrency(txn.amount)} · {formatDate(txn.date)}</div>}
                <div className="text-xs text-slate-300">{formatDateTime(d.uploadedAt)}</div>
              </CardContent>
            </Card>
          );
        })}
        {docs.length === 0 && <div className="col-span-full text-sm text-slate-400">No documents attached yet. Attach receipts from the Transactions page.</div>}
      </div>
    </div>
  );
}
