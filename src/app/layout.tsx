import type { Metadata } from "next";
import "./globals.css";
import { AppDataProvider } from "@/components/AppDataContext";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "KwikBookz — local-first bookkeeping",
  description: "Import, categorize, reconcile, and report on your business finances — entirely offline.",
  manifest: "/manifest.json",
  metadataBase: new URL("https://kwikbookz.com"),
  openGraph: {
    title: "KwikBookz",
    description: "Fast, local-first bookkeeping for small businesses.",
    url: "https://kwikbookz.com",
    siteName: "KwikBookz",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full font-sans"
        style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
      >
        <ServiceWorkerRegister />
        <AppDataProvider>
          <AppShell>{children}</AppShell>
        </AppDataProvider>
      </body>
    </html>
  );
}
