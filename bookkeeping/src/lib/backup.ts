import JSZip from "jszip";
import { getAll, bulkPut, wipeDatabase, put } from "./db";
import { getSettings, saveSettings, ensureSeedData } from "./seed";
import type {
  Entity,
  Account,
  Transaction,
  Category,
  Vendor,
  Customer,
  Project,
  Rule,
  ReconciliationSession,
  DocumentRecord,
  ImportBatch,
  AuditEntry,
} from "./types";

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function createBackupZip(): Promise<Blob> {
  const [entities, accounts, transactions, categories, vendors, customers, projects, rules, sessions, documents, importBatches, audit, settings] =
    await Promise.all([
      getAll("entities"),
      getAll("accounts"),
      getAll("transactions"),
      getAll("categories"),
      getAll("vendors"),
      getAll("customers"),
      getAll("projects"),
      getAll("rules"),
      getAll("reconciliationSessions"),
      getAll("documents"),
      getAll("importBatches"),
      getAll("audit"),
      getSettings(),
    ]);

  const zip = new JSZip();
  const root = zip.folder("bookkeeping-backup")!;

  root.file(
    "database.json",
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        entities,
        accounts,
        categories,
        vendors,
        customers,
        projects,
        rules,
        reconciliationSessions: sessions,
        importBatches,
        audit,
        settings,
      },
      null,
      2
    )
  );

  // Transactions without the raw document blobs (those go under documents/)
  root.file(
    "transactions.csv",
    toCSV(
      transactions.map((t) => ({
        id: t.id,
        date: t.date,
        postedDate: t.postedDate ?? "",
        description: t.description,
        normalizedMerchant: t.normalizedMerchant ?? "",
        amount: t.amount,
        direction: t.direction,
        entityId: t.entityId,
        accountId: t.accountId,
        vendorId: t.vendorId ?? "",
        categoryId: t.categoryId ?? "",
        projectId: t.projectId ?? "",
        type: t.type,
        memo: t.memo ?? "",
        taxDocStatus: t.taxDocStatus,
        reconciliationStatus: t.reconciliationStatus,
        capexFlag: t.capexFlag ?? "",
        needsReview: t.needsReview,
        ignored: t.ignored,
      }))
    )
  );
  root.file(
    "accounts.csv",
    toCSV(
      accounts.map((a) => ({
        id: a.id,
        entityId: a.entityId,
        name: a.name,
        institution: a.institution ?? "",
        type: a.type,
        lastFour: a.lastFour ?? "",
        openingBalance: a.openingBalance,
        active: a.active,
      }))
    )
  );
  root.file("entities.csv", toCSV(entities.map((e) => ({ id: e.id, name: e.name, archived: e.archived }))));
  root.file(
    "vendors.csv",
    toCSV(vendors.map((v) => ({ id: v.id, displayName: v.displayName, aliases: v.aliases.join(" | ") })))
  );
  root.file("categories.csv", toCSV(categories.map((c) => ({ id: c.id, name: c.name, group: c.group }))));
  root.file("rules.json", JSON.stringify(rules, null, 2));

  // Raw transaction json too, since CSV loses nested structure needed for a
  // perfect restore.
  root.file("transactions.json", JSON.stringify(transactions, null, 2));

  const docsFolder = root.folder("documents")!;
  for (const doc of documents) {
    docsFolder.file(`${doc.id}__${doc.filename}`, doc.blob);
  }
  // manifest so restore can rebuild DocumentRecord metadata from filenames
  docsFolder.file(
    "_manifest.json",
    JSON.stringify(
      documents.map((d) => ({
        id: d.id,
        transactionId: d.transactionId,
        filename: d.filename,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
      })),
      null,
      2
    )
  );

  root.folder("statements");
  root.folder("reports");

  return zip.generateAsync({ type: "blob" });
}

export async function downloadBackup(): Promise<void> {
  const blob = await createBackupZip();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `bookkeeping-backup-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const settings = await getSettings();
  settings.lastBackupAt = new Date().toISOString();
  await saveSettings(settings);
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  counts?: Record<string, number>;
}

export async function restoreBackupZip(file: File, mode: "replace" | "merge" = "replace"): Promise<RestoreResult> {
  try {
    const zip = await JSZip.loadAsync(file);
    const root = zip.folder("bookkeeping-backup") ?? zip;
    const dbFile = root.file("database.json");
    if (!dbFile) {
      return { ok: false, error: "This file doesn't look like a valid backup (missing database.json)." };
    }
    const dbJson = JSON.parse(await dbFile.async("string")) as {
      entities: Entity[];
      accounts: Account[];
      categories: Category[];
      vendors: Vendor[];
      customers: Customer[];
      projects: Project[];
      rules: Rule[];
      reconciliationSessions: ReconciliationSession[];
      importBatches: ImportBatch[];
      audit: AuditEntry[];
      settings: ReturnType<typeof getSettings> extends Promise<infer S> ? S : never;
    };

    const txnFile = root.file("transactions.json");
    const transactions: Transaction[] = txnFile ? JSON.parse(await txnFile.async("string")) : [];

    if (mode === "replace") {
      await wipeDatabase();
    }

    await bulkPut("entities", dbJson.entities ?? []);
    await bulkPut("accounts", dbJson.accounts ?? []);
    await bulkPut("categories", dbJson.categories ?? []);
    await bulkPut("vendors", dbJson.vendors ?? []);
    await bulkPut("customers", dbJson.customers ?? []);
    await bulkPut("projects", dbJson.projects ?? []);
    await bulkPut("rules", dbJson.rules ?? []);
    await bulkPut("reconciliationSessions", dbJson.reconciliationSessions ?? []);
    await bulkPut("importBatches", dbJson.importBatches ?? []);
    await bulkPut("audit", dbJson.audit ?? []);
    await bulkPut("transactions", transactions);

    // Documents: rebuild blobs from the documents/ folder using the manifest.
    const docsFolder = root.folder("documents");
    let docCount = 0;
    if (docsFolder) {
      const manifestFile = docsFolder.file("_manifest.json");
      if (manifestFile) {
        const manifest: DocumentRecord[] = JSON.parse(await manifestFile.async("string"));
        for (const m of manifest) {
          const entry = docsFolder.file(`${m.id}__${m.filename}`);
          if (!entry) continue;
          const blob = await entry.async("blob");
          await put("documents", {
            id: m.id,
            transactionId: m.transactionId,
            filename: m.filename,
            mimeType: m.mimeType,
            uploadedAt: m.uploadedAt,
            blob,
          });
          docCount++;
        }
      }
    }

    if (dbJson.settings) {
      await saveSettings(dbJson.settings);
    } else {
      await ensureSeedData();
    }

    return {
      ok: true,
      counts: {
        entities: dbJson.entities?.length ?? 0,
        accounts: dbJson.accounts?.length ?? 0,
        transactions: transactions.length,
        documents: docCount,
        rules: dbJson.rules?.length ?? 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error while restoring backup." };
  }
}
