// Condivisione di un file: foglio di condivisione del telefono, altrimenti download.
export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareFile(blob: Blob, filename: string, title?: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? filename });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // altro errore: ripiega sul download
    }
  }
  download(blob, filename);
  return 'downloaded';
}
