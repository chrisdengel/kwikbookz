import { getAll, put, getOne } from "./db";
import { getSettings } from "./seed";
import type { Account, Rule, RuleCondition, Transaction } from "./types";

/**
 * Evaluate a single condition against a transaction. Card-last-four and
 * merchant/description conditions are string matches on raw data since
 * rules must run deterministically, before any vendor normalization is
 * required to exist.
 */
function evaluateCondition(
  cond: RuleCondition,
  txn: Transaction,
  account: Account | undefined
): boolean {
  const val = cond.value;
  switch (cond.field) {
    case "entity":
      return txn.entityId === val;
    case "account":
      return txn.accountId === val;
    case "cardLastFour": {
      const four = String(val);
      const inDescription = txn.description.includes(four);
      const onAccount = account?.lastFour === four;
      return inDescription || onAccount;
    }
    case "merchant": {
      const target = String(val).toUpperCase();
      const merchant = (txn.normalizedMerchant || txn.description).toUpperCase();
      return cond.operator === "equals" ? merchant === target : merchant.includes(target);
    }
    case "description": {
      const target = String(val).toUpperCase();
      const desc = txn.description.toUpperCase();
      if (cond.operator === "startsWith") return desc.startsWith(target);
      if (cond.operator === "equals") return desc === target;
      return desc.includes(target);
    }
    case "amount": {
      const n = Number(val);
      if (cond.operator === "gte") return txn.amount >= n;
      if (cond.operator === "lte") return txn.amount <= n;
      return txn.amount === n;
    }
    case "amountRange": {
      const lo = Number(val);
      const hi = Number(cond.value2 ?? val);
      return txn.amount >= lo && txn.amount <= hi;
    }
    case "category":
      return txn.categoryId === val;
    case "transactionType":
      return txn.type === val;
    case "dateRange": {
      const lo = String(val);
      const hi = String(cond.value2 ?? val);
      return txn.date >= lo && txn.date <= hi;
    }
    default:
      return false;
  }
}

function evaluateRule(rule: Rule, txn: Transaction, account: Account | undefined): boolean {
  if (!rule.enabled) return false;
  return rule.conditions.every((c) => evaluateCondition(c, txn, account));
}

/**
 * Apply the highest-priority matching actions to a transaction, mutating it
 * in place. Returns true if anything changed. Conflicting entity/account
 * assignments across matching rules are flagged for review rather than
 * silently overwritten by a later rule.
 */
export async function applyRulesToTransaction(
  txn: Transaction,
  opts?: { rules?: Rule[]; accounts?: Account[]; capexThreshold?: number }
): Promise<{ txn: Transaction; changed: boolean; conflict: boolean }> {
  const rules = (opts?.rules ?? (await getAll("rules")))
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);
  const accounts = opts?.accounts ?? (await getAll("accounts"));
  const capexThreshold = opts?.capexThreshold ?? (await getSettings()).capexThreshold;
  const account = accounts.find((a) => a.id === txn.accountId);

  let changed = false;
  let conflict = false;
  let entityAssignedBy: string | null = null;
  let accountAssignedBy: string | null = null;

  for (const rule of rules) {
    const acctForEval = accounts.find((a) => a.id === txn.accountId);
    if (!evaluateRule(rule, txn, acctForEval)) continue;

    for (const action of rule.actions) {
      switch (action.type) {
        case "assignEntity": {
          if (
            entityAssignedBy &&
            action.value &&
            txn.entityId &&
            txn.entityId !== action.value
          ) {
            conflict = true;
            txn.needsReview = true;
            break;
          }
          if (action.value && txn.entityId !== action.value) {
            txn.entityId = action.value;
            changed = true;
          }
          entityAssignedBy = rule.id;
          break;
        }
        case "assignAccount": {
          if (
            accountAssignedBy &&
            action.value &&
            txn.accountId &&
            txn.accountId !== action.value
          ) {
            conflict = true;
            txn.needsReview = true;
            break;
          }
          if (action.value && txn.accountId !== action.value) {
            txn.accountId = action.value;
            changed = true;
          }
          accountAssignedBy = rule.id;
          break;
        }
        case "assignVendor":
          if (action.value && txn.vendorId !== action.value) {
            txn.vendorId = action.value;
            changed = true;
          }
          break;
        case "assignCategory":
          if (action.value && txn.categoryId !== action.value) {
            txn.categoryId = action.value;
            changed = true;
          }
          break;
        case "assignProject":
          if (action.value && txn.projectId !== action.value) {
            txn.projectId = action.value;
            changed = true;
          }
          break;
        case "markPersonal":
          txn.type = "Personal";
          changed = true;
          break;
        case "markOwnerDraw":
          txn.type = "Owner Draw";
          changed = true;
          break;
        case "markTransfer":
          txn.type = "Transfer";
          changed = true;
          break;
        case "flagCapex":
          txn.capexFlag = "Potential CAPEX";
          changed = true;
          break;
        case "ignore":
          txn.ignored = true;
          changed = true;
          break;
        case "requireReview":
          txn.needsReview = true;
          changed = true;
          break;
      }
    }
  }

  // Automatic CAPEX threshold check, independent of user-authored rules.
  if (
    txn.direction === "debit" &&
    txn.amount >= capexThreshold &&
    txn.type === "Expense" &&
    !txn.capexFlag
  ) {
    txn.capexFlag = "Potential CAPEX";
    changed = true;
  }

  return { txn, changed, conflict };
}

/**
 * Detect an already-registered card ("****1234") that is associated with
 * more than one entity/account combination. Used both by the rule builder
 * (to stop a user creating a contradictory rule) and by import (to flag
 * incoming transactions whose card is ambiguous instead of guessing).
 */
export async function findCardConflicts(): Promise<
  { lastFour: string; accounts: Account[] }[]
> {
  const accounts = await getAll("accounts");
  const byCard = new Map<string, Account[]>();
  for (const a of accounts) {
    if (!a.lastFour) continue;
    const list = byCard.get(a.lastFour) ?? [];
    list.push(a);
    byCard.set(a.lastFour, list);
  }
  const conflicts: { lastFour: string; accounts: Account[] }[] = [];
  for (const [lastFour, accts] of byCard.entries()) {
    const distinctEntities = new Set(accts.map((a) => a.entityId));
    if (distinctEntities.size > 1) {
      conflicts.push({ lastFour, accounts: accts });
    }
  }
  return conflicts;
}

export async function saveRule(rule: Rule): Promise<void> {
  await put("rules", rule);
}

export async function getAccountByLastFour(
  lastFour: string,
  accounts?: Account[]
): Promise<Account[]> {
  const all = accounts ?? (await getAll("accounts"));
  return all.filter((a) => a.lastFour === lastFour);
}

export async function reapplyAllRules(): Promise<{ updated: number; conflicts: number }> {
  const txns = await getAll("transactions");
  const rules = (await getAll("rules")).filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  const accounts = await getAll("accounts");
  const settings = await getSettings();
  let updated = 0;
  let conflicts = 0;
  for (const t of txns) {
    const result = await applyRulesToTransaction(t, {
      rules,
      accounts,
      capexThreshold: settings.capexThreshold,
    });
    if (result.changed) {
      result.txn.updatedAt = new Date().toISOString();
      await put("transactions", result.txn);
      updated++;
    }
    if (result.conflict) conflicts++;
  }
  return { updated, conflicts };
}

export async function getRuleById(id: string): Promise<Rule | undefined> {
  return getOne("rules", id);
}
