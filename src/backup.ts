// Backup unico in JSON (foto in base64) e ripristino che sostituisce tutto.
import { getSettings, putSettings, readEverything, replaceEverything, type DumpData } from './db';
import { shareFile, type ShareResult } from './share';
import type { Photo } from './types';

const FORMAT = 'note-spese-backup';
const VERSION = 1;

interface BackupFile extends Omit<DumpData, 'photos'> {
  format: string;
  version: number;
  exportedAt: string;
  photos: { id: string; type: string; data: string }[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function backupFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `note-spese-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export async function buildBackup(now: Date = new Date()): Promise<Blob> {
  // La data dell'ultimo backup va aggiornata prima, così il file la contiene già.
  await putSettings({ ...(await getSettings()), lastBackupAt: now.toISOString() });
  const d = await readEverything();
  const file: BackupFile = {
    ...d,
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    photos: await Promise.all(d.photos.map(async (p) => ({ id: p.id, type: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) }))),
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function exportBackup(): Promise<ShareResult> {
  const now = new Date();
  return shareFile(await buildBackup(now), backupFilename(now), 'Backup note spese');
}

// Legge e valida il testo di un backup; lancia un errore comprensibile se non va.
export function parseBackup(text: string): DumpData {
  let f: BackupFile;
  try {
    f = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('Il file non è un backup valido.');
  }
  if (f.format !== FORMAT || f.version !== VERSION || !Array.isArray(f.expenses) || !f.settings) {
    throw new Error('Il file non è un backup di Note spese.');
  }
  const photos: Photo[] = (f.photos ?? []).map((p) => ({ id: p.id, blob: base64ToBlob(p.data, p.type) }));
  return {
    expenses: f.expenses,
    photos,
    recipients: f.recipients ?? [],
    cards: f.cards ?? [],
    routes: f.routes ?? [],
    settings: f.settings,
    knownSuppliers: f.knownSuppliers ?? [],
  };
}

// Sostituisce tutti i dati con quelli del file, dopo conferma. Restituisce false se annullato.
export async function importBackup(
  file: Blob,
  confirmFn: (msg: string) => boolean = (m) => window.confirm(m),
): Promise<boolean> {
  const data = parseBackup(await file.text());
  if (!confirmFn('L’importazione sostituisce TUTTI i dati presenti nel telefono. Continuare?')) return false;
  await replaceEverything(data);
  return true;
}
