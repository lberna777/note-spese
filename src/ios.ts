// Suggerimento per iPhone e iPad: senza «Aggiungi alla schermata Home» Safari può cancellare i dati del sito.

export const IOS_HINT_KEY = 'note-spese-ios-hint-chiuso';

export interface DeviceInfo {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean; // navigator.standalone
  displayStandalone?: boolean; // matchMedia('(display-mode: standalone)')
}

export function isIos(d: DeviceInfo): boolean {
  if (/iPhone|iPad|iPod/.test(d.userAgent)) return true;
  // iPadOS 13+ si presenta come un Mac con schermo tattile
  return d.platform === 'MacIntel' && (d.maxTouchPoints ?? 0) > 1;
}

export function shouldShowIosHint(d: DeviceInfo): boolean {
  return isIos(d) && d.standalone !== true && !d.displayStandalone;
}

export function currentDevice(): DeviceInfo {
  const nav = navigator as Navigator & { standalone?: boolean };
  let displayStandalone = false;
  try {
    displayStandalone = !!window.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    /* matchMedia non disponibile */
  }
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone,
    displayStandalone,
  };
}

export function iosHintDismissed(): boolean {
  try {
    return localStorage.getItem(IOS_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissIosHint(): void {
  try {
    localStorage.setItem(IOS_HINT_KEY, '1');
  } catch {
    /* modalità privata: la chiusura vale solo finché la pagina resta aperta */
  }
}
