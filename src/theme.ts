// Tema grafico importabile: marchio dell'azienda dell'utente, caricato a runtime da un file .json
// e conservato solo nel telefono (IndexedDB). Nel codice pubblico c'è soltanto il tema neutro.

export const THEME_FORMAT = 'note-spese-tema';
export const THEME_VERSION = 1;
export const MAX_LOGO_BYTES = 500 * 1024;
export const MAX_TEXT_LENGTH = 120;

export type HeadingFont = 'serif' | 'system';
export type BodyFont = 'sans' | 'system';

export interface ThemeColors {
  primary: string; // colore scuro delle fasce (intestazioni, barra)
  accent: string; // colore del marchio: filetti e dettagli
  accentText: string; // variante dell'accento leggibile come testo su `surface`
  surface: string; // fondo chiaro
  text: string;
  textMuted: string;
}

export interface Theme {
  format: typeof THEME_FORMAT;
  version: typeof THEME_VERSION;
  companyName: string;
  shortName: string; // nome breve per le etichette («Cliente / <nome breve>»), facoltativo
  logo: string; // data URL PNG/JPEG/SVG, stringa vuota = nessun logo
  colors: ThemeColors;
  fonts: { heading: HeadingFont; body: BodyFont };
}

// Tema neutro: i colori storici dell'app, nessun logo né nome.
export const DEFAULT_THEME: Theme = {
  format: THEME_FORMAT,
  version: THEME_VERSION,
  companyName: '',
  shortName: '',
  logo: '',
  colors: {
    primary: '#1f3a5f',
    accent: '#1f3a5f',
    accentText: '#1f3a5f',
    surface: '#f4f5f7',
    text: '#1c2430',
    textMuted: '#5d6877',
  },
  fonts: { heading: 'system', body: 'system' },
};

export function isDefaultTheme(t: Theme): boolean {
  return JSON.stringify(t) === JSON.stringify(DEFAULT_THEME);
}

const COLOR_KEYS: (keyof ThemeColors)[] = ['primary', 'accent', 'accentText', 'surface', 'text', 'textMuted'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_RE = /^data:image\/(png|jpeg|svg\+xml)(;[a-zA-Z0-9=\-]+)*,/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Convalida un oggetto letto da un file; lancia un errore in italiano alla prima irregolarità.
export function validateTheme(raw: unknown): Theme {
  if (!isObject(raw)) throw new Error('Il file non è un tema valido.');
  if (raw.format !== THEME_FORMAT) throw new Error('Il file non è un tema di Note spese.');
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

  if (!isObject(raw.colors)) throw new Error('Tema non valido: mancano i colori («colors»).');
  const colors = {} as ThemeColors;
  for (const k of COLOR_KEYS) {
    const c = raw.colors[k];
    if (typeof c !== 'string' || !HEX_RE.test(c)) {
      throw new Error(`Tema non valido: il colore «${k}» deve essere nel formato #RRGGBB.`);
    }
    colors[k] = c.toLowerCase();
  }

  const fonts = isObject(raw.fonts) ? raw.fonts : {};
  const heading = fonts.heading ?? 'system';
  const body = fonts.body ?? 'system';
  if (heading !== 'serif' && heading !== 'system') throw new Error('Tema non valido: «fonts.heading» deve essere «serif» o «system».');
  if (body !== 'sans' && body !== 'system') throw new Error('Tema non valido: «fonts.body» deve essere «sans» o «system».');

  return {
    format: THEME_FORMAT,
    version: THEME_VERSION,
    companyName: name.trim(),
    shortName: short.trim(),
    logo,
    colors,
    fonts: { heading, body },
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

// ---------- Colori ----------

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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

// ---------- Applicazione all'interfaccia ----------

const WHITE = '#ffffff';

// Variabili CSS del tema chiaro e di quello scuro di sistema.
export function themeVariables(t: Theme): { light: Record<string, string>; dark: Record<string, string> } {
  const c = t.colors;
  const light: Record<string, string> = {
    '--bg': c.surface,
    '--surface': WHITE,
    '--text': c.text,
    '--muted': c.textMuted,
    '--primary': c.primary,
    '--on-primary': onColor(c.primary),
    '--accent': c.accent,
    '--accent-text': c.accentText,
    '--band': c.primary,
    '--on-band': onColor(c.primary),
    '--border': mix(c.surface, c.text, 0.18),
  };
  // Tema scuro: `primary` fa da fondo, l'accento (schiarito se serve) da dettaglio.
  const bg = c.primary;
  const text = onColor(bg) === WHITE ? ensureContrast(c.surface, bg, 7) : ensureContrast(c.text, bg, 7);
  const surface = mix(bg, text, 0.08);
  const accent = ensureContrast(c.accent, surface, 4.5);
  const dark: Record<string, string> = {
    '--bg': bg,
    '--surface': surface,
    '--text': text,
    '--muted': ensureContrast(mix(text, bg, 0.35), surface, 4.5),
    '--primary': accent,
    '--on-primary': onColor(accent),
    '--accent': accent,
    '--accent-text': accent,
    '--band': mix(bg, '#000000', 0.3),
    '--on-band': onColor(mix(bg, '#000000', 0.3)),
    '--border': mix(bg, text, 0.22),
  };
  return { light, dark };
}

const SERIF_STACK = "'Bodoni Moda', 'Didot', 'Bodoni 72', Georgia, serif";
const SANS_STACK = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SYSTEM_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function themeCss(t: Theme): string {
  const { light, dark } = themeVariables(t);
  const decl = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');
  const fonts = `--font-heading:${t.fonts.heading === 'serif' ? SERIF_STACK : SYSTEM_STACK};--font-body:${t.fonts.body === 'sans' ? SANS_STACK : SYSTEM_STACK}`;
  return `:root{${decl(light)};${fonts}}@media (prefers-color-scheme: dark){:root{${decl(dark)}}}`;
}

const STYLE_ID = 'tema-runtime';

// Imposta variabili CSS e colore della barra del browser. Con il tema neutro lascia il CSS di base.
export function applyTheme(t: Theme, doc: Document = document): void {
  let el = doc.getElementById(STYLE_ID);
  if (isDefaultTheme(t)) el?.remove();
  else {
    if (!el) {
      el = doc.createElement('style');
      el.id = STYLE_ID;
      doc.head.appendChild(el);
    }
    el.textContent = themeCss(t);
  }
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.colors.primary);
}
