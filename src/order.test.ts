import { describe, expect, it } from 'vitest';
import { moveRow, orderRows, positionAfterEdit } from './order';
import { monthTotals } from './totals';
import type { Expense, Recipient } from './types';

function e(id: string, date: string, position?: number, recipientId = 'c'): Expense {
  const x: Expense = {
    id, date, recipientId, place: '', supplier: '', category: 'altro', amountCents: 100, invoice: false,
    payer: 'azienda', routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
  };
  if (position !== undefined) x.position = position;
  return x;
}
const ids = (rows: Expense[]) => rows.map((r) => r.id);

describe('orderRows', () => {
  it('senza position: per data, poi id', () => {
    expect(ids(orderRows([e('b', '2026-10-05'), e('c', '2026-10-01'), e('a', '2026-10-05')]))).toEqual(['c', 'a', 'b']);
  });
  it('rispetta le position', () => {
    const rows = [e('a', '2026-10-01', 2), e('b', '2026-10-02', 0), e('c', '2026-10-03', 1)];
    expect(ids(orderRows(rows))).toEqual(['b', 'c', 'a']);
  });
  it('una spesa nuova va dopo l’ultima con data <= alla sua', () => {
    const rows = [e('a', '2026-10-10', 0), e('b', '2026-10-01', 1), e('c', '2026-10-20', 2), e('n', '2026-10-05')];
    expect(ids(orderRows(rows))).toEqual(['a', 'b', 'n', 'c']);
  });
  it('una spesa nuova più vecchia di tutte va in testa', () => {
    const rows = [e('a', '2026-10-10', 0), e('b', '2026-10-12', 1), e('n', '2026-10-01')];
    expect(ids(orderRows(rows))).toEqual(['n', 'a', 'b']);
  });
});

describe('moveRow', () => {
  const rows = [e('a', '2026-10-01'), e('b', '2026-10-02'), e('c', '2026-10-03')];
  it('giù e su assegnano position 0..n-1', () => {
    const down = moveRow(rows, 'a', 1)!;
    expect(ids(down)).toEqual(['b', 'a', 'c']);
    expect(down.map((r) => r.position)).toEqual([0, 1, 2]);
    const up = moveRow(down, 'c', -1)!;
    expect(ids(up)).toEqual(['b', 'c', 'a']);
    expect(up.map((r) => r.position)).toEqual([0, 1, 2]);
  });
  it('ai bordi o con id sconosciuto: null', () => {
    expect(moveRow(rows, 'a', -1)).toBeNull();
    expect(moveRow(rows, 'c', 1)).toBeNull();
    expect(moveRow(rows, 'x', 1)).toBeNull();
  });
});

describe('monthTotals con ordine scelto', () => {
  const r: Recipient = { id: 'c', name: 'C', kind: 'cliente', defaultPlace: '', active: true };
  it('segue le position', () => {
    const rows = [e('a', '2026-10-01', 1), e('b', '2026-10-02', 0), e('z', '2026-11-01', 0)];
    expect(ids(monthTotals(rows, r, '2026-10').rows)).toEqual(['b', 'a']);
  });
});

describe('positionAfterEdit', () => {
  const old = e('a', '2026-10-01', 3);
  it('invariata se data e destinatario non cambiano', () => {
    expect(positionAfterEdit(old, '2026-10-01', 'c')).toBe(3);
  });
  it('persa se cambia la data', () => {
    expect(positionAfterEdit(old, '2026-10-02', 'c')).toBeUndefined();
  });
  it('persa se cambia il destinatario', () => {
    expect(positionAfterEdit(old, '2026-10-01', 'd')).toBeUndefined();
  });
  it('spesa nuova: nessuna position', () => {
    expect(positionAfterEdit(undefined, '2026-10-01', 'c')).toBeUndefined();
  });
});
