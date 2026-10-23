// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../seed';
import { monthTotals } from '../totals';
import { currentMonth } from '../labels';
import { buildPdf } from './pdf';

describe('pdf', () => {
  it('genera un PDF non vuoto', async () => {
    const s = buildSeed();
    const recipient = s.recipients[0];
    const month = currentMonth();
    const blob = await buildPdf({ headerName: s.settings.headerName, recipient, month, totals: monthTotals(s.expenses, recipient, month), cards: s.cards, photos: new Map() });
    expect(blob.size).toBeGreaterThan(1000);
    const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
  });
});
