import { openDB, type DBSchema, type IDBPDatabase } from "idb";
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
  SavedMapping,
  AppSettings,
  AuditEntry,
} from "./types";

const DB_NAME = "bookkeeping-db";
const DB_VERSION = 1;

interface BookkeepingDB extends DBSchema {
  entities: { key: string; value: Entity };
  accounts: { key: string; value: Account; indexes: { entityId: string } };
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      entityId: string;
      accountId: string;
      date: string;
      vendorId: string;
      categoryId: string;
      importBatchId: string;
      reconciliationStatus: string;
    };
  };
  categories: { key: string; value: Category };
  vendors: { key: string; value: Vendor };
  customers: { key: string; value: Customer };
  projects: { key: string; value: Project; indexes: { entityId: string } };
  rules: { key: string; value: Rule };
  reconciliationSessions: {
    key: string;
    value: ReconciliationSession;
    indexes: { accountId: string };
  };
  documents: { key: string; value: DocumentRecord; indexes: { transactionId: string } };
  importBatches: { key: string; value: ImportBatch; indexes: { accountId: string } };
  savedMappings: { key: string; value: SavedMapping };
  settings: { key: string; value: AppSettings };
  audit: { key: string; value: AuditEntry };
}

let dbPromise: Promise<IDBPDatabase<BookkeepingDB>> | null = null;

export function getDB() {
  if (typeof window === "undefined") {
    throw new Error("getDB() can only be called in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<BookkeepingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("entities")) {
          db.createObjectStore("entities", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("accounts")) {
          const s = db.createObjectStore("accounts", { keyPath: "id" });
          s.createIndex("entityId", "entityId");
        }
        if (!db.objectStoreNames.contains("transactions")) {
          const s = db.createObjectStore("transactions", { keyPath: "id" });
          s.createIndex("entityId", "entityId");
          s.createIndex("accountId", "accountId");
          s.createIndex("date", "date");
          s.createIndex("vendorId", "vendorId");
          s.createIndex("categoryId", "categoryId");
          s.createIndex("importBatchId", "importBatchId");
          s.createIndex("reconciliationStatus", "reconciliationStatus");
        }
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("vendors")) {
          db.createObjectStore("vendors", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("customers")) {
          db.createObjectStore("customers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("projects")) {
          const s = db.createObjectStore("projects", { keyPath: "id" });
          s.createIndex("entityId", "entityId");
        }
        if (!db.objectStoreNames.contains("rules")) {
          db.createObjectStore("rules", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("reconciliationSessions")) {
          const s = db.createObjectStore("reconciliationSessions", { keyPath: "id" });
          s.createIndex("accountId", "accountId");
        }
        if (!db.objectStoreNames.contains("documents")) {
          const s = db.createObjectStore("documents", { keyPath: "id" });
          s.createIndex("transactionId", "transactionId");
        }
        if (!db.objectStoreNames.contains("importBatches")) {
          const s = db.createObjectStore("importBatches", { keyPath: "id" });
          s.createIndex("accountId", "accountId");
        }
        if (!db.objectStoreNames.contains("savedMappings")) {
          db.createObjectStore("savedMappings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("audit")) {
          db.createObjectStore("audit", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// Generic helpers -----------------------------------------------------

export async function getAll<K extends keyof BookkeepingDB>(
  store: K
): Promise<BookkeepingDB[K]["value"][]> {
  const db = await getDB();
  // @ts-expect-error generic store access
  return db.getAll(store);
}

export async function getOne<K extends keyof BookkeepingDB>(
  store: K,
  id: string
): Promise<BookkeepingDB[K]["value"] | undefined> {
  const db = await getDB();
  // @ts-expect-error generic store access
  return db.get(store, id);
}

export async function put<K extends keyof BookkeepingDB>(
  store: K,
  value: BookkeepingDB[K]["value"]
): Promise<void> {
  const db = await getDB();
  // @ts-expect-error generic store access
  await db.put(store, value);
}

export async function bulkPut<K extends keyof BookkeepingDB>(
  store: K,
  values: BookkeepingDB[K]["value"][]
): Promise<void> {
  const db = await getDB();
  // @ts-expect-error generic store access
  const tx = db.transaction(store, "readwrite");
  await Promise.all(values.map((v) => tx.store.put(v)));
  await tx.done;
}

export async function remove<K extends keyof BookkeepingDB>(
  store: K,
  id: string
): Promise<void> {
  const db = await getDB();
  // @ts-expect-error generic store access
  await db.delete(store, id);
}

export async function getByIndex<K extends keyof BookkeepingDB>(
  store: K,
  index: string,
  value: string
): Promise<BookkeepingDB[K]["value"][]> {
  const db = await getDB();
  // @ts-expect-error generic store access
  return db.getAllFromIndex(store, index, value);
}

export async function clearStore<K extends keyof BookkeepingDB>(store: K): Promise<void> {
  const db = await getDB();
  // @ts-expect-error generic store access
  await db.clear(store);
}

export async function wipeDatabase(): Promise<void> {
  const stores: (keyof BookkeepingDB)[] = [
    "entities",
    "accounts",
    "transactions",
    "categories",
    "vendors",
    "customers",
    "projects",
    "rules",
    "reconciliationSessions",
    "documents",
    "importBatches",
    "savedMappings",
    "settings",
    "audit",
  ];
  for (const s of stores) {
    await clearStore(s);
  }
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await put("audit", entry);
}
