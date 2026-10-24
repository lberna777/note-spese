import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTheme, COLOR_KEYS, contrast, convertV1, DEFAULT_THEME, flatten, fontStack, isDefaultTheme, MAX_LOGO_BYTES, parseThemeText,
  resolveScheme, themeCss, validateTheme, type Theme,
} from './theme';

const exampleText = readFileSync(join(process.cwd(), 'public', 'esempi', 'tema-esempio.json'), 'utf8');
const example = () => JSON.parse(exampleText);

// Tema della versione 1, quello storico del file d'esempio.
const v1 = () => ({
  format: 'note-spese-tema', version: 1, companyName: 'Studio Aurora S.r.l.', shortName: 'Studio Aurora', logo: '',
  colors: { primary: '#12474f', accent: '#b86b3c', accentText: '#8a4a22', surface: '#f6f3ee', text: '#1d2a2c', textMuted: '#55666a' },
  fonts: { heading: 'serif', body: 'sans' },
});

describe('validazione del tema v2', () => {
  it('accetta il tema d’esempio', () => {
    const t = parseThemeText(exampleText);
    expect(t.version).toBe(2);
    expect(t.companyName).toBe('Studio Aurora S.r.l.');
    expect(t.logo.startsWith('data:image/svg+xml')).toBe(true);
    expect(t.font).toBe('avenir');
    expect(t.light.bg).toBe('#f6f3ee');
    expect(t.dark.accent).toBe('#d88a4f');
    expect(Object.keys(t.dark)).toEqual([...COLOR_KEYS]);
  });

  it('normalizza i colori in minuscolo, accetta #RRGGBBAA, il logo mancante e il carattere omesso', () => {
    const raw = example();
    delete raw.logo;
    delete raw.font;
    raw.light.accent = '#A85A2C';
    raw.light.line = '#17353A1F';
    const t = validateTheme(raw);
    expect(t.logo).toBe('');
    expect(t.light.accent).toBe('#a85a2c');
    expect(t.light.line).toBe('#17353a1f');
    expect(t.font).toBe('system');
  });

  it('il tema predefinito è neutro: nessun nome né logo, e supera la convalida', () => {
    expect(DEFAULT_THEME.companyName).toBe('');
    expect(DEFAULT_THEME.logo).toBe('');
    expect(isDefaultTheme(DEFAULT_THEME)).toBe(true);
    expect(isDefaultTheme(parseThemeText(exampleText))).toBe(false);
    expect(validateTheme({ ...DEFAULT_THEME, companyName: 'x' }).light).toEqual(DEFAULT_THEME.light);
  });

  const bad: [string, (r: Record<string, any>) => void, RegExp][] = [
    ['formato sbagliato', (r) => (r.format = 'altro'), /non è un tema di Note spese/],
    ['versione sconosciuta', (r) => (r.version = 3), /Versione del tema/],
    ['nome mancante', (r) => delete r.companyName, /nome dell’azienda/],
    ['nome vuoto', (r) => (r.companyName = '   '), /nome dell’azienda/],
    ['nome troppo lungo', (r) => (r.companyName = 'x'.repeat(121)), /120 caratteri/],
    ['nome breve troppo lungo', (r) => (r.shortName = 'x'.repeat(41)), /nome breve/],
    ['colore non esadecimale', (r) => (r.light.accent = 'rame'), /«light\.accent».*#RRGGBB/],
    ['colore corto', (r) => (r.dark.bg = '#fff'), /«dark\.bg»/],
    ['colore con nove cifre', (r) => (r.dark.bg = '#0c151700f'), /«dark\.bg»/],
    ['colore mancante', (r) => delete r.dark.onAccent, /«dark\.onAccent»/],
    ['variante assente', (r) => delete r.dark, /variante «dark»/],
    ['logo non è un data URL', (r) => (r.logo = 'https://example.com/logo.png'), /data URL/],
    ['logo di tipo non ammesso', (r) => (r.logo = 'data:image/gif;base64,R0lGOD'), /PNG, JPEG o SVG/],
    ['logo troppo grande', (r) => (r.logo = 'data:image/png;base64,' + 'A'.repeat(MAX_LOGO_BYTES)), /500 KB/],
    ['carattere sconosciuto', (r) => (r.font = 'comic'), /«font»/],
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

describe('importazione di un tema v1', () => {
  it('si converte in v2: chiaro dai colori vecchi, scuro derivato', () => {
    const t = validateTheme(v1());
    expect(t.version).toBe(2);
    expect(t.font).toBe('avenir');
    expect(t.light.bg).toBe('#f6f3ee');
    expect(t.light.surface).toBe('#ffffff');
    expect(t.light.text).toBe('#1d2a2c');
    expect(t.light.accent).toBe('#b86b3c');
    expect(t.dark.bg).toBe('#0b0b0b');
    expect(t.dark.text).toBe('#f2f0ec');
    expect(t.dark.accent).toBe('#b86b3c');
    // il carattere di sistema resta tale
    expect(validateTheme({ ...v1(), fonts: {} }).font).toBe('system');
  });

  it('la conversione rispetta i contrasti minimi', () => {
    const t = validateTheme(v1());
    for (const v of [t.light, t.dark]) {
      expect(contrast(v.text, v.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.textMuted, v.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.accentText, v.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.onAccent, v.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('continua a rifiutare i colori v1 malformati', () => {
    const raw = v1();
    raw.colors.accent = 'rame';
    expect(() => validateTheme(raw)).toThrow(/«accent»/);
    expect(() => convertV1({ ...v1(), colors: undefined })).toThrow(/colori/);
  });
});

describe('contrasti WCAG', () => {
  const themes: [string, Theme][] = [
    ['neutro', DEFAULT_THEME],
    ['d’esempio', parseThemeText(exampleText)],
    ['convertito da v1', validateTheme(v1())],
  ];
  for (const [nome, t] of themes) {
    for (const scheme of ['light', 'dark'] as const) {
      it(`tema ${nome}, variante ${scheme}: testo, testo smorzato, accento come testo e testo sull’accento ≥ 4,5:1`, () => {
        const v = t[scheme];
        const bg = flatten(v.bg, '#ffffff');
        expect(contrast(flatten(v.text, bg), bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(flatten(v.textMuted, bg), bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(flatten(v.accentText, bg), bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(flatten(v.onAccent, v.accent), flatten(v.accent, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('il rapporto è quello di WCAG (nero su bianco = 21)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('applicazione del tema', () => {
  it('con «Automatico» il foglio ha le due varianti; con Chiaro o Scuro una sola', () => {
    const t = parseThemeText(exampleText);
    const auto = themeCss(t, 'auto');
    expect(auto).toContain('--bg:#f6f3ee');
    expect(auto).toContain('prefers-color-scheme: dark');
    expect(auto).toContain('--bg:#0c1517');
    const light = themeCss(t, 'light');
    expect(light).toContain('--bg:#f6f3ee');
    expect(light).not.toContain('#0c1517');
    expect(light).not.toContain('prefers-color-scheme');
    const dark = themeCss(t, 'dark');
    expect(dark).toContain('--bg:#0c1517');
    expect(dark).not.toContain('--bg:#f6f3ee');
    expect(dark).toContain('color-scheme:dark');
  });

  it('i caratteri: «avenir» ha la pila con Nunito Sans, «system» il carattere di sistema', () => {
    expect(fontStack('avenir')).toBe('"Avenir Next", Avenir, "Nunito Sans", system-ui, sans-serif');
    expect(fontStack('system')).toMatch(/^system-ui/);
    expect(themeCss(parseThemeText(exampleText))).toContain('--font:"Avenir Next", Avenir, "Nunito Sans"');
    expect(themeCss({ ...DEFAULT_THEME, font: 'system' })).not.toContain('Nunito');
  });

  it('Automatico segue il sistema, la scelta esplicita no', () => {
    expect(resolveScheme('auto', true)).toBe('dark');
    expect(resolveScheme('auto', false)).toBe('light');
    expect(resolveScheme('light', true)).toBe('light');
    expect(resolveScheme('dark', false)).toBe('dark');
  });

  it('imposta variabili CSS e meta theme-color della variante attiva', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    const t = parseThemeText(exampleText);
    applyTheme(t, 'dark');
    expect(document.getElementById('tema-runtime')!.textContent).toContain('--accent:#d88a4f');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#0c1517');
    applyTheme(t, 'light');
    expect(document.getElementById('tema-runtime')!.textContent).toContain('--accent:#a85a2c');
    expect(document.querySelectorAll('#tema-runtime')).toHaveLength(1);
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#f6f3ee');
  });
});
