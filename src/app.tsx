import { useEffect, useState } from 'preact/hooks';
import { currentMonth, todayIso } from './labels';
import { applyTheme } from './theme';
import type { Expense, ReceiptDraft, Recipient } from './types';
import { BrandBar } from './ui/BrandBar';
import { AdvancesScreen } from './ui/AdvancesScreen';
import { ExpenseForm } from './ui/ExpenseForm';
import { Segmented } from './ui/common';
import { MonthScreen } from './ui/MonthScreen';
import { NoteScreen } from './ui/NoteScreen';
import { ReadingScreen } from './ui/ReadingScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { useData } from './ui/useData';
import './ui/fonts.css';
import './ui/styles.css';

type Tab = 'mese' | 'anticipi' | 'impostazioni';
const TAB_LABELS: Record<Tab, string> = { mese: 'Mese', anticipi: 'Anticipi', impostazioni: 'Impostazioni' };
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
  const [compact, setCompact] = useState(false);

  // Il tema (colori, caratteri, colore della barra del browser) si applica appena i dati sono pronti.
  const theme = data?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  // Titolo piccolo al centro della barra: compare quando il titolo grande esce dallo schermo.
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 32);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goTab = (t: Tab) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  // Se l'archivio si sblocca (l'altra scheda è stata chiusa) i dati arrivano e l'avviso sparisce.
  if (error && !data) {
    return (
      <div class="screen center">
        <p class="group alert-box">{error}</p>
        <button type="button" class="btn" onClick={() => location.reload()}>Ricarica</button>
      </div>
    );
  }
  if (!data) return <div class="screen center"><p>Carico…</p></div>;

  const defaultDate = month === currentMonth() ? todayIso() : `${month}-01`;
  const close = async () => {
    setOverlay(null);
    await reload();
  };
  const title = TAB_LABELS[tab];

  // La schermata resta sotto: il foglio le sale sopra e, chiudendolo, si ritrova lo scorrimento di prima.
  return (
    <>
      <div class="app" aria-hidden={overlay ? true : undefined}>
        <header class={`app-header${compact ? ' compact' : ''}`}>
          <div class="bar-row">
            <div class="bar-brand">{theme ? <BrandBar theme={theme} /> : null}</div>
            <div class="bar-title" aria-hidden="true">{title}</div>
          </div>
          <div class="seg-row">
            <Segmented
              nav
              label="Sezioni"
              value={tab}
              onChange={goTab}
              options={(Object.keys(TAB_LABELS) as Tab[]).map((t) => ({ value: t, label: TAB_LABELS[t] }))}
            />
          </div>
        </header>
        <main>
          <h1 class="large-title">{title}</h1>
          {tab === 'mese' ? (
            <MonthScreen
              data={data}
              month={month}
              onMonth={setMonth}
              onPhoto={(file) => setOverlay({ kind: 'reading', file })}
              onManual={() => setOverlay({ kind: 'form' })}
              onEdit={(existing) => setOverlay({ kind: 'form', existing })}
              onNote={(recipient) => setOverlay({ kind: 'note', recipient })}
              onGoSettings={() => goTab('impostazioni')}
            />
          ) : null}
          {tab === 'anticipi' ? <AdvancesScreen data={data} month={month} onMonth={setMonth} /> : null}
          {tab === 'impostazioni' ? <SettingsScreen data={data} reload={reload} /> : null}
        </main>
      </div>
      {overlay?.kind === 'reading' ? (
        <ReadingScreen
          file={overlay.file}
          data={data}
          onDone={(r) => setOverlay({ kind: 'form', photoId: r.photoId, draft: r.draft, warning: r.warning })}
        />
      ) : null}
      {overlay?.kind === 'form' ? (
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
      ) : null}
      {overlay?.kind === 'note' ? (
        <NoteScreen data={data} recipient={overlay.recipient} month={month} onClose={() => void close()} />
      ) : null}
    </>
  );
}
