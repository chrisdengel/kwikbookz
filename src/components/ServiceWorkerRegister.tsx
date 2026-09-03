"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a progressive enhancement — silently ignore
        // registration failures (e.g. unsupported browser, dev server quirks).
      });
    }
  }, []);
  return null;
}
