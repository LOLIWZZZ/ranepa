/** Сохранение и чтение файлов в браузере iPhone. */

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Отдаёт файл пользователю. На iPhone открывается меню «Поделиться»: «Сохранить в Файлы»,
 * отправка в мессенджер и т. п. Если меню недоступно — обычная загрузка.
 */
export async function saveFile(name: string, mime: string, content: string, preferShare = true): Promise<SaveResult> {
  const blob = new Blob([content], { type: mime });
  if (preferShare && typeof File !== 'undefined' && typeof navigator.canShare === 'function') {
    const file = new File([blob], name, { type: mime });
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // иначе пробуем загрузку
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Открыть файл календаря напрямую: Safari на iPhone обычно предлагает добавить события. */
export function openCalendarFile(content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
  });
}

export function fileStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
