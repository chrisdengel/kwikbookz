// Core data model for the bookkeeping application.
// Everything lives in IndexedDB (see db.ts). These types define every store.

export type ID = string;

export interface Entity {
  id: ID;
  name: string;
  archived: boolean;
  createdAt: string;
  notes?: string;
}

export type AccountType =
  | "Checking"
  | "Savings"
  | "Credit Card"
  | "Cash"
  | "Loan"
  | "Investment"
  | "Other Asset"
  | "Other Liability";

export interface Account {
  id: ID;
  entityId: ID;
  name: string;
  institution?: string;
  type: AccountType;
  lastFour?: string;
  code?: string; // optional GL account number, e.g. "1010" — for a chart of accounts
  openingBalance: number;
  active: boolean;
  createdAt: string;
}

export interface Category {
  id: ID;
  name: string;
  group: "Income" | "Operating Expenses" | "Property/Equipment" | "Financial" | "Custom";
  custom: boolean;
  code?: string; // optional GL account number, e.g. "4000" — for a chart of accounts
}

export interface Vendor {
  id: ID;
  displayName: string;
  aliases: string[]; // raw description strings that map to this vendor
  defaultCategoryId?: ID;
}

export interface Customer {
  id: ID;
  name: string;
}

export interface Project {
  id: ID;
  entityId: ID;
  name: string;
  active: boolean;
}

export type TransactionType =
  | "Income"
  | "Expense"
  | "Transfer"
  | "Owner Draw"
  | "Owner Contribution"
  | "Loan"
  | "Loan Payment"
  | "Refund"
  | "Reimbursement"
  | "Personal";

export type ReconciliationStatus = "Unreconciled" | "Pending" | "Reconciled";
export type TaxDocStatus = "Present" | "Missing" | "Not Applicable";

export interface Transaction {
  id: ID;
  date: string; // ISO transaction date
  postedDate?: string;
  description: string; // raw/original description
  normalizedMerchant?: string;
  amount: number; // always positive magnitude
  direction: "debit" | "credit"; // debit = money out, credit = money in
  entityId: ID;
  accountId: ID;
  vendorId?: ID;
  categoryId?: ID;
  projectId?: ID;
  type: TransactionType;
  memo?: string;
  taxDocStatus: TaxDocStatus;
  taxTreatment?: string;
  documentIds: ID[];
  reconciliationStatus: ReconciliationStatus;
  reconciliationSessionId?: ID;
  importBatchId?: ID;
  source: "import" | "manual";
  originalData?: Record<string, unknown>;
  externalId?: string; // bank-provided transaction id, if present
  capexFlag?: "Potential CAPEX" | "Capitalized" | "Expensed" | null;
  transferPairId?: ID; // links two transactions that form a transfer
  needsReview: boolean;
  ignored: boolean;
  customFields?: Record<string, string>; // any additional source columns you chose to keep on import, keyed by original column name
  createdAt: string;
  updatedAt: string;
}

// ---------------- RULE ENGINE ----------------

export type RuleField =
  | "entity"
  | "account"
  | "cardLastFour"
  | "merchant"
  | "description"
  | "amount"
  | "amountRange"
  | "category"
  | "transactionType"
  | "dateRange";

export type RuleOperator =
  | "equals"
  | "contains"
  | "startsWith"
  | "gte"
  | "lte"
  | "between";

export interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string | number;
  value2?: string | number; // for between/range
}

export type RuleActionType =
  | "assignEntity"
  | "assignAccount"
  | "assignVendor"
  | "assignCategory"
  | "assignProject"
  | "markPersonal"
  | "markOwnerDraw"
  | "markTransfer"
  | "flagCapex"
  | "ignore"
  | "requireReview";

export interface RuleAction {
  type: RuleActionType;
  value?: string; // id or literal, depending on action
}

export interface Rule {
  id: ID;
  name: string;
  enabled: boolean;
  priority: number; // lower runs first
  conditions: RuleCondition[]; // AND'ed together
  actions: RuleAction[];
  createdAt: string;
}

// ---------------- IMPORT ----------------

export interface ColumnMapping {
  date?: string;
  postedDate?: string;
  description?: string;
  debit?: string;
  credit?: string;
  amount?: string;
  account?: string;
  externalId?: string;
  // Optional extra columns some bank/card exports include. None of these are
  // required — if left unmapped, the raw row is still preserved in full on
  // the transaction's originalData, just not surfaced anywhere.
  merchantHint?: string; // e.g. "Appears On Your Statement As" — a cleaner merchant name than the raw description
  memo?: string; // e.g. "Extended Details" — free-text notes, invoice numbers, etc.
  categoryHint?: string; // e.g. "Receipt"/"Category" — the bank's own category label; matched against your category names
  extraColumns?: string[]; // any other columns to keep as-is, visible on the transaction under their original names
  // Only relevant when a single signed `amount` column is used. Most bank
  // checking/savings exports show withdrawals as negative ("negative-is-debit").
  // Most credit card exports show charges as positive and payments/credits as
  // negative ("positive-is-debit") — the opposite convention.
  amountSignConvention?: "negative-is-debit" | "positive-is-debit";
}

export interface ImportBatch {
  id: ID;
  entityId: ID;
  accountId: ID;
  filename: string;
  importedAt: string;
  rowCount: number;
  newCount: number;
  duplicateCount: number;
  format: "csv" | "xls" | "xlsx" | "pdf";
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  statementBeginningBalance?: number;
  statementEndingBalance?: number;
}

export interface SavedMapping {
  id: ID;
  signature: string; // hash of header row, to auto-detect recurring bank formats
  bankLabel: string;
  mapping: ColumnMapping;
}

// ---------------- RECONCILIATION ----------------

export interface ReconciliationSession {
  id: ID;
  accountId: ID;
  entityId: ID;
  statementStart: string;
  statementEnd: string;
  beginningBalance: number;
  endingBalance: number;
  calculatedEndingBalance: number;
  difference: number;
  status: "in_progress" | "reconciled" | "abandoned";
  transactionIds: ID[];
  suspectTransactionIds: ID[];
  createdAt: string;
  completedAt?: string;
}

// ---------------- DOCUMENTS ----------------

export interface DocumentRecord {
  id: ID;
  transactionId?: ID;
  filename: string;
  mimeType: string;
  blob: Blob;
  uploadedAt: string;
}

// ---------------- SETTINGS / AUDIT ----------------

export interface AppSettings {
  id: "singleton";
  capexThreshold: number;
  activeEntityId: ID | "all";
  lastBackupAt?: string;
  dedupeAmountTolerance: number; // dollars
  dedupeDateToleranceDays: number;
}

export interface AuditEntry {
  id: ID;
  timestamp: string;
  action:
    | "transaction_created"
    | "transaction_edited"
    | "category_changed"
    | "rule_applied"
    | "reconciliation_completed"
    | "document_attached"
    | "transaction_deleted";
  entityRef?: ID; // e.g. transaction id
  previousValue?: unknown;
  newValue?: unknown;
  notes?: string;
}
