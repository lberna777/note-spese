import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { monthLabel, shiftMonth } from '../labels';
import { IconChevronLeft, IconChevronRight } from './icons';

export function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

// Vero se la finestra rispetta la media query (aggiornato quando cambia). Serve a scegliere tra telefono e computer.
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// Sezione: titolo in maiuscoletto, filetto d'accento in alto, righe separate da filetti neutri.
export function Group(props: { title?: string; footer?: string; children: ComponentChildren; class?: string }) {
  return (
    <section class="group-wrap">
      {props.title ? <h2 class="group-title lbl">{props.title}</h2> : null}
      <div class={`group${props.class ? ` ${props.class}` : ''}`}>{props.children}</div>
      {props.footer ? <p class="group-foot">{props.footer}</p> : null}
    </section>
  );
}

// Riga di modulo: etichetta in maiuscoletto a sinistra, valore (campo) a destra.
export function Field(props: { label: string; warn?: boolean; children: ComponentChildren; hint?: string; select?: boolean }) {
  return (
    <label class={`row field${props.warn ? ' warn' : ''}${props.select ? ' has-select' : ''}`}>
      <span class="row-label lbl">{props.label}{props.warn ? <small class="warn-tag">da controllare</small> : null}</span>
      {props.children}
      {props.hint ? <span class="row-hint">{props.hint}</span> : null}
    </label>
  );
}

// Interruttore. L'area di tocco (51 x 44) è l'input trasparente sopra il disegno.
export function Switch(props: { label: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean }) {
  return (
    <label class={`row${props.warn ? ' warn' : ''}`}>
      <span class="row-label lbl grow">{props.label}{props.warn ? <small class="warn-tag">da controllare</small> : null}</span>
      <span class="switch">
        <input
          type="checkbox"
          role="switch"
          checked={props.checked}
          aria-label={props.label}
          onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
        />
        <i />
      </span>
    </label>
  );
}

// Scelta tra poche voci, a riquadri affiancati; quella attiva è piena d'accento.
export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" aria-label={props.label} role="group">
      {props.options.map((o) => (
        <button
          type="button"
          key={o.value}
          class={props.value === o.value ? 'on' : ''}
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Menu del telefono: voci in maiuscoletto, filetto d'accento sotto quella attiva.
export function Tabs<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <nav class="ph-tabs" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          type="button"
          key={o.value}
          class={props.value === o.value ? 'on' : ''}
          aria-current={props.value === o.value ? 'page' : undefined}
          onClick={() => props.onChange(o.value)}
        >
          <span>{o.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Modulo: sul telefono sale dal basso («Annulla» a sinistra, titolo al centro, azione a destra); sul computer
// il CSS lo mette come pannello a destra. Con `onSubmit` è un form e l'azione a destra lo invia.
export function Sheet(props: {
  title: string;
  onClose: () => void;
  onSubmit?: (e: Event) => void;
  closeLabel?: string;
  actionLabel?: string;
  children: ComponentChildren;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Tag = props.onSubmit ? 'form' : 'div';
  const formProps = props.onSubmit ? { onSubmit: props.onSubmit } : {};
  return (
    <div class="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && window.matchMedia?.('(min-width: 900px)').matches) props.onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <Tag class="sheet-inner" {...formProps}>
          <header class="sheet-bar">
            <button type="button" class="bar-btn left" onClick={props.onClose}>{props.closeLabel ?? 'Annulla'}</button>
            <h1 class="sheet-title">{props.title}</h1>
            {props.onSubmit ? (
              <button type="submit" class="bar-btn right strong">{props.actionLabel ?? 'Salva'}</button>
            ) : props.actionLabel ? (
              <button type="button" class="bar-btn right strong" onClick={props.onClose}>{props.actionLabel}</button>
            ) : <span />}
          </header>
          <div class="sheet-body">{props.children}</div>
        </Tag>
      </div>
    </div>
  );
}

// «‹ Ottobre 2026 ›» tra due filetti d'accento.
export function MonthPicker(props: { month: string; onChange: (m: string) => void }) {
  return (
    <div class="mese-nav">
      <button type="button" class="icon-btn" aria-label="Mese precedente" onClick={() => props.onChange(shiftMonth(props.month, -1))}><IconChevronLeft size={18} /></button>
      <strong class="m">{monthLabel(props.month)}</strong>
      <button type="button" class="icon-btn" aria-label="Mese successivo" onClick={() => props.onChange(shiftMonth(props.month, 1))}><IconChevronRight size={18} /></button>
    </div>
  );
}

// Titolo grande e leggero con, sotto, una riga in maiuscoletto; a destra, se serve, le frecce del mese.
export function ScreenTitle(props: { title: string; sub?: string; month?: string; onMonth?: (m: string) => void }) {
  return (
    <div class="ph-title">
      <div class="title-row">
        <h1>{props.title}</h1>
        {props.month && props.onMonth ? (
          <div class="title-arrows">
            <button type="button" class="icon-btn" aria-label="Mese precedente" onClick={() => props.onMonth!(shiftMonth(props.month!, -1))}><IconChevronLeft size={20} /></button>
            <button type="button" class="icon-btn" aria-label="Mese successivo" onClick={() => props.onMonth!(shiftMonth(props.month!, 1))}><IconChevronRight size={20} /></button>
          </div>
        ) : null}
      </div>
      {props.sub ? <div class="sub lbl">{props.sub}</div> : null}
    </div>
  );
}

// URL temporaneo della foto di una spesa (o di un Blob già in mano)
export function usePhotoUrl(photoId: string | null | undefined, blob?: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    (async () => {
      const b = blob ?? (photoId ? (await getPhoto(photoId))?.blob : null);
      if (b && !revoked) {
        created = URL.createObjectURL(b);
        setUrl(created);
      } else if (!b) setUrl(null);
    })();
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoId, blob]);
  return url;
}

// Finestra di conferma per le cancellazioni: dice cosa si perde, pulsante distruttivo in rosso. Con `phrase` il pulsante
// si attiva solo dopo aver scritto la parola richiesta (per esempio «CANCELLA»).
export function ConfirmDialog(props: {
  title: string;
  children: ComponentChildren;
  confirmLabel: string;
  phrase?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !props.phrase || typed.trim() === props.phrase;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onCancel();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div class="confirm-backdrop">
      <div class="confirm" role="alertdialog" aria-modal="true" aria-label={props.title}>
        <h2 class="confirm-title">{props.title}</h2>
        <div class="confirm-text">{props.children}</div>
        {props.phrase ? (
          <label class="confirm-phrase">
            <span class="lbl">Per confermare scrivi {props.phrase}</span>
            <input type="text" value={typed} autoComplete="off" autoCapitalize="characters" onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
          </label>
        ) : null}
        <div class="confirm-actions">
          <button type="button" class="btn-out" onClick={props.onCancel}>Annulla</button>
          <button
            type="button"
            class="btn-danger"
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
