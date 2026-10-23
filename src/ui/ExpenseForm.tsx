import { useMemo, useState } from 'preact/hooks';
import { deleteExpense, deletePhoto, newId, putExpense, putKnownSupplier } from '../db';
import { CATEGORIES, CATEGORY_LABELS, PAYER_LABELS } from '../labels';
import { suggestPayer } from '../payer';
import { autoAmountCents, autoKm, formatDecimal, formatEuro, parseAmount } from '../money';
import type { Category, Expense, Payer, ReadState, ReceiptDraft } from '../types';
import { Field, Group, Segmented, Sheet, Switch, usePhotoUrl, val } from './common';
import { IconChevronRight } from './icons';
import type { AppData } from './useData';

type ReadField = 'date' | 'amountCents' | 'supplier' | 'place' | 'category' | 'invoice';
const READ_FIELDS: ReadField[] = ['date', 'amountCents', 'supplier', 'place', 'category', 'invoice'];

export interface FormProps {
  data: AppData;
  existing?: Expense;
  photoId?: string | null;
  draft?: ReceiptDraft;
  warning?: string | null;
  defaultDate: string;
  onSaved: () => void;
  onCancel: () => void;
}

// Destinatario proposto: l'ultimo usato nello stesso giorno, altrimenti l'ultimo in assoluto
// (il modello non ha un istante di creazione: «ultimo» = data più recente).
export function suggestRecipient(expenses: Expense[], date: string, fallback: string): string {
  const sameDay = expenses.filter((e) => e.date === date);
  if (sameDay.length) return sameDay[sameDay.length - 1].recipientId;
  if (expenses.length) {
    const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1].recipientId;
  }
  return fallback;
}

