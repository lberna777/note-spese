// Tema grafico importabile (versione 2): marchio dell'azienda dell'utente, caricato a runtime da un file
// .json e conservato solo nel dispositivo (IndexedDB). Nel codice pubblico c'è soltanto il tema neutro.
// Formato e significato dei colori: docs/design.md, «Tema, versione 2».

export const THEME_FORMAT = 'note-spese-tema';
export const THEME_VERSION = 2;
export const MAX_LOGO_BYTES = 500 * 1024;
export const MAX_TEXT_LENGTH = 120;

export type ThemeFont = 'avenir' | 'system';
export type Scheme = 'light' | 'dark';
export type Appearance = 'auto' | Scheme;

// Chiavi dei colori di una variante: `bg` fondo pagina, `surface` superfici sollevate, `line` filetti neutri,
// `lineAccent` filetti d'accento, `accent` riempimenti, `accentText` accento usato come testo su `bg`,
// `onAccent` testo sopra `accent`.
export const COLOR_KEYS = ['bg', 'surface', 'text', 'textMuted', 'line', 'lineAccent', 'accent', 'accentText', 'onAccent'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeVariant = Record<ColorKey, string>;

export interface Theme {
  format: typeof THEME_FORMAT;
  version: typeof THEME_VERSION;
  companyName: string;
  shortName: string; // nome breve per le etichette («Cliente / <nome breve>»), facoltativo
  logo: string; // data URL PNG/JPEG/SVG, stringa vuota = nessun logo
  font: ThemeFont;
  light: ThemeVariant;
  dark: ThemeVariant;
}

// Tema neutro (grafite e blu): nessun logo né nome.
export const DEFAULT_THEME: Theme = {
  format: THEME_FORMAT,
  version: THEME_VERSION,
  companyName: '',
  shortName: '',
  logo: '',
  font: 'avenir',
  light: {
    bg: '#f6f7f9',
    surface: '#ffffff',
    text: '#1c2026',
    textMuted: '#5a6370',
    line: '#1c202620',
    lineAccent: '#2b5aa070',
    accent: '#2b5aa0',
    accentText: '#2b5aa0',
    onAccent: '#ffffff',
  },
  dark: {
    bg: '#101317',
    surface: '#181c21',
    text: '#eceef1',
    textMuted: '#9ba4b0',
    line: '#eceef122',
    lineAccent: '#8ab4f058',
    accent: '#7aa7e8',
    accentText: '#8ab4f0',
    onAccent: '#0b1220',
  },
};

export function isDefaultTheme(t: Theme): boolean {
  return JSON.stringify(t) === JSON.stringify(DEFAULT_THEME);
}

const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_RE = /^data:image\/(png|jpeg|svg\+xml)(;[a-zA-Z0-9=\-]+)*,/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------- Colori ----------

export type Rgb = [number, number, number];

// Legge #RRGGBB o #RRGGBBAA (l'opacità si ignora: vedi `flatten`).
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexAlpha(hex: string): number {
  return hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// Miscela: t = 0 → a, t = 1 → b.
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

// Colore con opacità appoggiato su un fondo opaco: serve a PDF ed Excel, che non hanno le trasparenze.
export function flatten(hex: string, over: string): string {
  const a = hexAlpha(hex);
  return a >= 1 ? hex.slice(0, 7).toLowerCase() : mix(over, hex.slice(0, 7), a);
}

// Aggiunge o sostituisce l'opacità (0–1) a un colore.
export function withAlpha(hex: string, alpha: number): string {
  return hex.slice(0, 7) + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Rapporto di contrasto WCAG tra due colori opachi.
export function contrast(a: string, b: string): number {
  const lumA = luminance(a);
  const lumB = luminance(b);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

// Bianco o nero, il più leggibile sopra `bg`.
export function onColor(bg: string): string {
  return contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000';
}

// Avvicina `fg` al bianco o al nero (secondo lo sfondo) finché il contrasto con `bg` raggiunge `min`.
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = onColor(bg);
  for (let i = 1; i <= 20; i++) {
    const c = mix(fg, target, i / 20);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

// ---------- Convalida e conversione ----------

const V1_KEYS = ['primary', 'accent', 'accentText', 'surface', 'text', 'textMuted'] as const;

// Un tema della versione 1 (primary, accent, accentText, surface, text, textMuted; caratteri serif/sans)
// diventa un tema v2: la variante chiara viene dai colori vecchi, quella scura è derivata.
export function convertV1(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isObject(raw.colors)) throw new Error('Tema non valido: mancano i colori («colors»).');
  const c: Record<string, string> = {};
  for (const k of V1_KEYS) {
    const v = raw.colors[k];
    if (typeof v !== 'string' || !HEX6_RE.test(v)) throw new Error(`Tema non valido: il colore «${k}» deve essere nel formato #RRGGBB.`);
    c[k] = v.toLowerCase();
  }
  const light: ThemeVariant = {
    bg: c.surface,
    surface: '#ffffff',
    text: c.text,
    textMuted: c.textMuted,
    line: withAlpha(c.text, 0.13),
    lineAccent: withAlpha(c.accent, 0.4),
    accent: c.accent,
    accentText: ensureContrast(c.accentText, c.surface, 4.5),
    onAccent: ensureContrast(onColor(c.accent) === '#ffffff' ? '#ffffff' : '#16120a', c.accent, 4.5),
  };
  const bg = '#0b0b0b';
  const text = '#f2f0ec';
  const accentDark = c.accent;
  const dark: ThemeVariant = {
    bg,
    surface: '#141414',
    text,
    textMuted: ensureContrast(mix(text, bg, 0.5), bg, 4.5),
    line: withAlpha(text, 0.12),
    lineAccent: withAlpha(accentDark, 0.4),
    accent: accentDark,
    accentText: ensureContrast(mix(c.accentText, '#ffffff', 0.35), bg, 4.5),
    onAccent: ensureContrast(onColor(accentDark) === '#ffffff' ? '#ffffff' : '#16120a', accentDark, 4.5),
  };
  const fonts = isObject(raw.fonts) ? raw.fonts : {};
  const font: ThemeFont = fonts.body === 'sans' || fonts.heading === 'serif' ? 'avenir' : 'system';
  return { ...raw, version: THEME_VERSION, font, light, dark, colors: undefined, fonts: undefined };
}

function readVariant(raw: unknown, name: Scheme): ThemeVariant {
  if (!isObject(raw)) throw new Error(`Tema non valido: manca la variante «${name}».`);
  const out = {} as ThemeVariant;
  for (const k of COLOR_KEYS) {
    const c = raw[k];
    if (typeof c !== 'string' || !HEX_RE.test(c)) {
      throw new Error(`Tema non valido: il colore «${name}.${k}» deve essere nel formato #RRGGBB o #RRGGBBAA.`);
    }
    out[k] = c.toLowerCase();
  }
  return out;
}

// Convalida un oggetto letto da un file (versione 2, oppure 1 che viene convertita);
// lancia un errore in italiano alla prima irregolarità.
export function validateTheme(input: unknown): Theme {
  if (!isObject(input)) throw new Error('Il file non è un tema valido.');
  if (input.format !== THEME_FORMAT) throw new Error('Il file non è un tema di Note spese.');
  const raw = input.version === 1 ? convertV1(input) : input;
  if (raw.version !== THEME_VERSION) throw new Error('Versione del tema non supportata.');

  const name = raw.companyName;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Tema non valido: manca il nome dell’azienda («companyName»).');
  if (name.length > MAX_TEXT_LENGTH) throw new Error(`Tema non valido: il nome dell’azienda supera ${MAX_TEXT_LENGTH} caratteri.`);

  const short = raw.shortName ?? '';
  if (typeof short !== 'string') throw new Error('Tema non valido: «shortName» deve essere un testo.');
  if (short.length > 40) throw new Error('Tema non valido: il nome breve supera 40 caratteri.');

  let logo = '';
  if (raw.logo !== undefined && raw.logo !== '') {
    if (typeof raw.logo !== 'string' || !LOGO_RE.test(raw.logo)) {
      throw new Error('Tema non valido: il logo deve essere un data URL PNG, JPEG o SVG.');
    }
    if (raw.logo.length > MAX_LOGO_BYTES) throw new Error('Tema non valido: il logo supera i 500 KB.');
    logo = raw.logo;
  }

  const font = raw.font ?? 'system';
  if (font !== 'avenir' && font !== 'system') throw new Error('Tema non valido: «font» deve essere «avenir» o «system».');

  return {
    format: THEME_FORMAT,
    version: THEME_VERSION,
    companyName: name.trim(),
    shortName: short.trim(),
    logo,
    font,
    light: readVariant(raw.light, 'light'),
    dark: readVariant(raw.dark, 'dark'),
  };
}

export function parseThemeText(text: string): Theme {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un tema valido (JSON non leggibile).');
  }
  return validateTheme(raw);
}

// ---------- Applicazione all'interfaccia ----------

export const AVENIR_STACK = '"Avenir Next", Avenir, "Nunito Sans", system-ui, sans-serif';
export const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function fontStack(font: ThemeFont): string {
  return font === 'avenir' ? AVENIR_STACK : SYSTEM_STACK;
}

// Variante effettiva: la scelta dell'utente, oppure (Automatico) quella del sistema.
export function resolveScheme(appearance: Appearance, systemDark: boolean): Scheme {
  return appearance === 'auto' ? (systemDark ? 'dark' : 'light') : appearance;
}

// Variabili CSS di una variante.
export function variantVariables(v: ThemeVariant, scheme: Scheme = 'light'): Record<string, string> {
  return {
    // Rosso per errori e azioni distruttive: il tema non lo prevede, ma deve restare leggibile su `bg`.
    '--danger': scheme === 'dark' ? '#ff8f87' : '#b3261e',
    '--bg': v.bg,
    '--surface': v.surface,
    '--text': v.text,
    '--muted': v.textMuted,
    '--line': v.line,
    '--line-accent': v.lineAccent,
    '--accent': v.accent,
    '--accent-text': v.accentText,
    '--on-accent': v.onAccent,
    '--sel': withAlpha(v.accent, 0.09), // riga selezionata o da controllare
  };
}

const decl = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');

// Con «Automatico» il foglio ha entrambe le varianti e sceglie il sistema (prefers-color-scheme).
// Con «più contrasto» (prefers-contrast: more) i filetti diventano più marcati.
export function themeCss(t: Theme, appearance: Appearance = 'auto'): string {
  const font = `--font:${fontStack(t.font)}`;
  const strong = (v: ThemeVariant) => `--line:${v.textMuted};--line-accent:${v.accentText}`;
  const light = `${decl(variantVariables(t.light, 'light'))};${font};color-scheme:light`;
  const dark = `${decl(variantVariables(t.dark, 'dark'))};${font};color-scheme:dark`;
  if (appearance === 'light') return `:root{${light}}@media (prefers-contrast: more){:root{${strong(t.light)}}}`;
  if (appearance === 'dark') return `:root{${dark}}@media (prefers-contrast: more){:root{${strong(t.dark)}}}`;
  return (
    `:root{${light}}@media (prefers-color-scheme: dark){:root{${dark}}}` +
    `@media (prefers-contrast: more){:root{${strong(t.light)}}}` +
    `@media (prefers-contrast: more) and (prefers-color-scheme: dark){:root{${strong(t.dark)}}}`
  );
}

const STYLE_ID = 'tema-runtime';

function systemPrefersDark(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

// Imposta le variabili CSS e il colore della barra del browser (`theme-color` = fondo della variante attiva).
export function applyTheme(t: Theme, appearance: Appearance = 'auto', doc: Document = document): void {
  let el = doc.getElementById(STYLE_ID);
  if (!el) {
    el = doc.createElement('style');
    el.id = STYLE_ID;
    doc.head.appendChild(el);
  }
  el.textContent = themeCss(t, appearance);
  const scheme = resolveScheme(appearance, systemPrefersDark());
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t[scheme].bg.slice(0, 7));
}
