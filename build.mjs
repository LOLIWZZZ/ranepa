// Сборка: dist/ — готовый сайт для размещения (PWA), preview/ — одностраничная версия для просмотра.
// Запуск: npm run build
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH ?? 'esbuild');

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const previewDir = join(root, 'preview');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari15', 'ios15', 'chrome100'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __PREVIEW__: 'false' },
  outdir: join(dist, 'assets'),
  entryNames: 'app-[hash]',
  legalComments: 'eof',
  charset: 'utf8',
  metafile: true,
  logLevel: 'warning',
});

const outputs = Object.keys(result.metafile.outputs).map((p) => relative(dist, join(root, p)).split('\\').join('/'));
const js = outputs.find((p) => p.endsWith('.js'));
const css = outputs.find((p) => p.endsWith('.css'));
if (!js || !css) throw new Error('Сборка не создала app.js и app.css');

cpSync(join(root, 'public'), dist, { recursive: true });

const html = readFileSync(join(root, 'src/index.template.html'), 'utf8').replace('%CSS%', css).replace('%JS%', js);
writeFileSync(join(dist, 'index.html'), html);

// Список файлов для офлайн-кэша и версия по их содержимому
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(dist)
  .map((f) => relative(dist, f).split('\\').join('/'))
  .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
  .sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const precache = ['./', ...files.map((f) => `./${f}`)];
const sw = readFileSync(join(root, 'src/sw.template.js'), 'utf8').replace('%VERSION%', version).replace('%PRECACHE%', JSON.stringify(precache, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);

// Одностраничная версия (всё встроено) — для предпросмотра без сервера
const previewBuild = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari15', 'ios15', 'chrome100'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __PREVIEW__: 'true' },
  outdir: join(root, '.preview-tmp'),
  legalComments: 'eof',
  charset: 'utf8',
  write: false,
  logLevel: 'warning',
});
const pick = (ext) => new TextDecoder().decode(previewBuild.outputFiles.find((f) => f.path.endsWith(ext)).contents);
const jsCode = pick('.js').replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD');
const cssCode = pick('.css');
if (existsSync(previewDir)) rmSync(previewDir, { recursive: true, force: true });
mkdirSync(previewDir, { recursive: true });
const preview = `<title>RANEPA Student</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..800&display=swap">
<style>${cssCode}</style>
<div id="root"></div>
<script>${jsCode}</script>
`;
writeFileSync(join(previewDir, 'ranepa-student.html'), preview);

const size = (p) => `${Math.round(statSync(join(dist, p)).size / 1024)} КБ`;
console.log(`✓ dist/ готов: ${js} (${size(js)}), ${css} (${size(css)}), версия ${version}`);
console.log(`✓ preview/ranepa-student.html (${Math.round(Buffer.byteLength(preview) / 1024)} КБ)`);
