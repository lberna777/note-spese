import { kindLabel } from '../labels';
import { formatEuro } from '../money';
import { advanceSummary } from '../totals';
import { Group, MonthPicker } from './common';
import type { AppData } from './useData';

export function AdvancesScreen(props: { data: AppData; month: string; onMonth: (m: string) => void }) {
  const rows = advanceSummary(props.data.expenses, props.data.recipients, props.month);
  const total = rows.reduce((s, r) => s + r.advancedCents, 0);
  return (
    <div class="page">
      <MonthPicker month={props.month} onChange={props.onMonth} />
      <Group title="Per destinatario" footer="Quanto hai anticipato con la carta personale e deve esserti rimborsato.">
        {rows.length === 0 ? <div class="row empty">Nessun anticipo in questo mese.</div> : null}
        {rows.map((r) => (
          <div class="row two-line" key={r.recipient.id}>
            <span class="grow">
              <span class="primary-text">{r.recipient.name}</span>
              <span class="secondary-text">{kindLabel(r.recipient.kind, props.data.theme)}</span>
            </span>
            <span class="amount">{formatEuro(r.advancedCents)}</span>
          </div>
        ))}
      </Group>
      <Group>
        <div class="row">
          <span class="grow strong-text">Totale da ricevere</span>
          <span class="amount">{formatEuro(total)}</span>
        </div>
      </Group>
    </div>
  );
}
