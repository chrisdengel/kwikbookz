"use client";

import * as React from "react";
import { X, Construction } from "lucide-react";

const STORAGE_KEY = "kwikbookz:dev-banner-dismissed";

export function DevDisclaimerBanner() {
  const [dismissed, setDismissed] = React.useState(true); // default hidden until we've checked storage, to avoid a flash

  React.useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false); // if localStorage is unavailable, just show it every time rather than crash
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // best effort — if storage isn't available, it'll just show again next visit
    }
  }

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      <div className="flex items-center gap-1.5">
        <Construction size={13} className="shrink-0" />
        <span>
          KwikBookz is under active development — expect occasional bugs, and please keep backups of anything important.
        </span>
      </div>
      <button onClick={dismiss} className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100 hover:text-amber-900" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
