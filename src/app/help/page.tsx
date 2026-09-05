"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/primitives";
import {
  AlertTriangle,
  Building2,
  Wallet,
  Upload,
  ListChecks,
  Scale,
  Store,
  Tags,
  FolderKanban,
  FileText,
  BarChart3,
  Search,
  Settings as SettingsIcon,
  DownloadCloud,
} from "lucide-react";

const SECTIONS = [
  { id: "start-here", label: "Start Here" },
  { id: "backups", label: "Back Up Your Data" },
  { id: "entities-accounts", label: "Entities & Accounts" },
  { id: "importing", label: "Importing Transactions" },
  { id: "categorizing", label: "Categorizing & Rules" },
  { id: "reconciling", label: "Reconciling" },
  { id: "vendors", label: "Vendors" },
  { id: "capex", label: "Potential CAPEX" },
  { id: "documents", label: "Receipts & Documents" },
  { id: "projects", label: "Projects" },
  { id: "reports", label: "Reports" },
  { id: "search", label: "Search" },
  { id: "settings", label: "Settings" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-5xl gap-8">
      <nav className="sticky top-5 hidden h-fit w-48 shrink-0 space-y-0.5 text-sm md:block">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-10 pb-16">
        <div>
          <h1 className="text-xl font-semibold">How to use KwikBookz</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything on this page is written out in full — nothing here assumes you&apos;ve used
            bookkeeping software before. If something still isn&apos;t clear after reading a section,
            that&apos;s a gap worth reporting.
          </p>
        </div>

        <Warn>
          <strong>The single most important thing on this page:</strong> all of your data lives only in
          this browser, on this device. There is no cloud copy. If you clear your browser data, switch
          computers, or this browser profile is lost, your books are gone unless you&apos;ve backed up.
          See <a href="#backups" className="underline">Back Up Your Data</a> below.
        </Warn>

        <Section id="start-here" icon={Building2} title="Start Here">
          <p>The app is organized around a simple order of operations. Do these once, in order:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Create an <Link href="/entities" className="underline">Entity</Link> for each business,
              LLC, or &quot;Personal&quot; bucket you want to track separately. Everything else in the
              app — accounts, transactions, reports — belongs to one entity, so this comes first.
            </li>
            <li>
              Create an <Link href="/accounts" className="underline">Account</Link> for each bank
              account or credit card you want to track, and attach it to the right entity. If it&apos;s a
              card, enter the last 4 digits — this lets the app auto-recognize it during import later.
            </li>
            <li>
              Either <Link href="/import" className="underline">import a statement</Link> (CSV, Excel,
              or PDF) or add transactions one at a time from the{" "}
              <Link href="/transactions" className="underline">Transactions</Link> page.
            </li>
            <li>Set up a few <a href="#categorizing" className="underline">rules</a> so future imports categorize themselves.</li>
            <li>
              <a href="#backups" className="underline">Back up</a> before you close the tab for the day.
            </li>
          </ol>
          <p>
            The entity selector in the top-left of every page filters almost everything you see —
            transactions, accounts, reports — to that one entity, or to &quot;All Entities&quot; for a
            combined view. If a page ever looks emptier than you expect, check that selector first.
          </p>
        </Section>

        <Section id="backups" icon={DownloadCloud} title="Back Up Your Data">
          <p>
            Click <strong>Backup Now</strong> (top-right of every page, and also on the Dashboard and
            Settings page) any time you&apos;ve done meaningful work. It downloads a single ZIP file
            containing everything: every transaction, account, rule, category, vendor, and every receipt
            you&apos;ve attached.
          </p>
          <p>
            The top bar shows <strong>Last Backup</strong> at all times, and turns amber with a warning
            banner if it&apos;s been more than a week. Take that warning seriously — it&apos;s the only
            safety net this app has.
          </p>
          <p>
            To restore, go to <Link href="/settings" className="underline">Settings</Link> →{" "}
            <strong>Restore Backup</strong>, and select a previously-downloaded ZIP. This works in a
            completely fresh browser or a new computer — restoring replaces whatever is currently in this
            browser with the contents of that backup, so use it to move your books, not to merge two sets
            of books together.
          </p>
          <p className="text-slate-500">
            Store backup ZIPs somewhere durable — cloud drive, external drive, wherever you&apos;d keep
            any other important file. The app itself has no way to send a copy anywhere for you.
          </p>
        </Section>

        <Section id="entities-accounts" icon={Wallet} title="Entities & Accounts">
          <p>
            An <strong>Entity</strong> is a top-level bucket — a legal business, an LLC, or a
            &quot;Personal&quot; catch-all. Nothing is ever shared between entities; a transaction, account,
            or category belongs to exactly one.
          </p>
          <p>
            An <strong>Account</strong> is a specific bank account, credit card, loan, or cash account,
            and it belongs to exactly one entity. Give each one a name, a type (Checking, Credit Card,
            etc.), and — if it&apos;s a card — the last 4 digits.
          </p>
          <p>
            <strong>Why the last 4 digits matter:</strong> when you import a statement, the app looks for
            a card number pattern (like <code>****1234</code>) in the transaction text. If it matches an
            account you&apos;ve registered, it automatically assigns that transaction to the right entity
            and account — even if you selected a different one when starting the import. If the same
            last-4 digits are registered on accounts in two different entities, the app will refuse to
            guess and will flag it as a conflict on the Accounts page instead.
          </p>
        </Section>

        <Section id="importing" icon={Upload} title="Importing Transactions">
          <p>
            From <Link href="/import" className="underline">Import</Link>, pick the entity and account
            first, then upload a file:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>CSV / XLS / XLSX</strong> — you&apos;ll map which column is the date, description, and amount (or separate debit/credit columns). The app remembers this mapping for files with the same column headers, so you usually only map a given bank&apos;s export once.</li>
            <li><strong>PDF bank statements</strong> — the app tries to read transaction lines directly out of the PDF&apos;s text. If your PDF is a scanned image rather than real text, it will tell you plainly that it couldn&apos;t be read and ask you to use CSV/Excel instead — it will never guess at transactions that aren&apos;t clearly there.</li>
          </ul>
          <p>
            <strong>Duplicates are handled automatically.</strong> If you import overlapping date ranges
            (say, two statements that both cover part of the same month), the app matches transactions
            against what&apos;s already in your books and silently skips exact duplicates. You&apos;ll see
            a count of how many were skipped after each import — you won&apos;t be asked to review each
            one individually.
          </p>
          <p>
            After import, review anything flagged <strong>Needs Review</strong> or{" "}
            <strong>Potential CAPEX</strong> — those are the exceptions the app couldn&apos;t confidently
            resolve on its own.
          </p>
        </Section>

        <Section id="categorizing" icon={ListChecks} title="Categorizing & Rules">
          <p>
            You can categorize any transaction manually from the{" "}
            <Link href="/transactions" className="underline">Transactions</Link> page — just pick a
            category from the dropdown on that row.
          </p>
          <p>
            To avoid doing that every time, set up a <Link href="/rules" className="underline">Rule</Link>:
            a plain WHEN/DO statement, like &quot;WHEN Description contains LOWE&apos;S → Assign Category
            → Repairs &amp; Maintenance.&quot; Rules run automatically on every future import, in priority
            order. Nothing about rules uses AI — every rule is something you wrote and can read back.
          </p>
          <p>
            If you set up a new rule and want it applied to transactions you already imported, click{" "}
            <strong>Re-apply All Rules</strong> at the top of the Rules page.
          </p>
          <p>
            Need a category that doesn&apos;t exist yet — property taxes, a specific job cost, anything?
            Add it on the <Link href="/categories" className="underline">Categories</Link> page, choosing
            whichever group (Income, Operating Expenses, Property/Equipment, Financial, or Custom) makes
            your reports easiest to read.
          </p>
        </Section>

        <Section id="reconciling" icon={Scale} title="Reconciling">
          <p>
            Reconciling checks that your records match your bank statement. Go to{" "}
            <Link href="/reconcile" className="underline">Reconcile</Link>, pick an account, and enter the
            beginning and ending balance shown on your paper or PDF statement.
          </p>
          <p>
            If the numbers match, you&apos;ll see <strong>RECONCILED</strong> and can mark the period done
            with one click. If they don&apos;t, the app doesn&apos;t dump your whole transaction list on
            you — it looks for the smallest set of transactions (often just one, or a pair) that could
            explain the gap, and shows you only those.
          </p>
        </Section>

        <Section id="vendors" icon={Store} title="Vendors">
          <p>
            Bank statements often show the same vendor under slightly different names — &quot;LOWES
            #1234&quot; one month, &quot;LOWE&apos;S HOME IMPROVEMENT&quot; the next. The{" "}
            <Link href="/vendors" className="underline">Vendors</Link> page lets you create one canonical
            vendor (&quot;LOWE&apos;S&quot;) and attach every variant you see as an alias underneath it.
            Once aliased, rules and reports can treat them as one vendor instead of several.
          </p>
        </Section>

        <Section id="capex" icon={AlertTriangle} title="Potential CAPEX">
          <p>
            Any expense at or above a configurable threshold (default $2,500) gets flagged as{" "}
            <strong>Potential CAPEX</strong> — a heads-up that it might be a capital purchase rather than
            a normal expense, not an automatic decision. Open the transaction and choose Expense,
            Capitalize, or Review Later. The app never classifies this for you, and capitalization/tax
            treatment always depends on your specific situation — this isn&apos;t tax advice. You can
            change the dollar threshold in <Link href="/settings" className="underline">Settings</Link>.
          </p>
        </Section>

        <Section id="documents" icon={FileText} title="Receipts & Documents">
          <p>
            Attach a receipt to any transaction using the paperclip icon on the Transactions page. Files
            (JPG, PNG, HEIC, PDF) are stored in this browser alongside the rest of your data — they go out
            in your backup ZIP and come back on restore. The app doesn&apos;t try to read anything out of
            the receipt automatically; it just proves documentation exists.
          </p>
          <p>
            All attached files are browsable from the <Link href="/documents" className="underline">Documents</Link> page.
          </p>
        </Section>

        <Section id="projects" icon={FolderKanban} title="Projects">
          <p>
            Optional. If you want to track profitability on a specific job (e.g. &quot;Smith Building
            Repair&quot;), create a <Link href="/projects" className="underline">Project</Link> and assign
            transactions to it as you categorize them. The Projects page shows revenue, expenses, and
            profit per project.
          </p>
        </Section>

        <Section id="reports" icon={BarChart3} title="Reports">
          <p>
            <Link href="/reports" className="underline">Reports</Link> covers Profit &amp; Loss, expense
            by category or vendor, account activity, cash flow, a balance sheet, project profitability,
            and a tax-documentation report showing deductible expenses missing a receipt. Every report can
            be filtered by date range, entity, and account, and exported to CSV or XLSX.
          </p>
        </Section>

        <Section id="search" icon={Search} title="Search">
          <p>The search bar at the top works across transactions, vendors, accounts, and projects. Beyond plain text, a few special phrases work directly:</p>
          <ul className="grid grid-cols-2 list-disc gap-1 pl-5 sm:grid-cols-3">
            <li><code>uncategorized</code></li>
            <li><code>needs review</code></li>
            <li><code>no receipt</code></li>
            <li><code>potential capex</code></li>
            <li><code>unreconciled</code></li>
            <li><code>$2,500+</code></li>
            <li><code>august</code> (or any month)</li>
          </ul>
        </Section>

        <Section id="settings" icon={SettingsIcon} title="Settings">
          <p>
            <Link href="/settings" className="underline">Settings</Link> holds the CAPEX threshold,
            duplicate-detection tolerance (how close a date/amount has to be to count as a possible
            duplicate), backup/restore, and — in the danger zone — a full data wipe. Nothing there
            requires a network connection.
          </p>
        </Section>

        <Section id="troubleshooting" icon={AlertTriangle} title="Troubleshooting">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>&quot;My data disappeared.&quot;</strong> Most often this means a different browser, browser profile, or private/incognito window — IndexedDB is scoped to one browser on one device. Restore your latest backup ZIP to bring it back.</li>
            <li><strong>&quot;A transaction imported twice.&quot;</strong> Loosen or tighten the amount/date tolerance in Settings, or check whether the two rows genuinely differ (partial refund vs. original charge, for instance) — the app will not merge two transactions it isn&apos;t confident are the same.</li>
            <li><strong>&quot;My PDF statement wouldn&apos;t import.&quot;</strong> Scanned/image-only PDFs can&apos;t be read reliably without OCR, which this version intentionally doesn&apos;t do. Use your bank&apos;s CSV or Excel export instead.</li>
            <li><strong>&quot;A card keeps getting flagged as a conflict.&quot;</strong> The same last-4 digits are registered on accounts in more than one entity. Give one of them a distinguishing account name or correct the last-4 on the Accounts page.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({
  id, icon: Icon, title, children,
}: { id: string; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-5 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Icon size={18} className="text-emerald-600" /> {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="pt-4 text-sm text-amber-900">{children}</CardContent>
    </Card>
  );
}
