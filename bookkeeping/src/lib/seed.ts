import { v4 as uuid } from "uuid";
import { getAll, put } from "./db";
import type { AppSettings, Category } from "./types";

const DEFAULT_CATEGORIES: { name: string; group: Category["group"] }[] = [
  { name: "Sales", group: "Income" },
  { name: "Service Income", group: "Income" },
  { name: "Rental Income", group: "Income" },
  { name: "Other Income", group: "Income" },

  { name: "Advertising", group: "Operating Expenses" },
  { name: "Auto/Vehicle", group: "Operating Expenses" },
  { name: "Bank Fees", group: "Operating Expenses" },
  { name: "Dues & Subscriptions", group: "Operating Expenses" },
  { name: "Insurance", group: "Operating Expenses" },
  { name: "Meals", group: "Operating Expenses" },
  { name: "Office", group: "Operating Expenses" },
  { name: "Professional Services", group: "Operating Expenses" },
  { name: "Rent", group: "Operating Expenses" },
  { name: "Repairs & Maintenance", group: "Operating Expenses" },
  { name: "Supplies", group: "Operating Expenses" },
  { name: "Telephone/Internet", group: "Operating Expenses" },
  { name: "Travel", group: "Operating Expenses" },
  { name: "Utilities", group: "Operating Expenses" },

  { name: "Equipment", group: "Property/Equipment" },
  { name: "Vehicles", group: "Property/Equipment" },
  { name: "Buildings", group: "Property/Equipment" },
  { name: "Improvements", group: "Property/Equipment" },
  { name: "Land", group: "Property/Equipment" },

  { name: "Loan Payment", group: "Financial" },
  { name: "Interest", group: "Financial" },
  { name: "Owner Draw", group: "Financial" },
  { name: "Owner Contribution", group: "Financial" },
  { name: "Transfer", group: "Financial" },
];

export async function ensureSeedData(): Promise<void> {
  const categories = await getAll("categories");
  if (categories.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await put("categories", { id: uuid(), name: c.name, group: c.group, custom: false });
    }
  }

  const settingsList = await getAll("settings");
  if (settingsList.length === 0) {
    const settings: AppSettings = {
      id: "singleton",
      capexThreshold: 2500,
      activeEntityId: "all",
      dedupeAmountTolerance: 0.01,
      dedupeDateToleranceDays: 3,
    };
    await put("settings", settings);
  }
}

export async function getSettings(): Promise<AppSettings> {
  const all = await getAll("settings");
  if (all.length > 0) return all[0];
  const settings: AppSettings = {
    id: "singleton",
    capexThreshold: 2500,
    activeEntityId: "all",
    dedupeAmountTolerance: 0.01,
    dedupeDateToleranceDays: 3,
  };
  await put("settings", settings);
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await put("settings", settings);
}