export function ExpenseForm(props: FormProps) {
  const { data, existing, draft } = props;
  const photoId = existing ? existing.photoId : props.photoId ?? null;

  // Valori iniziali e insieme dei campi letti dalla foto (la base per «letta»/«corretta»)
  const init = useMemo(() => {
    const read: Partial<Record<ReadField, unknown>> = {};
    const low = new Set<ReadField>();
    let e: Expense;
    if (existing) {
      e = existing;
      if (existing.readState === 'letta') {
        for (const k of READ_FIELDS) read[k] = existing[k];
      }
    } else {
      const date = draft?.date?.value ?? props.defaultDate;
      const recipientId = suggestRecipient(data.expenses, date, data.recipients.find((r) => r.active)?.id ?? '');
      e = {
        id: newId(), date, recipientId, place: draft?.place?.value ?? '', supplier: draft?.supplier?.value ?? '',
        category: draft?.category?.value ?? (photoId ? 'pasto' : 'altro'), amountCents: draft?.amountCents?.value ?? 0,
        invoice: draft?.invoice?.value ?? false, payer: suggestPayer(data.expenses, recipientId),
        routeId: null, roundTrip: false, km: null, photoId, notes: '', readState: photoId ? 'letta' : 'manuale',
      };
      if (draft && photoId) {
        for (const k of READ_FIELDS) if (draft[k]) read[k] = e[k];
        for (const k of READ_FIELDS) {
          if (!draft[k] || draft[k]!.confidence === 'bassa') low.add(k);
        }
      } else if (photoId) {
        for (const k of READ_FIELDS) low.add(k);
      }
    }
    return { e, read, low };
  }, []);

  const [date, setDate] = useState(init.e.date);
  const [recipientId, setRecipientId] = useState(init.e.recipientId);
  const [place, setPlace] = useState(init.e.place);
  const [supplier, setSupplier] = useState(init.e.supplier);
  const [category, setCategory] = useState<Category>(init.e.category);
  const [amountText, setAmountText] = useState(init.e.amountCents ? formatDecimal(init.e.amountCents) : '');
  const [invoice, setInvoice] = useState(init.e.invoice);
  const [payer, setPayer] = useState<Payer>(init.e.payer);
  const [payerTouched, setPayerTouched] = useState(false);
  const [routeId, setRouteId] = useState<string>(init.e.routeId ?? data.routes[0]?.id ?? '');
  const [roundTrip, setRoundTrip] = useState(existing ? init.e.roundTrip : true);
  const [notes, setNotes] = useState(init.e.notes);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  const photoUrl = usePhotoUrl(photoId);
  const isAuto = category === 'auto';
  const route = data.routes.find((r) => r.id === routeId);
  const km = isAuto && route ? autoKm(route, roundTrip) : null;
  const autoCents = km != null ? autoAmountCents(km, data.settings.centsPerKm) : null;
  const warn = (k: ReadField) => init.low.has(k);
  // La foto non dice con quale carta si è pagato: per le spese da foto il campo resta da controllare.
  const payerWarn = !existing && !!photoId;
  const recipient = data.recipients.find((r) => r.id === recipientId);

  function choosePayer(p: Payer) {
    setPayer(p);
    setPayerTouched(true);
  }
  // Cambiando destinatario si ripropone il suo ultimo pagamento, se non è già stato scelto a mano.
  function chooseRecipient(id: string) {
    setRecipientId(id);
    if (!existing && !payerTouched) setPayer(suggestPayer(data.expenses, id));
  }

  async function save(ev: Event) {
    ev.preventDefault();
    const amountCents = isAuto ? autoCents : parseAmount(amountText);
    if (!date) return setError('Indica la data.');
    if (!recipientId) return setError('Scegli il destinatario.');
    if (isAuto && !route) return setError('Scegli la tratta (si aggiungono in Impostazioni).');
    if (amountCents == null || amountCents <= 0) return setError('Indica un importo valido, per esempio 12,50.');
    const finalPlace = place.trim() || recipient?.defaultPlace || '';
    const finalSupplier = supplier.trim() || (isAuto ? 'Viaggio in auto' : '');
    const current: Record<ReadField, unknown> = {
      date, amountCents, supplier: finalSupplier, place: finalPlace, category, invoice,
    };
    let readState: ReadState;
    if (!photoId) readState = 'manuale';
    else if (existing && existing.readState !== 'letta') readState = existing.readState;
    else {
      const changed = (Object.keys(init.read) as ReadField[]).some((k) => init.read[k] !== current[k]);
      readState = changed ? 'corretta' : 'letta';
    }
    const exp: Expense = {
      id: init.e.id, date, recipientId, place: finalPlace, supplier: finalSupplier, category, amountCents, invoice,
      payer, routeId: isAuto ? routeId : null, roundTrip: isAuto ? roundTrip : false,
      km: isAuto ? km : null, photoId, notes: notes.trim(), readState,
    };
    await putExpense(exp);
    if (finalSupplier && !isAuto) {
      await putKnownSupplier({ name: finalSupplier, category, place: finalPlace });
    }
    props.onSaved();
  }

  async function remove() {
    if (!existing || !window.confirm('Eliminare questa spesa (e la sua foto)?')) return;
    await deleteExpense(existing.id);
    props.onSaved();
  }

  async function cancel() {
    // una foto appena scattata e non salvata non deve restare in archivio
    if (!existing && photoId) await deletePhoto(photoId);
    props.onCancel();
  }

  const title = existing ? 'Modifica spesa' : photoId ? 'Conferma spesa' : 'Spesa senza scontrino';

  const payerOptions = (Object.keys(PAYER_LABELS) as Payer[]).map((p) => ({ value: p, label: PAYER_LABELS[p] }));

  return (
    <Sheet title={title} onClose={() => void cancel()} onSubmit={(e) => void save(e)}>
      {props.warning ? <Group><div class="row two-line warn" role="alert">{props.warning}</div></Group> : null}
      {error ? <Group><div class="row two-line error-text" role="alert">{error}</div></Group> : null}
      {photoUrl ? (
        <>
          <Group>
            <button type="button" class="row two-line tap" onClick={() => setZoom(true)} aria-label="Ingrandisci la foto">
              <img class="photo-thumb" src={photoUrl} alt="Foto dello scontrino" />
              <span class="grow secondary-text">Tocca per ingrandire</span>
              <IconChevronRight class="chev" />
            </button>
          </Group>
          {zoom ? (
            <div class="zoom" onClick={() => setZoom(false)} role="dialog" aria-label="Foto ingrandita">
              <img src={photoUrl} alt="Foto dello scontrino ingrandita" />
            </div>
          ) : null}
        </>
      ) : null}

      <Group>
        <Field label="Data" warn={warn('date')}>
          <input type="date" required value={date} onInput={(e) => setDate(val(e))} />
        </Field>
        <Field label="Destinatario" select>
          <select value={recipientId} onChange={(e) => chooseRecipient(val(e))}>
            {data.recipients.filter((r) => r.active || r.id === recipientId).map((r) => (
              <option value={r.id} key={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipologia" warn={warn('category')} select>
          <select value={category} onChange={(e) => setCategory(val(e) as Category)}>
            {CATEGORIES.map((c) => <option value={c} key={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
      </Group>

      {isAuto ? (
        <Group footer={data.routes.length ? undefined : 'Nessuna tratta: aggiungila in Impostazioni.'}>
          <Field label="Tratta" select>
            <select value={routeId} onChange={(e) => setRouteId(val(e))}>
              {data.routes.map((r) => <option value={r.id} key={r.id}>{r.from} – {r.to} ({r.km} km)</option>)}
            </select>
          </Field>
          <Switch label="Andata e ritorno" checked={roundTrip} onChange={setRoundTrip} />
          <div class="row"><span class="grow">Km</span><span class="amount-plain">{km ?? '–'}</span></div>
          <div class="row"><span class="grow">Importo</span><span class="amount">{autoCents != null ? formatEuro(autoCents) : '–'}</span></div>
        </Group>
      ) : (
        <Group>
          <Field label="Importo (€)" warn={warn('amountCents')}>
            <input type="text" inputMode="decimal" placeholder="12,50" value={amountText} onInput={(e) => setAmountText(val(e))} />
          </Field>
        </Group>
      )}

      <Group footer={recipient ? `Località: se vuota, ${recipient.defaultPlace || '—'}.` : undefined}>
        <Field label="Fornitore" warn={warn('supplier')}>
          <input type="text" value={supplier} onInput={(e) => setSupplier(val(e))} placeholder={isAuto ? 'Viaggio in auto' : ''} />
        </Field>
        <Field label="Località" warn={warn('place')}>
          <input type="text" value={place} onInput={(e) => setPlace(val(e))} />
        </Field>
      </Group>

      <Group>
        <Switch label="C’è la fattura" checked={invoice} onChange={setInvoice} warn={warn('invoice')} />
        <div class={`row stack${payerWarn ? ' warn' : ''}`}>
          <span class="row-label">Pagato con{payerWarn ? <small class="warn-tag">da controllare</small> : null}</span>
          <Segmented options={payerOptions} value={payer} onChange={choosePayer} label="Pagato con" />
        </div>
      </Group>

      <Group title="Note">
        <label class="row stack">
          <textarea rows={2} aria-label="Note" value={notes} onInput={(e) => setNotes(val(e))} />
        </label>
      </Group>

      {existing ? (
        <Group><button type="button" class="row tap destructive center" onClick={() => void remove()}>Elimina spesa</button></Group>
      ) : null}
    </Sheet>
  );
}
