import { useEffect, useState } from 'preact/hooks';
import { currentMonth, todayIso } from './labels';
import { applyTheme } from './theme';
import type { Expense, ReceiptDraft, Recipient } from './types';
import { BrandBar } from './ui/BrandBar';
import { AdvancesScreen } from './ui/AdvancesScreen';
import { ExpenseForm } from './ui/ExpenseForm';
import { MonthScreen } from './ui/MonthScreen';
import { NoteScreen } from './ui/NoteScreen';
import { ReadingScreen } from './ui/ReadingScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { useData } from './ui/useData';
import './ui/fonts.css';
import './ui/styles.css';

type Tab = 'mese' | 'anticipi' | 'impostazioni';
type Overlay =
  | { kind: 'reading'; file: File }
  | { kind: 'form'; existing?: Expense; photoId?: string | null; draft?: ReceiptDraft; warning?: string | null }
  | { kind: 'note'; recipient: Recipient }
  | null;

export function App() {
  const { data, reload, error } = useData();
  const [tab, setTab] = useState<Tab>('mese');
  const [month, setMonth] = useState(currentMonth());
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Il tema (colori, caratteri, colore della barra del browser) si applica appena i dati sono pronti.
  const theme = data?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const screen = (() => {
    if (error) return <div class="screen center"><p class="banner error">Errore nell’archivio: {error}</p></div>;
    if (!data) return <div class="screen center"><p>Carico…</p></div>;

    const defaultDate = month === currentMonth() ? todayIso() : `${month}-01`;
    const close = async () => {
      setOverlay(null);
      await reload();
    };

    if (overlay?.kind === 'reading') {
      return (
        <ReadingScreen
          file={overlay.file}
          data={data}
          onDone={(r) => setOverlay({ kind: 'form', photoId: r.photoId, draft: r.draft, warning: r.warning })}
        />
      );
    }
    if (overlay?.kind === 'form') {
      return (
        <ExpenseForm
          key={overlay.existing?.id ?? overlay.photoId ?? 'nuova'}
          data={data}
          existing={overlay.existing}
          photoId={overlay.photoId}
          draft={overlay.draft}
          warning={overlay.warning}
          defaultDate={defaultDate}
          onSaved={() => void close()}
          onCancel={() => void close()}
        />
      );
    }
    if (overlay?.kind === 'note') {
      return <NoteScreen data={data} recipient={overlay.recipient} month={month} onClose={() => void close()} />;
    }

    return (
      <div class="app">
        <main>
          {tab === 'mese' ? (
            <MonthScreen
              data={data}
              month={month}
              onMonth={setMonth}
              onPhoto={(file) => setOverlay({ kind: 'reading', file })}
              onManual={() => setOverlay({ kind: 'form' })}
              onEdit={(existing) => setOverlay({ kind: 'form', existing })}
              onNote={(recipient) => setOverlay({ kind: 'note', recipient })}
              onGoSettings={() => setTab('impostazioni')}
            />
          ) : null}
          {tab === 'anticipi' ? <AdvancesScreen data={data} month={month} onMonth={setMonth} /> : null}
          {tab === 'impostazioni' ? <SettingsScreen data={data} reload={reload} /> : null}
        </main>
        <nav class="tabs" aria-label="Sezioni">
          {(['mese', 'anticipi', 'impostazioni'] as Tab[]).map((t) => (
            <button key={t} type="button" class={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {t === 'mese' ? 'Mese' : t === 'anticipi' ? 'Anticipi' : 'Impostazioni'}
            </button>
          ))}
        </nav>
      </div>
    );
  })();

  return (
    <>
      {theme ? <BrandBar theme={theme} /> : null}
      {screen}
    </>
  );
}
