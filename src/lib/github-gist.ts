import { getAll } from "./db";
import { getSettings } from "./seed";
import { restoreFromDatabaseJson, type PortableDatabaseJson } from "./backup";
import type { Transaction } from "./types";

// Credentials and the gist ID live in localStorage, deliberately outside
// IndexedDB — that keeps them out of the ZIP backup and out of any future
// export by construction, rather than relying on every export path to
// remember to scrub them.
const TOKEN_KEY = "kwikbookz:github-gist-token";
const GIST_ID_KEY = "kwikbookz:github-gist-id";
const LAST_SYNC_KEY = "kwikbookz:github-gist-last-sync";

const GIST_FILENAME = "kwikbookz-backup.json";
const GIST_DESCRIPTION = "KwikBookz data backup (auto-managed — do not rename the file inside this gist)";

export interface GistCredentials {
  token: string;
  gistId: string | null;
  lastSyncAt: string | null;
}

export function getGistCredentials(): GistCredentials {
  if (typeof window === "undefined") return { token: "", gistId: null, lastSyncAt: null };
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY) ?? "",
      gistId: localStorage.getItem(GIST_ID_KEY),
      lastSyncAt: localStorage.getItem(LAST_SYNC_KEY),
    };
  } catch {
    return { token: "", gistId: null, lastSyncAt: null };
  }
}

export function saveGistToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage unavailable — nothing we can do; caller's UI will just
    // need the token re-entered next visit.
  }
}

export function forgetGistSync(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    // ignore
  }
}

function setGistId(id: string) {
  try {
    localStorage.setItem(GIST_ID_KEY, id);
  } catch {
    // ignore
  }
}

function setLastSync(iso: string) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    // ignore
  }
}

export interface GistSyncResult {
  ok: boolean;
  error?: string;
  gistUrl?: string;
  counts?: Record<string, number>;
}

async function buildPortablePayload(): Promise<{ dbJson: PortableDatabaseJson & { version: number; exportedAt: string }; transactions: Transaction[] }> {
  const [entities, accounts, transactions, categories, vendors, customers, projects, rules, reconciliationSessions, importBatches, audit, settings] =
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
      getAll("importBatches"),
      getAll("audit"),
      getSettings(),
    ]);

  return {
    dbJson: {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities, accounts, categories, vendors, customers, projects, rules,
      reconciliationSessions, importBatches, audit, settings,
    },
    transactions,
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Push the current database (everything except document/receipt blobs —
 * gists are plain-text and not a good fit for binary attachments) to a
 * private GitHub Gist. Creates the gist on first sync, updates the same
 * gist on every sync after that.
 */
export async function pushToGist(): Promise<GistSyncResult> {
  const { token, gistId } = getGistCredentials();
  if (!token) return { ok: false, error: "No GitHub token saved yet." };

  const { dbJson, transactions } = await buildPortablePayload();
  const content = JSON.stringify({ ...dbJson, transactions }, null, 2);

  // GitHub gists are not meant for large payloads — flag it clearly rather
  // than let a confusing API error be the first sign something's wrong.
  const approxSizeMb = new Blob([content]).size / (1024 * 1024);
  if (approxSizeMb > 9) {
    return {
      ok: false,
      error: `Your data is about ${approxSizeMb.toFixed(1)} MB as JSON — too large for a reliable Gist sync (GitHub gists aren't built for large files). Use the ZIP backup instead.`,
    };
  }

  try {
    const body = JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content } },
    });

    const res = gistId
      ? await fetch(`https://api.github.com/gists/${gistId}`, { method: "PATCH", headers: authHeaders(token), body })
      : await fetch(`https://api.github.com/gists`, { method: "POST", headers: authHeaders(token), body });

    if (!res.ok) {
      const detail = await safeErrorDetail(res);
      if (res.status === 401) return { ok: false, error: "GitHub rejected that token. Check it's still valid and has the 'gist' scope." };
      if (res.status === 404 && gistId) return { ok: false, error: "The saved gist no longer exists (deleted on GitHub?). Push again to create a new one." };
      return { ok: false, error: `GitHub API error (${res.status}): ${detail}` };
    }

    const json = await res.json();
    setGistId(json.id);
    const now = new Date().toISOString();
    setLastSync(now);

    return {
      ok: true,
      gistUrl: json.html_url,
      counts: {
        entities: dbJson.entities?.length ?? 0,
        accounts: dbJson.accounts?.length ?? 0,
        transactions: transactions.length,
        rules: dbJson.rules?.length ?? 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Network error reaching GitHub: ${e.message}` : "Network error reaching GitHub." };
  }
}

/**
 * Pull the gist's data back down and restore it (replacing what's currently
 * in this browser — same semantics as restoring a ZIP backup). Document
 * blobs are never part of Gist sync, so they're left untouched either way;
 * if you've restored from a Gist onto a fresh browser, receipts won't be
 * there until you also restore a ZIP backup that has them.
 */
export async function pullFromGist(): Promise<GistSyncResult> {
  const { token, gistId } = getGistCredentials();
  if (!token) return { ok: false, error: "No GitHub token saved yet." };
  if (!gistId) return { ok: false, error: "No gist has been synced from this browser yet — nothing to pull. Push first, from the device that has your data." };

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: authHeaders(token) });
    if (!res.ok) {
      const detail = await safeErrorDetail(res);
      if (res.status === 401) return { ok: false, error: "GitHub rejected that token. Check it's still valid and has the 'gist' scope." };
      if (res.status === 404) return { ok: false, error: "That gist doesn't exist (deleted on GitHub?)." };
      return { ok: false, error: `GitHub API error (${res.status}): ${detail}` };
    }

    const json = await res.json();
    const file = json.files?.[GIST_FILENAME];
    if (!file) return { ok: false, error: `This gist doesn't contain a ${GIST_FILENAME} file — was it modified outside KwikBookz?` };

    let content: string = file.content ?? "";
    if (file.truncated && file.raw_url) {
      const rawRes = await fetch(file.raw_url);
      if (!rawRes.ok) return { ok: false, error: "Gist content was too large to fetch in one piece and the follow-up fetch failed." };
      content = await rawRes.text();
    }

    const parsed = JSON.parse(content) as PortableDatabaseJson & { transactions?: Transaction[] };
    const transactions = parsed.transactions ?? [];

    await restoreFromDatabaseJson(parsed, transactions, "replace");
    const now = new Date().toISOString();
    setLastSync(now);

    return {
      ok: true,
      counts: {
        entities: parsed.entities?.length ?? 0,
        accounts: parsed.accounts?.length ?? 0,
        transactions: transactions.length,
        rules: parsed.rules?.length ?? 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Failed to restore from gist: ${e.message}` : "Failed to restore from gist." };
  }
}

async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return json.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
