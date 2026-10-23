import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { monthLabel, shiftMonth } from '../labels';

export function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

export function Field(props: { label: string; warn?: boolean; children: ComponentChildren; hint?: string }) {
  return (
    <label class={`field${props.warn ? ' warn' : ''}`}>
      <span class="field-label">{props.label}{props.warn ? ' (da controllare)' : ''}</span>
      {props.children}
      {props.hint ? <span class="hint">{props.hint}</span> : null}
    </label>
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="screen">
      <header class="screen-head">
        <button type="button" class="btn ghost" onClick={props.onClose}>‹ Indietro</button>
        <h1>{props.title}</h1>
      </header>
      <div class="screen-body">{props.children}</div>
    </div>
  );
}

export function MonthPicker(props: { month: string; onChange: (m: string) => void }) {
  return (
    <div class="month-picker">
      <button type="button" class="btn ghost" aria-label="Mese precedente" onClick={() => props.onChange(shiftMonth(props.month, -1))}>‹</button>
      <strong>{monthLabel(props.month)}</strong>
      <button type="button" class="btn ghost" aria-label="Mese successivo" onClick={() => props.onChange(shiftMonth(props.month, 1))}>›</button>
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
