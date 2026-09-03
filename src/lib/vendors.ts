import { v4 as uuid } from "uuid";
import { getAll, put } from "./db";
import type { Vendor } from "./types";

// Strip store numbers, trailing digits, extra punctuation/whitespace so
// "LOWES #1234", "LOWE'S HOME IMPROVEMENT", "LOWES 1234" have a fighting
// chance of matching a single normalized token even before any alias exists.
export function roughNormalize(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9&' ]/g, " ")
    .replace(/\b\d{3,}\b/g, " ") // drop long digit runs (store #, card tail)
    .replace(/\s+#?\d+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a raw transaction description to a known Vendor, using stored
 * aliases first (exact + prefix match on the rough-normalized string),
 * falling back to null if nothing matches (the row stays unassigned and the
 * user can create/confirm an alias).
 */
export async function resolveVendor(rawDescription: string): Promise<Vendor | null> {
  const vendors = await getAll("vendors");
  const norm = roughNormalize(rawDescription);
  for (const v of vendors) {
    for (const alias of v.aliases) {
      const aliasNorm = roughNormalize(alias);
      if (!aliasNorm) continue;
      if (norm === aliasNorm || norm.startsWith(aliasNorm) || aliasNorm.startsWith(norm)) {
        return v;
      }
    }
    if (roughNormalize(v.displayName) === norm) return v;
  }
  return null;
}

export async function createOrUpdateVendorAlias(
  displayName: string,
  rawDescription: string,
  existingVendorId?: string
): Promise<Vendor> {
  const vendors = await getAll("vendors");
  if (existingVendorId) {
    const v = vendors.find((x) => x.id === existingVendorId);
    if (v) {
      if (!v.aliases.includes(rawDescription)) v.aliases.push(rawDescription);
      await put("vendors", v);
      return v;
    }
  }
  const byName = vendors.find(
    (v) => v.displayName.toUpperCase() === displayName.toUpperCase()
  );
  if (byName) {
    if (!byName.aliases.includes(rawDescription)) byName.aliases.push(rawDescription);
    await put("vendors", byName);
    return byName;
  }
  const vendor: Vendor = {
    id: uuid(),
    displayName,
    aliases: [rawDescription],
  };
  await put("vendors", vendor);
  return vendor;
}
