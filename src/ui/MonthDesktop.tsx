import { useRef } from 'preact/hooks';
import { categoryText, reimburseLabel } from '../export/rows';
import { kindLabel, monthLabel, PAYER_SHORT, shortDate } from '../labels';
import { formatEuro } from '../money';
import type { Expense, Recipient } from '../types';
import { usePhotoUrl } from './common';
import { IconPhotos } from './icons';
import type { MonthGroup } from './MonthScreen';
import { useNoteExport } from './useNoteExport';
import type { AppData } from './useData';

// Località mostrata in tabella: per le spese in auto la tratta, altrimenti il luogo.
function placeText(e: Expense, data: AppData): string {
  const route = e.routeId ? data.routes.find((r) => r.id === e.routeId) : null;
  return route ? `${route.from} – ${route.to}` : e.place;
}

// Il giustificativo serve a tutte le spese tranne quelle in auto, calcolate dai km.
const needsReceipt = (e: Expense) => e.category !== 'auto';

function Thumb(props: { expense: Expense; onClick: () => void }) {
  const url = usePhotoUrl(props.expense.photoId);
  return (
    <button type="button" class="thumb" onClick={props.onClick} title={`${props.expense.supplier || categoryText(props.expense)} · ${shortDate(props.expense.date)}`}>
      {url ? <img src={url} alt={`Giustificativo: ${props.expense.supplier || categoryText(props.expense)}`} /> : <span class="thumb-empty" />}
    </button>
  );
}

// Colonna centrale del Mese sul computer: intestazione, quattro riquadri, tabella.
export function MonthDesktop(props: {
  data: AppData;
  month: string;
  group: MonthGroup | null;
  selectedId: string | null;
  onPhoto: (f: File) => void;
  onManual: () => void;
  onEdit: (e: Expense) => void;
}) {
  const { data, month, group } = props;
  const file = useRef<HTMLInputElement>(null);
  const t = group?.t;
  const picked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) props.onPhoto(f);
  };

  return (
    <main class="pc-main">
      <div class="pc-head">
        <div>
          <div class="lbl head-sub">{group ? `${group.r.name} · ${kindLabel(group.r.kind, data.theme)}` : 'Nessun destinatario'}</div>
          <h1>{monthLabel(month)}</h1>
        </div>
        <div class="head-actions">
          {/* Sul computer niente fotocamera: si carica un'immagine già salvata, letta come sul telefono. */}
          <input ref={file} type="file" accept="image/*" hidden onChange={picked} data-testid="upload-input" />
          <button type="button" class="btn-out" onClick={() => file.current?.click()}>Carica scontrino</button>
          <button type="button" class="btn-fill" onClick={props.onManual}>Nuova spesa</button>
        </div>
      </div>
      <hr class="hair" />

      <div class="cards">
        <div><div class="lbl">Totale</div><div class="v num">{formatEuro(t?.totalCents ?? 0)}</div></div>
        <div><div class="lbl">Carta aziendale</div><div class="v num">{formatEuro(t?.paidByCompanyCents ?? 0)}</div></div>
        <div><div class="lbl">Carta personale</div><div class="v num">{formatEuro(t?.advancedPersonallyCents ?? 0)}</div></div>
        <div><div class="lbl">{group ? reimburseLabel(group.r) : 'Da rimborsare'}</div><div class="v accent num">{formatEuro(t?.toReimburseCents ?? 0)}</div></div>
      </div>

      {t && t.rows.length > 0 ? (
        <table class="expenses">
          <thead>
            <tr>
              <th class="c-date">Data</th>
              <th>Fornitore</th>
              <th class="c-place">Località</th>
              <th class="c-cat">Tipologia</th>
              <th class="r c-km">Km</th>
              <th class="r c-amt">Importo</th>
              <th class="c-inv">Fattura</th>
              <th class="c-pay">Pagato con</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((e) => (
              <tr
                key={e.id}
                class={props.selectedId === e.id ? 'sel' : ''}
                tabIndex={0}
                aria-label={`Modifica ${e.supplier || categoryText(e)}`}
                onClick={() => props.onEdit(e)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') props.onEdit(e); }}
              >
                <td class="num">{shortDate(e.date)}</td>
                <td>{e.supplier || categoryText(e)}</td>
                <td>{placeText(e, data)}</td>
                <td>{categoryText(e)}</td>
                <td class="r num">{e.km != null ? e.km : '—'}</td>
                <td class="r imp num">{formatEuro(e.amountCents)}</td>
                <td class={e.invoice ? 'si' : 'no'}>{e.invoice ? 'Sì' : 'No'}</td>
                <td>{PAYER_SHORT[e.payer]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="empty">Nessuna spesa in questo mese.</p>
      )}
    </main>
  );
}

// Pannello destro (sotto la tabella sotto i 1200 px): totali, PDF ed Excel, giustificativi.
export function NotePanel(props: { data: AppData; month: string; group: MonthGroup | null; onEdit: (e: Expense) => void }) {
  const { data, month, group } = props;
  const recipient: Recipient | null = group?.r ?? null;
  const { totals, busy, msg, run } = useNoteExport(data, recipient, month, true);
  const rows = totals?.rows ?? [];
  const required = rows.filter(needsReceipt);
  const have = required.filter((e) => e.photoId);
  const missing = required.filter((e) => !e.photoId);
  const hasAuto = rows.some((e) => !needsReceipt(e));

  return (
    <aside class="pc-panel" aria-label="Nota spese del mese">
      <div>
        <div class="lbl">Nota spese del mese</div>
        <div class="tot">
          <div><span>Totale complessivo</span><span class="num">{formatEuro(totals?.totalCents ?? 0)}</span></div>
          <div><span>Carta aziendale</span><span class="num">{formatEuro(totals?.paidByCompanyCents ?? 0)}</span></div>
          <div><span>Carta personale</span><span class="num">{formatEuro(totals?.advancedPersonallyCents ?? 0)}</span></div>
          <div class="big"><span>{recipient ? reimburseLabel(recipient) : 'Da rimborsare'}</span><span class="num">{formatEuro(totals?.toReimburseCents ?? 0)}</span></div>
        </div>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-fill" disabled={!!busy || !rows.length} onClick={() => void run('pdf')}>{busy === 'pdf' ? 'Preparo…' : 'Scarica il PDF'}</button>
        <button type="button" class="btn-out" disabled={!!busy || !rows.length} onClick={() => void run('xlsx')}>{busy === 'xlsx' ? 'Preparo…' : 'Scarica l’Excel'}</button>
        {msg ? <p class="status" role="status">{msg}</p> : null}
      </div>
      <div>
        <div class="lbl">Giustificativi · {have.length} di {required.length}</div>
        {rows.length ? (
          <div class="giust">
            {rows.filter((e) => e.photoId).map((e) => <Thumb key={e.id} expense={e} onClick={() => props.onEdit(e)} />)}
            {missing.map((e) => (
              <button type="button" class="thumb missing" key={e.id} onClick={() => props.onEdit(e)} title="Giustificativo mancante">
                <IconPhotos size={20} />
              </button>
            ))}
          </div>
        ) : null}
        {missing.length ? (
          <p class="giust-note warn-note">
            Mancano i giustificativi di: {missing.map((e) => `${e.supplier || categoryText(e)} (${shortDate(e.date)})`).join(', ')}.
          </p>
        ) : null}
        {hasAuto ? <p class="giust-note">Le spese in auto non lo richiedono: sono calcolate dai km.</p> : null}
      </div>
    </aside>
  );
}
