import { useCallback, useEffect, useState } from 'preact/hooks';
import { getSettings, getTheme, listExpenses, listKnownSuppliers, listRecipients, listRoutes } from '../db';
import type { Theme } from '../theme';
import type { Expense, KnownSupplier, Recipient, Route, Settings } from '../types';

export interface AppData {
  expenses: Expense[];
  recipients: Recipient[];
  routes: Route[];
  settings: Settings;
  suppliers: KnownSupplier[];
  theme: Theme;
}

export async function loadData(): Promise<AppData> {
  const [expenses, recipients, routes, settings, suppliers, theme] = await Promise.all([
    listExpenses(), listRecipients(), listRoutes(), getSettings(), listKnownSuppliers(), getTheme(),
  ]);
  return { expenses, recipients, routes, settings, suppliers, theme };
}

export function useData(): { data: AppData | null; reload: () => Promise<void>; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await loadData());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, reload, error };
}
