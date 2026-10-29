// Ordine delle spese di un destinatario nel mese: per data, salvo quello scelto a mano.
import type { Expense } from './types';

const byDate = (a: Expense, b: Expense) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

// Prima le spese con posizione scelta; ogni altra va dopo l'ultima già presente con data non successiva.
export function orderRows(rows: Expense[]): Expense[] {
  const placed = rows
    .filter((e) => e.position != null)
    .sort((a, b) => a.position! - b.position! || byDate(a, b));
  const free = rows.filter((e) => e.position == null).sort(byDate);
  const out = placed;
  for (const e of free) {
    let at = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].date <= e.date) { at = i + 1; break; }
    }
    out.splice(at, 0, e);
  }
  return out;
}

// Sposta una spesa di un posto (righe nell'ordine mostrato); null se non può muoversi.
export function moveRow(rows: Expense[], id: string, dir: -1 | 1): Expense[] | null {
  const i = rows.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return null;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((e, k) => ({ ...e, position: k }));
}

// La posizione scelta vale finché data e destinatario non cambiano; poi la spesa torna al suo posto per data.
export function positionAfterEdit(existing: Expense | undefined, date: string, recipientId: string): number | undefined {
  if (!existing || existing.date !== date || existing.recipientId !== recipientId) return undefined;
  return existing.position;
}
