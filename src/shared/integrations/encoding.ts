/**
 * Декодирование текстовых файлов расписания. Excel на русской Windows сохраняет CSV
 * в кодировке Windows-1251, поэтому если файл не является корректным UTF-8 — декодируем как CP1251.
 */

export function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let extra: number;
    if (b >= 0xc2 && b <= 0xdf) extra = 1;
    else if (b >= 0xe0 && b <= 0xef) extra = 2;
    else if (b >= 0xf0 && b <= 0xf4) extra = 3;
    else return false;
    if (i + extra >= bytes.length) return false;
    for (let k = 1; k <= extra; k += 1) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      i += 3;
    } else {
      cp = ((b & 0x07) << 18) | ((bytes[i + 1]! & 0x3f) << 12) | ((bytes[i + 2]! & 0x3f) << 6) | (bytes[i + 3]! & 0x3f);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

// Windows-1251: байты 0x80–0xBF (0xC0–0xFF — это А…я подряд)
const CP1251_HIGH =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏ' +
  'ђ‘’“”•–—\uFFFD™љ›њќћџ' + // 0x98 в Windows-1251 не определён
  ' ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї' +
  '°±Ііґµ¶·ё№є»јЅѕї';

export function decodeCp1251(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xc0) out += CP1251_HIGH[b - 0x80];
    else out += String.fromCharCode(0x0410 + (b - 0xc0));
  }
  return out;
}

export function decodeTextFile(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1251' } {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  if (isValidUtf8(body)) return { text: decodeUtf8(body), encoding: 'utf-8' };
  return { text: decodeCp1251(body), encoding: 'windows-1251' };
}

/** UTF-8 с BOM — так Excel правильно открывает кириллицу в CSV. */
export function encodeUtf8WithBom(text: string): Uint8Array {
  const bytes: number[] = [0xef, 0xbb, 0xbf];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(bytes);
}
