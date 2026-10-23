import type { Category, Confidence, Field, ParseContext, ReceiptDraft } from '../types';

// Dal testo grezzo letto dalla foto ai campi della spesa. Solo regole sul testo, senza rete.
// Ogni campo ha una confidenza: «alta» se la regola ha trovato un riscontro esplicito,
// «bassa» se è una congettura da far confermare a chi usa l'app.

const field = <T>(value: T, confidence: Confidence): Field<T> => ({ value, confidence });

// ---------- Normalizzazione ----------

/** Maiuscolo, senza accenti, spazi ridotti. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[ \t ]+/g, ' ')
    .trim();
}

/** Come normalize, e corregge 0→O e 1→I dentro le parole (T0TALE, R1STORANTE). Per cercare parole chiave. */
export function normalizeForKeywords(s: string): string {
  return normalize(s)
    .replace(/(?<!\d)0(?=[A-Z])|(?<=[A-Z])0(?!\d)/g, 'O')
    .replace(/(?<!\d)1(?=[A-Z])|(?<=[A-Z])1(?!\d)/g, 'I');
}

/** Nome di fornitore confrontabile: maiuscolo, senza punteggiatura né forma societaria. */
export function normalizeSupplierName(s: string): string {
  return normalize(s)
    .replace(/\b(S\.?\s?R\.?\s?L\.?\s?S?|S\.?\s?P\.?\s?A\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?)(?=\s|$)/g, ' ')
    .replace(/[^A-Z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

// ---------- Importo ----------

// Cifre con i tipici scambi dell'OCR (O/o→0, I/l→1) ammessi dentro il numero.
const D = '[\\dOoIl]';
const AMOUNT_RE = new RegExp(
  `(?<![\\dA-Za-z])${D}+(?:[.,]\\d{3})*[ ]?[.,][ ]?${D}{2}(?!\\d)`,
  'g',
);

/** Converte «12,50», «12.50», «1.234,50», «1,234.50», «I2,5O» in centesimi; null se non è un importo. */
export function parseAmount(token: string): number | null {
  const t = token.replace(/\s+/g, '').replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  const m = /^(\d+(?:[.,]\d{3})*)[.,](\d{2})$/.exec(t);
  if (!m) return null;
  const int = m[1].replace(/[.,]/g, '');
  if (!/\d/.test(token)) return null;
  return parseInt(int, 10) * 100 + parseInt(m[2], 10);
}

/** Tutti gli importi (in centesimi) presenti in una riga, nell'ordine. */
export function findAmounts(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    if (!/\d/.test(m[0])) continue; // almeno una cifra vera: evita parole tipo «lOl»
    const v = parseAmount(m[0]);
    if (v !== null) out.push(v);
  }
  return out;
}

const NOT_TOTAL = /SUB\s*TOTAL|\bIVA\b|IMPOSTA|\bRESTO\b|CONTANT[EI]|SCONTO|NON RISCOSS/;

/** Priorità di una riga come «riga del totale»: 0 = non lo è. */
export function totalLineScore(line: string): number {
  const k = normalizeForKeywords(line);
  if (NOT_TOTAL.test(k)) return 0;
  if (/\bTOTALE\s+(COMPLESSIVO|EURO)\b/.test(k)) return 4;
  if (/\bTOTALE\b|\bDA PAGARE\b/.test(k)) return 3;
  if (/\bIMPORTO\b/.test(k)) return 2;
  if (/\bTOTAL\b/.test(k)) return 2;
  return 0;
}

/** Cerca la riga del totale; in mancanza prende l'importo più grande (confidenza bassa). */
export function findTotal(text: string): Field<number> | undefined {
  const lines = splitLines(text);
  let best: { score: number; cents: number } | null = null;
  lines.forEach((line, i) => {
    const score = totalLineScore(line);
    if (!score) return;
    let amounts = findAmounts(line);
    // L'importo può essere andato a capo sulla riga successiva.
    if (amounts.length === 0 && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (totalLineScore(next) === 0 && !/[A-Za-z]{3,}/.test(next.replace(/EUR|€/gi, ''))) {
        amounts = findAmounts(next);
      }
    }
    const cents = amounts[amounts.length - 1];
    if (cents === undefined || cents <= 0) return;
    // A parità di priorità vale l'ultima riga (dopo i parziali).
    if (!best || score >= best.score) best = { score, cents };
  });
  if (best) return field((best as { cents: number }).cents, 'alta');

  let max = 0;
  for (const line of lines) {
    if (NOT_TOTAL.test(normalizeForKeywords(line))) continue;
    for (const v of findAmounts(line)) if (v > max) max = v;
  }
  return max > 0 ? field(max, 'bassa') : undefined;
}

// ---------- Data ----------

const DATE_RE = new RegExp(
  `(?<![\\dOoIl/.\\-])(${D}{1,2})[ ]?[/\\-.][ ]?(${D}{1,2})[ ]?[/\\-.][ ]?(2${D}${D}{2}|${D}{2})(?![\\dOoIl])`,
  'g',
);

const fixDigits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');

/** Data valida in formato AAAA-MM-GG, oppure null. L'anno a due cifre vale 20aa. */
export function toIsoDate(d: string, m: string, y: string): string | null {
  const day = parseInt(fixDigits(d), 10);
  const month = parseInt(fixDigits(m), 10);
  let year = parseInt(fixDigits(y), 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  if (y.length <= 2) year += 2000;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > dim) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function findDate(text: string): Field<string> | undefined {
  const valid: string[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const iso = toIsoDate(m[1], m[2], m[3]);
    if (iso) valid.push(iso);
  }
  if (valid.length === 0) return undefined;
  return field(valid[0], new Set(valid).size === 1 ? 'alta' : 'bassa');
}

// ---------- Fornitore ----------

const SKIP_LINE =
  /DOCUMENTO COMMERCIALE|DI VENDITA|PRESTAZIONE|SCONTRINO|FATTURA|RICEVUTA|^COPIA|^CLIENTE\b|^TEL\b|^P\.? ?IVA|^C\.? ?F\b|^VIA\b|^V\.LE\b|^VIALE\b|^PIAZZA\b|^P\.ZZA\b|^CORSO\b|^LARGO\b|WWW\.|@/;
const COMPANY = /\bS\.? ?R\.? ?L\.? ?S?\b|\bS\.? ?P\.? ?A\.?(?=\s|$)|\bSNC\b|\bS\.N\.C\b|\bSAS\b|\bS\.A\.S\b|\bSRLS\b/;

function cleanSupplier(line: string): string {
  return normalizeForKeywords(line)
    // L'OCR a volte unisce l'intestazione a righe successive: si taglia al totale o al primo importo.
    .replace(/\s(TOTALE|IMPORTO|EURO|EUR|€)\b.*$/, '')
    .replace(new RegExp(`\\s${D}+[.,]${D}{2}\\b.*$`), '')
    .replace(/^[^A-Z0-9&]+|[^A-Z0-9&.]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function findSupplier(text: string): Field<string> | undefined {
  const head = splitLines(text).slice(0, 8);
  const candidates = head.filter((line) => {
    const n = normalize(line);
    if (n.replace(/[^A-Z]/g, '').length < 3) return false; // brevi o solo simboli/numeri
    if (SKIP_LINE.test(normalizeForKeywords(line))) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;
  const company = candidates.find((l) => COMPANY.test(normalize(l)));
  return field(cleanSupplier(company ?? candidates[0]), 'bassa');
}

// ---------- Località ----------

const LOWER_WORDS = new Set(['di', 'da', 'del', 'della', 'dei', 'delle', 'in', 'sul', 'sulla', 'sotto', 'sopra', 'e', 'al', 'alla']);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.replace(/(^|['’-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

export function findPlace(text: string): Field<string> | undefined {
  const head = splitLines(text).slice(0, 10);
  for (const line of head) {
    const m = /(?<![\dOo])([\dO]{5})(?![\dOo])[ ,\-]*(.+)$/.exec(line);
    if (!m || !/\d/.test(m[1])) continue;
    let rest = m[2].replace(/\([^)]*\)?/g, ' ').replace(/0/g, 'O').replace(/1/g, 'I').replace(/[^A-Za-zÀ-ÿ'’ \-]/g, ' ').replace(/\s+/g, ' ').trim();
    // Sigla della provincia in coda («BOLOGNA BO»).
    rest = rest.replace(/^(.{3,}) [A-Z]{2}$/, '$1');
    rest = rest.replace(/[ \-]+$/, '');
    if (rest.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 3) continue;
    return field(titleCase(rest), 'alta');
  }
  return undefined;
}

// ---------- Fattura ----------

export function findInvoice(text: string): Field<boolean> {
  const k = normalizeForKeywords(text);
  // «Non valido come fattura», «NON FATTURA»: il testo con la parola fattura ma negata non conta.
  const negated = /\bNON\b[^\n]{0,25}FATT[U]?RA/.test(k) || /\bNON FISCALE\b/.test(k);
  const withoutNeg = k.replace(/\bNON\b[^\n]{0,25}FATT[U]?RA/g, ' ');
  if (/\bFATTURA\b/.test(withoutNeg)) return field(true, 'alta');
  if (negated) return field(false, 'alta');
  if (/DOCUMENTO COMMERCIALE|\bSCONTRINO\b/.test(k)) return field(false, 'alta');
  return field(false, 'bassa');
}

// ---------- Carta e pagato da ----------

const CARD_RE = /[*Xx•#]{2,}[\s*Xx•#\-]*?([\dOoB]{4})(?![\dOoB])/g;

/** Ultime 4 cifre della carta, se stampate dopo asterischi o X. */
export function findCardLast4(text: string): string | undefined {
  for (const m of text.matchAll(CARD_RE)) {
    const digits = m[1].replace(/[Oo]/g, '0').replace(/B/g, '8');
    if (/^\d{4}$/.test(digits)) return digits;
  }
  return undefined;
}

export function findPayment(
  text: string,
  cards: ParseContext['cards'],
): Pick<ReceiptDraft, 'cardId' | 'payer'> {
  const last4 = findCardLast4(text);
  if (last4) {
    const card = cards.find((c) => c.last4 === last4);
    if (card) return { cardId: field(card.id, 'alta'), payer: field(card.owner, 'alta') };
    return {}; // carta letta ma sconosciuta: si sceglie a mano
  }
  const cash = splitLines(text).some((line) => {
    if (!/CONTANT[EI]/.test(normalizeForKeywords(line))) return false;
    const amounts = findAmounts(line);
    return !(amounts.length > 0 && amounts.every((a) => a === 0)); // «CONTANTE 0,00» non conta
  });
  if (cash) return { cardId: field(null, 'alta'), payer: field<'personale'>('personale', 'alta') };
  return {};
}

// ---------- Tipologia ----------

const KEYWORDS: Array<[Category, RegExp]> = [
  ['treno', /\bTRENITALIA\b|\bITALO\b|\bFRECCIA|\bTRENORD\b|\bBIGLIETTO\b/],
  ['taxi', /\bTAXI\b|\bRADIOTAXI\b|\bCAB\b/],
  ['alloggio', /\bHOTEL\b|\bALBERGO\b|\bB&B\b|\bB ?& ?B\b/],
  ['parcheggio', /\bPARCHEGGIO\b|\bPARKING\b|\bAUTOSTRADE\b|\bPEDAGGIO\b|\bTELEPASS\b/],
  ['pasto', /\bRISTORANTE\b|\bTRATTORIA\b|\bPIZZERIA\b|\bBAR\b|\bOSTERIA\b|\bCAFFE\b|\bCOPERTO\b|\bMENU\b/],
];

export function findKeywordCategory(text: string): Category | undefined {
  const lines = splitLines(text);
  // Prima l'intestazione (di solito dice che cos'è il locale), poi tutto il testo.
  for (const scope of [lines.slice(0, 6).join('\n'), lines.join('\n')]) {
    const k = normalizeForKeywords(scope);
    for (const [cat, re] of KEYWORDS) if (re.test(k)) return cat;
  }
  return undefined;
}

export function matchKnownSupplier(
  supplier: string | undefined,
  known: ParseContext['knownSuppliers'],
) {
  if (!supplier) return undefined;
  const s = normalizeSupplierName(supplier);
  if (s.length < 3) return undefined;
  return known.find((k) => {
    const n = normalizeSupplierName(k.name);
    return n.length >= 3 && (n === s || s.includes(n) || n.includes(s));
  });
}

// ---------- Insieme ----------

export function parseReceipt(text: string, ctx: ParseContext): ReceiptDraft {
  const draft: ReceiptDraft = {};

  const amount = findTotal(text);
  if (amount) draft.amountCents = amount;
  const date = findDate(text);
  if (date) draft.date = date;
  const supplier = findSupplier(text);
  if (supplier) draft.supplier = supplier;
  const place = findPlace(text);
  if (place) draft.place = place;
  draft.invoice = findInvoice(text);
  Object.assign(draft, findPayment(text, ctx.cards));

  const known = matchKnownSupplier(supplier?.value, ctx.knownSuppliers);
  if (known) {
    draft.category = field(known.category, 'alta');
    if (!draft.place && known.place) draft.place = field(known.place, 'alta');
  } else {
    const cat = findKeywordCategory(text);
    if (cat) draft.category = field(cat, 'bassa');
  }
  return draft;
}
