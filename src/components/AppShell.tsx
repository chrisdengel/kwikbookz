"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "./AppDataContext";
import { Select } from "./ui/primitives";
import { Button } from "./ui/button";
import { globalSearch, type SearchResult } from "@/lib/search";
import { downloadBackup } from "@/lib/backup";
import { formatDateTime } from "@/lib/format";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Scale,
  TrendingUp,
  TrendingDown,
  Store,
  FolderKanban,
  FileText,
  BarChart3,
  Building2,
  ListChecks,
  Tags,
  Settings as SettingsIcon,
  HelpCircle,
  Search,
  DownloadCloud,
  UploadCloud,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/reconcile", label: "Reconcile", icon: Scale },
  { href: "/transactions?type=Income", label: "Income", icon: TrendingUp },
  { href: "/transactions?type=Expense", label: "Expenses", icon: TrendingDown },
  { href: "/vendors", label: "Vendors", icon: Store },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const NAV_BOTTOM = [
  { href: "/entities", label: "Entities", icon: Building2 },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/rules", label: "Rules", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/help", label: "Help", icon: HelpCircle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, entities, activeEntityId, setActiveEntityId, settings, refresh } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [showResults, setShowResults] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    globalSearch(query).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const lastBackup = settings?.lastBackupAt;
  const staleBackup =
    !lastBackup || Date.now() - new Date(lastBackup).getTime() > 1000 * 60 * 60 * 24 * 7;

  async function handleBackup() {
    setBackingUp(true);
    try {
      await downloadBackup();
      await refresh();
    } finally {
      setBackingUp(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400 text-sm">
        Loading your local bookkeeping data…
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark.png" alt="KwikBookz" className="h-8 w-8 rounded-lg" />
          <div>
            <div className="text-lg font-semibold tracking-tight">
              Kwik<span className="text-emerald-600">Bookz</span>
            </div>
            <div className="text-[11px] text-slate-400">kwikbookz.com</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => {
            const active = pathname === item.href.split("?")[0];
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-0.5 border-t border-slate-200 px-2 py-2">
          {NAV_BOTTOM.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="w-56 shrink-0">
            <Select
              value={activeEntityId}
              onChange={(e) => setActiveEntityId(e.target.value)}
              aria-label="Entity selector"
            >
              <option value="all">All Entities</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder='Search — "Home Depot", "uncategorized", "$2,500+"…'
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            {showResults && results.length > 0 && (
              <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {results.slice(0, 20).map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onMouseDown={() => {
                      if (r.type === "transaction") router.push(`/transactions?highlight=${r.id}`);
                      else if (r.type === "vendor") router.push(`/vendors?highlight=${r.id}`);
                      else if (r.type === "account") router.push(`/accounts?highlight=${r.id}`);
                      else if (r.type === "project") router.push(`/projects?highlight=${r.id}`);
                      setShowResults(false);
                    }}
                  >
                    <span className="font-medium text-slate-800">{r.label}</span>
                    {r.sublabel && <span className="text-xs text-slate-400">{r.sublabel}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="text-right text-xs leading-tight">
              <div className="text-slate-400">Last Backup</div>
              <div className={staleBackup ? "font-medium text-amber-600" : "text-slate-600"}>
                {lastBackup ? formatDateTime(lastBackup) : "Never"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleBackup} disabled={backingUp}>
              <DownloadCloud size={14} /> {backingUp ? "Backing up…" : "Backup Now"}
            </Button>
            <Link href="/settings?tab=restore">
              <Button size="sm" variant="ghost">
                <UploadCloud size={14} /> Restore
              </Button>
            </Link>
          </div>
        </header>

        {staleBackup && lastBackup === undefined ? null : staleBackup ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
            You haven&apos;t backed up in over a week. Your data lives only in this browser until you do.
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  );
}
