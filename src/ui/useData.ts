import { useCallback, useEffect, useState } from 'preact/hooks';
import { setBlockedListener, getSettings, getTheme, listExpenses, listKnownSuppliers, listRecipients, listRoutes } from '../db';
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
    setBlockedListener(() =>
      setError('L’app è aperta anche in un’altra scheda con una versione precedente: chiudi le altre schede di Note spese e ricarica questa pagina.'),
    );
    // Se dopo 10 secondi l'archivio non risponde, meglio un messaggio che un «Carico…» infinito.
    const t = setTimeout(() => {
      setData((d) => {
        if (!d) setError('L’archivio non risponde. Chiudi le altre schede di Note spese e ricarica la pagina.');
        return d;
      });
    }, 10_000);
    void reload().finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      setBlockedListener(undefined);
    };
  }, [reload]);
  return { data, reload, error };
}
