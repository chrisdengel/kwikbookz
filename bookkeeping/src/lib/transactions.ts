import { v4 as uuid } from "uuid";
import { getAll, put, remove, logAudit, getByIndex } from "./db";
import { applyRulesToTransaction, getAccountByLastFour, findCardConflicts } from "./rules";
import { resolveVendor } from "./vendors";
import { dedupeBatch } from "./dedupe";
import { getSettings } from "./seed";
import type { NormalizedImportRow } from "./csv-import";
import type { Account, ImportBatch, Transaction } from "./types";

export async function createManualTransaction(
  input: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "documentIds" | "reconciliationStatus" | "taxDocStatus" | "source" | "needsReview" | "ignored">
): Promise<Transaction> {
  const now = new Date().toISOString();
  const txn: Transaction = {
    ...input,
    id: uuid(),
    documentIds: [],
    reconciliationStatus: "Unreconciled",
    taxDocStatus: "Missing",
    source: "manual",
    needsReview: false,
    ignored: false,
    createdAt: now,
    updatedAt: now,
  };
  const applied = await applyRulesToTransaction(txn);
  await put("transactions", applied.txn);
  await logAudit({
    id: uuid(),
    timestamp: now,
    action: "transaction_created",
    entityRef: txn.id,
    newValue: txn,
  });
  return applied.txn;
}

export async function updateTransaction(txn: Transaction, previous?: Transaction): Promise<void> {
  txn.updatedAt = new Date().toISOString();
  await put("transactions", txn);
  await logAudit({
    id: uuid(),
    timestamp: txn.updatedAt,
    action: "transaction_edited",
    entityRef: txn.id,
    previousValue: previous,
    newValue: txn,
  });
}

export async function deleteTransaction(txn: Transaction): Promise<void> {
  await remove("transactions", txn.id);
  await logAudit({
    id: uuid(),
    timestamp: new Date().toISOString(),
    action: "transaction_deleted",
    entityRef: txn.id,
    previousValue: txn,
  });
}

export interface ImportOptions {
  entityId: string;
  accountId: string;
  filename: string;
  format: ImportBatch["format"];
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  statementBeginningBalance?: number;
  statementEndingBalance?: number;
}

export interface ImportResult {
  batch: ImportBatch;
  imported: Transaction[];
  duplicateCount: number;
  cardConflicts: { lastFour: string; accounts: Account[] }[];
}

/**
 * The full import pipeline: card/entity auto-detection, duplicate removal
 * against existing data, rule application, and exception surfacing — steps
 * 3-11 from the import workflow.
 */
export async function runImportPipeline(
  rows: NormalizedImportRow[],
  opts: ImportOptions
): Promise<ImportResult> {
  const settings = await getSettings();
  const accounts = await getAll("accounts");
  const existingForAccount = await getByIndex("transactions", "accountId", opts.accountId);

  const { toImport, duplicates } = dedupeBatch(
    rows,
    existingForAccount,
    settings.dedupeAmountTolerance,
    settings.dedupeDateToleranceDays
  );

  const batch: ImportBatch = {
    id: uuid(),
    entityId: opts.entityId,
    accountId: opts.accountId,
    filename: opts.filename,
    importedAt: new Date().toISOString(),
    rowCount: rows.length,
    newCount: toImport.length,
    duplicateCount: duplicates.length,
    format: opts.format,
    statementPeriodStart: opts.statementPeriodStart,
    statementPeriodEnd: opts.statementPeriodEnd,
    statementBeginningBalance: opts.statementBeginningBalance,
    statementEndingBalance: opts.statementEndingBalance,
  };
  await put("importBatches", batch);

  const imported: Transaction[] = [];
  const now = new Date().toISOString();

  for (const row of toImport) {
    let entityId = opts.entityId;
    let accountId = opts.accountId;

    // Deterministic card -> entity/account detection.
    const cardMatch = row.description.match(/\*{2,4}\s?(\d{4})/);
    if (cardMatch) {
      const lastFour = cardMatch[1];
      const matches = await getAccountByLastFour(lastFour, accounts);
      if (matches.length === 1) {
        entityId = matches[0].entityId;
        accountId = matches[0].id;
      }
      // If multiple accounts share this last-four across entities, leave the
      // user-selected entity/account as-is; conflicts are surfaced separately.
    }

    const vendor = await resolveVendor(row.description);

    let txn: Transaction = {
      id: uuid(),
      date: row.date,
      postedDate: row.postedDate,
      description: row.description,
      normalizedMerchant: vendor?.displayName,
      amount: row.amount,
      direction: row.direction,
      entityId,
      accountId,
      vendorId: vendor?.id,
      categoryId: vendor?.defaultCategoryId,
      type: row.direction === "credit" ? "Income" : "Expense",
      taxDocStatus: "Missing",
      documentIds: [],
      reconciliationStatus: "Unreconciled",
      importBatchId: batch.id,
      source: "import",
      originalData: row.originalData,
      externalId: row.externalId,
      capexFlag: null,
      needsReview: false,
      ignored: false,
      createdAt: now,
      updatedAt: now,
    };

    const applied = await applyRulesToTransaction(txn, { accounts, capexThreshold: settings.capexThreshold });
    txn = applied.txn;
    if (applied.conflict) txn.needsReview = true;

    await put("transactions", txn);
    imported.push(txn);
  }

  const cardConflicts = await findCardConflicts();

  await logAudit({
    id: uuid(),
    timestamp: now,
    action: "rule_applied",
    entityRef: batch.id,
    notes: `Imported ${imported.length} new transactions, skipped ${duplicates.length} duplicates from ${opts.filename}`,
  });

  return { batch, imported, duplicateCount: duplicates.length, cardConflicts };
}
