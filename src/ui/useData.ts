import { useCallback, useEffect, useState } from 'preact/hooks';
import { getSettings, listCards, listExpenses, listKnownSuppliers, listRecipients, listRoutes } from '../db';
import type { Card, Expense, KnownSupplier, Recipient, Route, Settings } from '../types';

export interface AppData {
  expenses: Expense[];
  recipients: Recipient[];
  cards: Card[];
  routes: Route[];
  settings: Settings;
  suppliers: KnownSupplier[];
}

export async function loadData(): Promise<AppData> {
  const [expenses, recipients, cards, routes, settings, suppliers] = await Promise.all([
    listExpenses(), listRecipients(), listCards(), listRoutes(), getSettings(), listKnownSuppliers(),
  ]);
  return { expenses, recipients, cards, routes, settings, suppliers };
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
