export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Try hard to turn whatever a spreadsheet cell contains (Excel serial
// number, "1/5/2026", "2026-01-05", a JS Date object) into an ISO date.
export function parseFlexibleDate(value: unknown): string {
  if (value instanceof Date) return toISODate(value);
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return toISODate(d);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = /^\d{4}-\d{2}-\d{2}/;
    if (iso.test(trimmed)) return trimmed.slice(0, 10);
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return toISODate(d);
  }
  return "";
}

export function parseFlexibleAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
