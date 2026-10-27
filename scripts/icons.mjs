// Генерация иконок приложения (раскрытая книга с бордовой закладкой на тёмно-синем фоне).
// Запуск: node scripts/icons.mjs  (нужен пакет sharp)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require(process.env.SHARP_PATH ?? 'sharp');
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

/** scale — доля размера, которую занимает рисунок (для maskable — безопасная зона). */
function svg(size, { scale = 1, rounded = false } = {}) {
  const s = size;
  const k = (s / 64) * scale;
  const off = (s - 64 * k) / 2;
  const r = rounded ? s * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A6AD0"/><stop offset="1" stop-color="#3B5BBF"/></linearGradient></defs>
  <rect width="${s}" height="${s}" rx="${r}" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${k})">
    <path d="M12 20.5c6-2.8 12.3-2.5 18.6 1.1v25.2c-6.3-3.6-12.6-3.9-18.6-1.1z" fill="#FFFFFF"/>
    <path d="M52 20.5c-6-2.8-12.3-2.5-18.6 1.1v25.2c6.3-3.6 12.6-3.9 18.6-1.1z" fill="#DCE4FA"/>
    <path d="M38.5 18.2h6.4v15.2l-3.2-2.6-3.2 2.6z" fill="#D2557A"/>
  </g>
</svg>`;
}

const jobs = [
  ['apple-touch-icon.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { scale: 0.74 }],
  ['favicon-32.png', 32, { rounded: true }],
];
for (const [name, size, opts] of jobs) {
  await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toFile(join(out, name));
  console.log('✓', name);
}
writeFileSync(join(out, 'favicon.svg'), svg(64, { rounded: true }));
console.log('✓ favicon.svg');
