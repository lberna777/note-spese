import { kindLabel } from '../labels';
import { formatEuro } from '../money';
import { advanceSummary } from '../totals';
import { MonthPicker } from './common';
import type { AppData } from './useData';

export function AdvancesScreen(props: { data: AppData; month: string; onMonth: (m: string) => void }) {
  const rows = advanceSummary(props.data.expenses, props.data.recipients, props.month);
  const total = rows.reduce((s, r) => s + r.advancedCents, 0);
  return (
    <div class="page">
      <h1>I tuoi anticipi</h1>
      <MonthPicker month={props.month} onChange={props.onMonth} />
      <p class="muted">Quanto hai anticipato con la carta personale e deve esserti rimborsato.</p>
      <ul class="expenses">
        {rows.map((r) => (
          <li key={r.recipient.id} class="expense static">
            <span class="grow">{r.recipient.name}<small>{kindLabel(r.recipient.kind, props.data.theme)}</small></span>
            <strong>{formatEuro(r.advancedCents)}</strong>
          </li>
        ))}
      </ul>
      <dl class="totals">
        <div class="strong"><dt>Totale da ricevere</dt><dd>{formatEuro(total)}</dd></div>
      </dl>
    </div>
  );
}
