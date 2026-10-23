import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTheme, contrast, DEFAULT_THEME, isDefaultTheme, MAX_LOGO_BYTES, parseThemeText, themeVariables, validateTheme,
} from './theme';

const exampleText = readFileSync(join(process.cwd(), 'public', 'esempi', 'tema-esempio.json'), 'utf8');
const example = () => JSON.parse(exampleText);

describe('validazione del tema', () => {
  it('accetta il tema d’esempio', () => {
    const t = parseThemeText(exampleText);
    expect(t.companyName).toBe('Studio Aurora S.r.l.');
    expect(t.logo.startsWith('data:image/svg+xml')).toBe(true);
    expect(t.fonts).toEqual({ heading: 'serif', body: 'sans' });
    expect(t.colors.primary).toBe('#12474f');
  });

  it('normalizza i colori in minuscolo e accetta il logo mancante e i caratteri omessi', () => {
    const raw = example();
    delete raw.logo;
    delete raw.fonts;
    raw.colors.primary = '#12474F';
    const t = validateTheme(raw);
    expect(t.logo).toBe('');
    expect(t.colors.primary).toBe('#12474f');
    expect(t.fonts).toEqual({ heading: 'system', body: 'system' });
  });

  it('il tema predefinito è neutro: nessun nome né logo', () => {
    expect(DEFAULT_THEME.companyName).toBe('');
    expect(DEFAULT_THEME.logo).toBe('');
    expect(isDefaultTheme(DEFAULT_THEME)).toBe(true);
    expect(isDefaultTheme(parseThemeText(exampleText))).toBe(false);
  });

  const bad: [string, (r: Record<string, any>) => void, RegExp][] = [
    ['formato sbagliato', (r) => (r.format = 'altro'), /non è un tema di Note spese/],
    ['versione sconosciuta', (r) => (r.version = 2), /Versione del tema/],
    ['nome mancante', (r) => delete r.companyName, /nome dell’azienda/],
    ['nome vuoto', (r) => (r.companyName = '   '), /nome dell’azienda/],
    ['nome troppo lungo', (r) => (r.companyName = 'x'.repeat(121)), /120 caratteri/],
    ['nome breve troppo lungo', (r) => (r.shortName = 'x'.repeat(41)), /nome breve/],
    ['colore non esadecimale', (r) => (r.colors.accent = 'rame'), /«accent».*#RRGGBB/],
    ['colore corto', (r) => (r.colors.surface = '#fff'), /«surface»/],
    ['colore mancante', (r) => delete r.colors.textMuted, /«textMuted»/],
    ['colori assenti', (r) => delete r.colors, /colori/],
    ['logo non è un data URL', (r) => (r.logo = 'https://example.com/logo.png'), /data URL/],
    ['logo di tipo non ammesso', (r) => (r.logo = 'data:image/gif;base64,R0lGOD'), /PNG, JPEG o SVG/],
    ['logo troppo grande', (r) => (r.logo = 'data:image/png;base64,' + 'A'.repeat(MAX_LOGO_BYTES)), /500 KB/],
    ['carattere dei titoli sconosciuto', (r) => (r.fonts.heading = 'comic'), /fonts\.heading/],
    ['carattere del testo sconosciuto', (r) => (r.fonts.body = 'serif'), /fonts\.body/],
  ];
  it.each(bad)('rifiuta: %s', (_nome, mutate, re) => {
    const raw = example();
    mutate(raw);
    expect(() => validateTheme(raw)).toThrow(re);
  });

  it('rifiuta ciò che non è un oggetto o non è JSON', () => {
    expect(() => validateTheme(null)).toThrow();
    expect(() => validateTheme([1])).toThrow();
    expect(() => parseThemeText('{non json')).toThrow(/JSON/);
  });
});

describe('applicazione del tema', () => {
  it('nel tema scuro i contrasti restano leggibili', () => {
    const { dark, light } = themeVariables(parseThemeText(exampleText));
    expect(contrast(dark['--text'], dark['--bg'])).toBeGreaterThanOrEqual(7);
    expect(contrast(dark['--muted'], dark['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark['--accent'], dark['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark['--on-primary'], dark['--primary'])).toBeGreaterThanOrEqual(4.5);
    expect(light['--bg']).toBe('#f6f3ee');
    expect(contrast(light['--on-primary'], light['--primary'])).toBeGreaterThanOrEqual(4.5);
  });

  it('imposta variabili CSS e meta theme-color; col tema neutro toglie il foglio di stile', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#1f3a5f">';
    applyTheme(parseThemeText(exampleText));
    const css = document.getElementById('tema-runtime')!.textContent!;
    expect(css).toContain('--primary:#12474f');
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain('Bodoni Moda');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#12474f');
    applyTheme(DEFAULT_THEME);
    expect(document.getElementById('tema-runtime')).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#1f3a5f');
  });
});
