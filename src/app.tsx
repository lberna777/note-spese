import { useEffect, useState } from 'preact/hooks';
import { currentMonth, todayIso } from './labels';
import { applyTheme } from './theme';
import type { Expense, ReceiptDraft, Recipient } from './types';
import { AdvancesScreen } from './ui/AdvancesScreen';
import { BrandBar } from './ui/BrandBar';
import { Tabs, useMediaQuery } from './ui/common';
import { DesktopSidebar, type DesktopTab } from './ui/DesktopSidebar';
import { ExpenseForm } from './ui/ExpenseForm';
import { MonthDesktop, NotePanel } from './ui/MonthDesktop';
import { MonthScreen, monthGroups } from './ui/MonthScreen';
import { NoteScreen } from './ui/NoteScreen';
import { ReadingScreen } from './ui/ReadingScreen';
import { ScanScreen } from './ui/ScanScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { useData } from './ui/useData';
import './ui/fonts.css';
import './ui/styles.css';

type PhoneTab = 'mese' | 'anticipi' | 'impostazioni';
const PHONE_TAB_LABELS: Record<PhoneTab, string> = { mese: 'Mese', anticipi: 'Anticipi', impostazioni: 'Impostazioni' };
type Overlay =
  | { kind: 'scan'; file: File }
  | { kind: 'reading'; file: Blob; notice?: string }
  | { kind: 'form'; existing?: Expense; photoId?: string | null; draft?: ReceiptDraft; warning?: string | null }
  | { kind: 'note'; recipient: Recipient }
  | null;

// Da questa larghezza l'app occupa tutto lo schermo con tre colonne (docs/design.md).
export const DESKTOP_QUERY = '(min-width: 900px)';

export function App() {
  const { data, reload, error } = useData();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [tab, setTab] = useState<DesktopTab>('mese');
  const [month, setMonth] = useState(currentMonth());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<string | null>(null);

  // Il tema e la scelta Automatico · Chiaro · Scuro si applicano appena i dati sono pronti; con Automatico
  // si riapplicano quando il sistema cambia, per aggiornare il colore della barra del browser.
  const theme = data?.theme;
  const appearance = data?.settings.appearance ?? 'auto';
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme, appearance);
    if (appearance !== 'auto' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(theme, appearance);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, appearance]);

  const goTab = (t: DesktopTab) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  // Se l'archivio si sblocca (l'altra scheda è stata chiusa) i dati arrivano e l'avviso sparisce.
  if (error && !data) {
    return (
      <div class="screen center">
        <p class="alert-box">{error}</p>
        <button type="button" class="btn-fill" onClick={() => location.reload()}>Ricarica</button>
      </div>
    );
  }
  if (!data) return <div class="screen center"><p>Carico…</p></div>;

  const defaultDate = month === currentMonth() ? todayIso() : `${month}-01`;
  const close = async () => {
    setOverlay(null);
    await reload();
  };
  const groups = monthGroups(data, month);
  const group = groups.find((g) => g.r.id === recipientId) ?? groups[0] ?? null;
  // «Destinatari e tratte» esiste solo sul computer; sul telefono sta dentro Impostazioni.
  const phoneTab: PhoneTab = tab === 'destinatari' ? 'impostazioni' : tab;

  // Foto → scansione (ritaglio e raddrizzamento) → lettura → conferma. La foto originale non si conserva.
  const onPhoto = (file: File) => setOverlay({ kind: 'scan', file });
  const onEdit = (existing: Expense) => {
    setSelectedExpense(existing.id);
    setOverlay({ kind: 'form', existing });
  };
  const onManual = () => setOverlay({ kind: 'form' });

  // Il modulo sale sopra la schermata (foglio dal basso sul telefono, pannello a destra sul computer):
  // chiudendolo si ritrova lo scorrimento di prima.
  const overlays = (
    <>
      {overlay?.kind === 'scan' ? (
        <ScanScreen
          key={overlay.file.lastModified + overlay.file.name + overlay.file.size}
          file={overlay.file}
          onDone={(image, notice) => setOverlay({ kind: 'reading', file: image, notice })}
          onCancel={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.kind === 'reading' ? (
        <ReadingScreen
          file={overlay.file}
          notice={overlay.notice}
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
          preferredRecipientId={desktop ? group?.r.id ?? null : null}
          onSaved={() => void close()}
          onCancel={() => void close()}
        />
      ) : null}
      {overlay?.kind === 'note' ? (
        <NoteScreen data={data} recipient={overlay.recipient} month={month} onClose={() => void close()} />
      ) : null}
    </>
  );

  if (desktop) {
    return (
      <>
        <div class="pc" aria-hidden={overlay ? true : undefined}>
          <DesktopSidebar
            theme={data.theme}
            tab={tab}
            onTab={goTab}
            month={month}
            onMonth={setMonth}
            groups={groups}
            selectedId={group?.r.id ?? null}
            onSelect={setRecipientId}
            lastBackupAt={data.settings.lastBackupAt}
          />
          {tab === 'mese' ? (
            <>
              <MonthDesktop data={data} month={month} group={group} selectedId={selectedExpense} onPhoto={onPhoto} onManual={onManual} onEdit={onEdit} />
              <NotePanel data={data} month={month} group={group} onEdit={onEdit} />
            </>
          ) : (
            <main class="pc-main wide">
              {tab === 'anticipi' ? <AdvancesScreen data={data} month={month} onMonth={setMonth} desktop /> : null}
              {tab === 'destinatari' ? <SettingsScreen data={data} reload={reload} part="lists" desktop /> : null}
              {tab === 'impostazioni' ? <SettingsScreen data={data} reload={reload} part="general" desktop /> : null}
            </main>
          )}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div class="app" aria-hidden={overlay ? true : undefined}>
        <header class="ph-header">
          <div class="ph-top">
            <BrandBar theme={data.theme} />
            <span class="lbl">Note spese</span>
          </div>
          <Tabs
            label="Sezioni"
            value={phoneTab}
            onChange={goTab}
            options={(Object.keys(PHONE_TAB_LABELS) as PhoneTab[]).map((t) => ({ value: t, label: PHONE_TAB_LABELS[t] }))}
          />
        </header>
        <main>
          {phoneTab === 'mese' ? (
            <MonthScreen
              data={data}
              month={month}
              onMonth={setMonth}
              onPhoto={onPhoto}
              onManual={onManual}
              onEdit={onEdit}
              onNote={(recipient) => setOverlay({ kind: 'note', recipient })}
              onGoSettings={() => goTab('impostazioni')}
            />
          ) : null}
          {phoneTab === 'anticipi' ? <AdvancesScreen data={data} month={month} onMonth={setMonth} desktop={false} /> : null}
          {phoneTab === 'impostazioni' ? <SettingsScreen data={data} reload={reload} part="all" desktop={false} /> : null}
        </main>
      </div>
      {overlays}
    </>
  );
}
