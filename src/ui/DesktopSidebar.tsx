import { kindLabel } from '../labels';
import { formatDecimal } from '../money';
import { splitByKind } from '../totals';
import type { Theme } from '../theme';
import { BrandBar } from './BrandBar';
import { MonthPicker } from './common';
import { backupOverdue, type MonthGroup } from './MonthScreen';

export type DesktopTab = 'mese' | 'anticipi' | 'destinatari' | 'impostazioni';
export const DESKTOP_TAB_LABELS: Record<DesktopTab, string> = {
  mese: 'Mese',
  anticipi: 'Anticipi',
  destinatari: 'Destinatari e tratte',
  impostazioni: 'Impostazioni',
};

// Barra laterale del computer: logo, menu, mese, destinatari del mese con il loro totale, ultimo backup.
export function DesktopSidebar(props: {
  theme: Theme;
  tab: DesktopTab;
  onTab: (t: DesktopTab) => void;
  month: string;
  onMonth: (m: string) => void;
  groups: MonthGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lastBackupAt: string | null;
}) {
  const { theme } = props;
  const backup = props.lastBackupAt ? new Date(props.lastBackupAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const { company, clients } = splitByKind(props.groups, (g) => g.r);
  const list = (gs: MonthGroup[]) => (
    <ul>
      {gs.map(({ r, t }) => (
        <li key={r.id} class={props.selectedId === r.id ? 'on' : ''}>
          <button type="button" onClick={() => props.onSelect(r.id)} aria-pressed={props.selectedId === r.id} title={kindLabel(r.kind, theme)}>
            <span class="dest-name">{r.name}</span>
            <span class="n num">{formatDecimal(t.totalCents)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <aside class="pc-side" aria-label="Menu">
      <div class="side-brand">
        <BrandBar theme={theme} />
        {!theme.logo && !theme.companyName ? <span class="lbl">Note spese</span> : null}
      </div>
      <nav class="nav" aria-label="Sezioni">
        {(Object.keys(DESKTOP_TAB_LABELS) as DesktopTab[]).map((t) => (
          <button type="button" key={t} class={props.tab === t ? 'on' : ''} aria-current={props.tab === t ? 'page' : undefined} onClick={() => props.onTab(t)}>
            {DESKTOP_TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      <MonthPicker month={props.month} onChange={props.onMonth} />
      <div class="dest">
        {props.groups.length === 0 ? <p class="empty small">Nessuna spesa in questo mese.</p> : null}
        {company.length > 0 ? (
          <div class="dest-group company" data-testid="side-company">
            <div class="lbl lbl-accent">Azienda</div>
            {list(company)}
          </div>
        ) : null}
        {clients.length > 0 ? (
          <div class="dest-group" data-testid="side-clients">
            <div class="lbl">Clienti</div>
            {list(clients)}
          </div>
        ) : null}
      </div>
      <div class="side-foot">
        <div class="lbl">Ultimo backup</div>
        <div class={`backup-date${backupOverdue(props.lastBackupAt) ? ' overdue' : ''}`}>
          {backup ?? 'Nessun backup ancora'}
        </div>
        {backupOverdue(props.lastBackupAt) ? (
          <button type="button" class="link-btn" onClick={() => props.onTab('impostazioni')}>Esporta ora</button>
        ) : null}
      </div>
    </aside>
  );
}

