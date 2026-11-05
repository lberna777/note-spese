// @vitest-environment node
// Estratto per l'azienda delle spese di un cliente pagate con la carta personale: dati, nome dei file, PDF ed Excel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { currentMonth } from '../labels';
import { buildSeed } from '../seed';
import { DEFAULT_THEME } from '../theme';
import { companyNameOf, monthTotals, personalExtract } from '../totals';
import { buildPdf } from './pdf';
import { exportFilename, type ExportInput } from './rows';
import { buildXlsx, HEADER_ROW, PERSONAL_SHEET_NAME } from './xlsx';

const pub = (...p: string[]) => readFileSync(join(process.cwd(), 'public', ...p));
const SYSTEM = { ...DEFAULT_THEME, font: 'system' as const };

function setup(recipientId = 'r-lunari') {
  const s = buildSeed();
  const recipient = s.recipients.find((r) => r.id === recipientId)!;
  const month = currentMonth();
  const note = monthTotals(s.expenses, recipient, month);
  const extract = personalExtract(note);
  const input: ExportInput = {
    headerName: s.settings.headerName, recipient, month, totals: extract, photos: new Map(), theme: SYSTEM, logo: null,
    personal: { companyName: companyNameOf(s.recipients, ''), refs: extract.refs },
  };
  return { s, recipient, month, note, extract, input };
}

const text = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString('latin1');
const pageCount = (raw: string) => (raw.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

describe('estratto carta personale', () => {
  it('tiene solo le spese con carta personale, nell’ordine della nota, con il numero di riga della nota', () => {
    const { note, extract } = setup();
    expect(note.rows.map((e) => e.payer)).toEqual(['azienda', 'personale', 'personale', 'azienda', 'personale']);
    expect(extract.rows.every((e) => e.payer === 'personale')).toBe(true);
    expect(extract.refs).toEqual([2, 3, 5]);
    expect(extract.rows.map((e) => e.id)).toEqual([note.rows[1].id, note.rows[2].id, note.rows[4].id]);
    expect(extract.totalCents).toBe(note.advancedPersonallyCents);
    expect(extract.toReimburseCents).toBe(note.advancedPersonallyCents);
    expect(extract.paidByCompanyCents).toBe(0);
  });

  it('senza spese con carta personale l’estratto è vuoto', () => {
    const { note } = setup();
    const onlyCompany = { ...note, rows: note.rows.filter((e) => e.payer === 'azienda') };
    const x = personalExtract(onlyCompany);
    expect(x.rows).toHaveLength(0);
    expect(x.totalCents).toBe(0);
  });

  it('il destinatario è l’azienda: nome del destinatario «azienda», altrimenti quello del tema', () => {
    const { s } = setup();
    expect(companyNameOf(s.recipients, 'Tema')).toBe('Studio Aurora S.r.l.');
    expect(companyNameOf(s.recipients.filter((r) => r.kind !== 'azienda'), 'Tema')).toBe('Tema');
    expect(companyNameOf([], '')).toBe('Azienda');
  });

  it('i file hanno il nome della nota con «-carta-personale» in fondo', () => {
    const { recipient } = setup();
    expect(exportFilename(recipient, '2026-11', 'pdf')).toBe('nota-spese-officine-lunari-s-p-a-2026-11.pdf');
    expect(exportFilename(recipient, '2026-11', 'pdf', true)).toBe('nota-spese-officine-lunari-s-p-a-2026-11-carta-personale.pdf');
    expect(exportFilename(recipient, '2026-11', 'xlsx', true)).toBe('nota-spese-officine-lunari-s-p-a-2026-11-carta-personale.xlsx');
  });

  it('PDF: intestazione per l’azienda, cliente, «Rif.», un solo totale da rimborsare, niente «Pagato con»', async () => {
    const { input } = setup();
    const raw = await text(await buildPdf(input));
    expect(raw.slice(0, 5)).toBe('%PDF-');
    expect(raw).toContain('ESTRATTO PER L');
    expect(raw).toContain('Carta personale');
    expect(raw).toContain('Studio Aurora S.r.l.');
    expect(raw).toContain('Officine Lunari S.p.A.');
    expect(raw).toContain('RIF.');
    expect(raw).toContain('Totale con carta personale');
    expect(raw).toContain('Da rimborsare al consulente');
    expect(raw).not.toContain('PAGATO CON');
    expect(raw).not.toContain('Pagato con carta aziendale');
    expect(raw).not.toContain('Trenitalia'); // le spese con carta aziendale restano fuori
    expect(raw).toContain('Radiotaxi');
    expect(raw).toContain('pagina 1 di 1');
  });

  it('PDF: in coda solo gli scontrini delle spese con carta personale', async () => {
    const { input, note } = setup();
    const photo = new Blob([pub('esempi', 'scontrino-trattoria.png')], { type: 'image/png' });
    // foto su tutte le righe della nota: nell'estratto ne restano tre (due affiancate + una)
    const photos = new Map(note.rows.map((e) => [e.id, photo]));
    const raw = await text(await buildPdf({ ...input, photos }));
    expect(pageCount(raw)).toBe(3);
    expect(raw).toContain('GIUSTIFICATIVI');
    expect(raw).toContain('pagina 3 di 3');
  });

  it('Excel: foglio «Carta personale», colonna Rif., totale con formula vera', async () => {
    const { input, extract } = setup();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildXlsx(input)).arrayBuffer());
    const ws = wb.getWorksheet(PERSONAL_SHEET_NAME)!;
    expect(ws).toBeTruthy();
    expect(String(ws.getCell('A3').value)).toContain('Studio Aurora S.r.l.');
    expect(String(ws.getCell('A3').value)).toContain('Officine Lunari S.p.A.');
    expect(ws.getCell(`B${HEADER_ROW}`).value).toBe('RIF.');
    const first = HEADER_ROW + 1;
    const n = extract.rows.length;
    expect(n).toBe(3);
    expect([0, 1, 2].map((i) => ws.getCell(`B${first + i}`).value)).toEqual([2, 3, 5]);
    expect(ws.getCell(`E${first}`).value).toBe(extract.rows[0].supplier);
    expect(ws.getCell(`H${first}`).value).toBe(extract.rows[0].amountCents / 100);
    // nessuna colonna «Pagato con»
    const heads = Array.from({ length: 10 }, (_, i) => ws.getRow(HEADER_ROW).getCell(i + 1).value);
    expect(heads).not.toContain('PAGATO CON');
    const t = first + n + 1;
    const cell = (a: string) => ws.getCell(a).value as { formula: string; result: number };
    expect(cell(`H${t}`).formula).toBe(`SUM(H${first}:H${first + n - 1})`);
    expect(cell(`H${t}`).result).toBe(extract.totalCents / 100);
    expect(ws.getCell(`G${t + 1}`).value).toBe('Da rimborsare al consulente');
    expect(cell(`H${t + 1}`).formula).toBe(`H${t}`);
  });
});
