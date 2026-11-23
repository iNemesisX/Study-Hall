// Builds the tablet / browser version into dist-web/: the same interface files as
// the desktop app, plus web/bridge.js (bundled) in place of the desktop back end,
// KaTeX, icons, a web-app manifest and an offline service worker.
// The Android app (android/) packages this folder too.
// Run: npm run build:web
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist-web');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });

fs.rmSync(out, { recursive: true, force: true });
copy('src', '.');
copy('node_modules/katex/dist/katex.min.css', 'vendor/katex/katex.min.css');
copy('node_modules/katex/dist/katex.min.js', 'vendor/katex/katex.min.js');
copy('node_modules/katex/dist/fonts', 'vendor/katex/fonts');
// Document readers and writers, loaded only when needed (see src/js/notes/sources.js).
for (const f of ['pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'mammoth/mammoth.browser.min.js', 'jszip/dist/jszip.min.js', 'docx/dist/index.iife.js', 'pptxgenjs/dist/pptxgen.bundle.js', '@supabase/supabase-js/dist/umd/supabase.js']) copy(`node_modules/${f}`, `vendor/${f}`);
copy('web/icons', 'icons');
copy('web/manifest.webmanifest', 'manifest.webmanifest');
copy('web/view.html', 'view.html'); // view-only links to shared notebooks

await esbuild.build({
  entryPoints: [path.join(root, 'web/bridge.js')],
  bundle: true, format: 'iife', platform: 'browser', target: ['safari15', 'chrome100'], minify: true,
  outfile: path.join(out, 'js/bridge.js'), logLevel: 'warning',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const swap = (a, b) => { if (!html.includes(a)) throw new Error(`index.html: missing ${a}`); html = html.replace(a, b); };
swap('../node_modules/katex/dist/', 'vendor/katex/');
swap('../node_modules/katex/dist/', 'vendor/katex/');
swap('<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#4b38a8">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Study Hall">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`);
// The browser version calls the AI providers directly.
swap("connect-src 'self' https://*.supabase.co wss://*.supabase.co;", "connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://en.wikipedia.org https://*.supabase.co wss://*.supabase.co; worker-src 'self'; manifest-src 'self';");
swap('<script type="module" src="js/app.js"></script>', '<script src="js/bridge.js"></script>\n  <script type="module" src="js/app.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(`./${path.relative(out, p).split(path.sep).join('/')}`);
  }
};
walk(out);
const sw = fs.readFileSync(path.join(root, 'web/sw.js'), 'utf8')
  .replace('__VERSION__', `${pkg.version}-${Date.now().toString(36)}`)
  .replace('__FILES__', JSON.stringify(['./', ...files.filter((f) => f !== './index.html' || true)]));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
console.log(`dist-web: ${files.length + 1} files, version ${pkg.version}`);
