/** Сведения о среде запуска: iPhone, режим «на экране Домой», поддержка функций. */

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Запущено как приложение с экрана «Домой» (а не во вкладке браузера). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function isSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS/.test(ua);
}

export function supportsBadge(): boolean {
  return 'setAppBadge' in navigator && 'Notification' in window;
}

export async function updateAppBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Значок недоступен (нет разрешения или не поддерживается) — ничего не делаем.
  }
}

export interface StorageInfo {
  persisted: boolean | null;
  usageBytes: number | null;
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageInfo(): Promise<StorageInfo> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return { persisted, usageBytes: estimate?.usage ?? null };
  } catch {
    return { persisted: null, usageBytes: null };
  }
}

/** Открыть внешнюю ссылку (только https). */
export function openExternal(url: string): void {
  if (!/^https:\/\//i.test(url)) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}
