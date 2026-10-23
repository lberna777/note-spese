import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { monthLabel, shiftMonth } from '../labels';
import { IconChevronLeft, IconChevronRight } from './icons';

export function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

// Gruppo di righe in stile iOS (inset grouped), con intestazione e nota a piè di gruppo facoltative.
export function Group(props: { title?: string; footer?: string; children: ComponentChildren; class?: string }) {
  return (
    <section class="group-wrap">
      {props.title ? <h2 class="group-title">{props.title}</h2> : null}
      <div class={`group${props.class ? ` ${props.class}` : ''}`}>{props.children}</div>
      {props.footer ? <p class="group-foot">{props.footer}</p> : null}
    </section>
  );
}

// Riga di modulo: etichetta a sinistra, valore (campo) a destra.
export function Field(props: { label: string; warn?: boolean; children: ComponentChildren; hint?: string; select?: boolean }) {
  return (
    <label class={`row field${props.warn ? ' warn' : ''}${props.select ? ' has-select' : ''}`}>
      <span class="row-label">{props.label}{props.warn ? <small class="warn-tag">da controllare</small> : null}</span>
      {props.children}
      {props.hint ? <span class="row-hint">{props.hint}</span> : null}
    </label>
  );
}

// Interruttore iOS. L'area di tocco (51 x 44) è l'input trasparente sopra il disegno.
export function Switch(props: { label: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean }) {
  return (
    <label class={`row${props.warn ? ' warn' : ''}`}>
      <span class="row-label grow">{props.label}{props.warn ? <small class="warn-tag">da controllare</small> : null}</span>
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

// Controllo a segmenti di larghezza uguale. `nav`: sezioni dell'app; altrimenti scelta tra due valori.
export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  nav?: boolean;
}) {
  const Tag = props.nav ? 'nav' : 'div';
  return (
    <Tag class="segmented" aria-label={props.label} role={props.nav ? undefined : 'group'}>
      {props.options.map((o) => (
        <button
          type="button"
          key={o.value}
          class={props.value === o.value ? 'on' : ''}
          aria-current={props.nav && props.value === o.value ? 'page' : undefined}
          aria-pressed={props.nav ? undefined : props.value === o.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </Tag>
  );
}

// Foglio che sale dal basso: «Annulla» a sinistra, titolo al centro, azione a destra in grassetto.
// Con `onSubmit` il foglio è un modulo e l'azione a destra lo invia.
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
    <div class="sheet-backdrop">
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="sheet-grab" aria-hidden="true" />
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

export function MonthPicker(props: { month: string; onChange: (m: string) => void }) {
  return (
    <div class="month-picker">
      <button type="button" class="icon-btn" aria-label="Mese precedente" onClick={() => props.onChange(shiftMonth(props.month, -1))}><IconChevronLeft /></button>
      <strong>{monthLabel(props.month)}</strong>
      <button type="button" class="icon-btn" aria-label="Mese successivo" onClick={() => props.onChange(shiftMonth(props.month, 1))}><IconChevronRight /></button>
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
