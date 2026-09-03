"use client";

import * as React from "react";
import { getAll } from "@/lib/db";
import { ensureSeedData, getSettings, saveSettings } from "@/lib/seed";
import type { Account, AppSettings, Category, Entity, Project, Vendor } from "@/lib/types";

interface AppDataContextValue {
  ready: boolean;
  entities: Entity[];
  accounts: Account[];
  categories: Category[];
  vendors: Vendor[];
  projects: Project[];
  settings: AppSettings | null;
  activeEntityId: string; // "all" or an Entity id
  setActiveEntityId: (id: string) => void;
  refresh: () => Promise<void>;
}

const AppDataContext = React.createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [entities, setEntities] = React.useState<Entity[]>([]);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [activeEntityId, setActiveEntityIdState] = React.useState<string>("all");

  const refresh = React.useCallback(async () => {
    await ensureSeedData();
    const [e, a, c, v, p, s] = await Promise.all([
      getAll("entities"),
      getAll("accounts"),
      getAll("categories"),
      getAll("vendors"),
      getAll("projects"),
      getSettings(),
    ]);
    setEntities(e.sort((x, y) => x.name.localeCompare(y.name)));
    setAccounts(a);
    setCategories(c);
    setVendors(v);
    setProjects(p);
    setSettings(s);
    setActiveEntityIdState(s.activeEntityId);
    setReady(true);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveEntityId = React.useCallback(
    (id: string) => {
      setActiveEntityIdState(id);
      if (settings) {
        const next = { ...settings, activeEntityId: id };
        setSettings(next);
        saveSettings(next);
      }
    },
    [settings]
  );

  return (
    <AppDataContext.Provider
      value={{
        ready,
        entities,
        accounts,
        categories,
        vendors,
        projects,
        settings,
        activeEntityId,
        setActiveEntityId,
        refresh,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = React.useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
