import { kindLabel, monthLabel } from '../labels';
import { formatEuro } from '../money';
import { advanceSummary, splitByKind } from '../totals';
import { Group, MonthPicker, ScreenTitle } from './common';
import type { AppData } from './useData';

// Anticipi: per ogni destinatario quanto il consulente ha pagato con la carta personale. Stessa griglia sul telefono e sul computer.
export function AdvancesScreen(props: { data: AppData; month: string; onMonth: (m: string) => void; desktop: boolean }) {
  const rows = advanceSummary(props.data.expenses, props.data.recipients, props.month);
  const total = rows.reduce((s, r) => s + r.advancedCents, 0);
  const { company, clients } = splitByKind(rows, (r) => r.recipient);
  const line = (r: (typeof rows)[number]) => (
    <div class="row two-line" key={r.recipient.id}>
      <span class="grow">
        <span class="primary-text">{r.recipient.name}</span>
        <span class="secondary-text">{kindLabel(r.recipient.kind, props.data.theme)}</span>
      </span>
      <span class="amount num">{formatEuro(r.advancedCents)}</span>
    </div>
  );
  return (
    <div class="page">
      {props.desktop ? (
        <div class="pc-head"><div><div class="lbl head-sub">Quanto ti deve essere rimborsato</div><h1>Anticipi</h1></div></div>
      ) : (
        <ScreenTitle title="Anticipi" sub={monthLabel(props.month)} month={props.month} onMonth={props.onMonth} />
      )}
      {props.desktop ? <MonthPicker month={props.month} onChange={props.onMonth} /> : null}
      {company.length > 0 ? <Group title="La tua azienda" class="company" footer="Nota spese interna">{company.map(line)}</Group> : null}
      {clients.length > 0 ? <Group title="Clienti">{clients.map(line)}</Group> : null}
      {rows.length === 0 ? <Group title="Per destinatario"><div class="row empty">Nessun anticipo in questo mese.</div></Group> : null}
      <Group footer="Quanto hai anticipato con la carta personale e deve esserti rimborsato.">
        <div class="row total">
          <span class="grow lbl">Totale da ricevere</span>
          <span class="amount-accent num">{formatEuro(total)}</span>
        </div>
      </Group>
    </div>
  );
}
