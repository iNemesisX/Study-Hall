// Headless check of the tablet / browser version (dist-web), as an iPad would run it:
// portrait and landscape, touch screen, Apple Pencil / S Pen style pen input.
// Run: npm run build:web && npx electron test/smoke-web.js
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { app, BrowserWindow } = require('electron');
const root = path.join(__dirname, '..', 'dist-web');
const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'studyhall-web-shots');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = msg => fs.writeSync(1, `${msg}\n`); // unbuffered, so progress shows even if a step hangs
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, p.endsWith('/') ? `${p}index.html` : p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

say('script started');
app.whenReady().then(() => { say('electron ready'); server.listen(0, '127.0.0.1', () => { say('server up'); run(); }); });

async function run() {
  const url = `http://127.0.0.1:${server.address().port}/?mock`;
  const win = new BrowserWindow({ width: 820, height: 1180, show: true, webPreferences: { partition: `persist:web${Date.now()}`, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.setUserAgent(IPAD);
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 2) errors.push(`${msg} @${src}:${line}`); });
  // Touch-screen emulation through the DevTools protocol (makes "(pointer: coarse)" match, as on a tablet).
  const touch = async () => {
    const dbg = win.webContents.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    await Promise.race([dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }), sleep(3000)]);
  };
  const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const shot = async name => { await sleep(500); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const check = (label, ok) => { say(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; };
  const PG = `document.querySelector('.pg-root')._pg`;
  const waitFor = (expr, ms = 6000) => js(`for (let i = 0; i < ${ms / 100} && !(${expr}); i++) await new Promise(r => setTimeout(r, 100)); return !!(${expr});`);
  const click = (sel, text) => js(`[...document.querySelectorAll('${sel}')].find(b => b.textContent.includes(${JSON.stringify(text)})).click();`);
  try {
    say(`loading ${url}`);
    await Promise.race([win.loadURL(url), sleep(15000)]);
    say('loaded');
    await touch();
    say('touch on');
    await waitFor(`document.querySelector('#appbar .logo')`);
    check('web version loads with its own back end (no desktop app)', await js(`return window.studyhall.platform.kind === 'web' && window.studyhall.platform.os === 'ios' && !window.studyhall.importQuizlet && typeof window.studyhall.notes.captureStart === 'undefined'`));
    check('touch screen detected', await js(`return matchMedia('(pointer: coarse)').matches`));

    /* first-run tour on a portrait iPad */
    check('tour starts on first launch', await waitFor(`document.querySelector('.tour-tip h3')?.textContent.includes('Welcome')`));
    await shot('w01-tour-portrait');
    await js(`document.querySelector('.tour-tip .btn.primary').click();`); await sleep(600);
    check('tour opens the slide-out pane to show the notebook picker', await js(`return document.body.classList.contains('nav-open') && getComputedStyle(document.querySelector('#nav')).transform === 'none' && document.querySelector('.tour-tip h3').textContent.includes('One notebook')`));
    await shot('w02-tour-drawer');
    await js(`document.querySelector('.tour-tip .btn.primary').click(); await new Promise(r => setTimeout(r, 400)); document.querySelector('.tour-tip .btn.primary').click();`); await sleep(500);
    check('tour says "Tap" on touch screens', await js(`return document.querySelector('.tour-tip p').textContent.includes('Tap "Sample notes')`));
    await js(`[...document.querySelectorAll('.page-item')].find(p => p.textContent.includes('Sample notes')).click();`); await sleep(900);
    check('tapping the page in the pane advances and closes the pane', await js(`return document.querySelector('.tour-tip h3').textContent.includes('what Study Hall writes') && !document.body.classList.contains('nav-open')`));
    await js(`[...document.querySelectorAll('.tour-tip button')].find(b => b.textContent.includes('Skip the tour')).click();`); await sleep(400);

    /* navigation pane */
    await sleep(300);
    const paneState = await js(`return { toggle: getComputedStyle(document.querySelector('.nav-toggle')).display, right: document.querySelector('#nav').getBoundingClientRect().right, open: document.body.classList.contains('nav-open'), w: innerWidth, tour: !!document.querySelector('.tour-tip'), tf: getComputedStyle(document.querySelector('#nav')).transform, pos: getComputedStyle(document.querySelector('#nav')).position, scrolled: [...document.querySelectorAll('*')].filter(e => e.scrollLeft).map(e => e.tagName + '.' + e.className + ':' + e.scrollLeft), bodycls: document.body.className }`);
    check('pane hidden in portrait, ☰ button shown', paneState.toggle !== 'none' && paneState.right <= 0);
    if (!(paneState.toggle !== 'none' && paneState.right <= 0)) say(`  pane: ${JSON.stringify(paneState)}`);
    await js(`document.querySelector('.nav-toggle').click();`); await sleep(400);
    check('☰ slides the pane in', await js(`return document.querySelector('#nav').getBoundingClientRect().left >= 0`));
    await js(`const w = document.querySelector('.workspace'); w.dispatchEvent(new MouseEvent('click', { bubbles: true }));`); await sleep(400);
    check('tapping beside the pane closes it', await js(`return !document.body.classList.contains('nav-open')`));

    /* new notebook, camera, photos -> notes */
    await js(`document.querySelector('.nav-toggle').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.nb-picker').click();`); await sleep(200);
    await click('.menu-item', 'New notebook'); await sleep(250);
    await js(`document.querySelector('.modal input').value = 'Biology 101'; document.querySelector('.modal .btn.primary').click();`);
    check('new notebook opens on a page that offers the tablet camera', await waitFor(`document.querySelector('.pg-start')`) && await js(`const b = [...document.querySelectorAll('.pg-start .btn')].map(x => x.textContent).join('|'); const cam = document.querySelector('input[data-camera]'); return b.includes('Take a photo') && !b.includes('phone') && cam.getAttribute('capture') === 'environment'`));
    await js(`document.querySelector('[data-tab="insert"]').click();`);
    check('Insert tab shows Camera instead of Phone camera', await js(`const t = document.querySelector('#ribbon .rb-panel').textContent; return t.includes('Camera') && !t.includes('Phone camera')`));
    await shot('w03-empty-page');
    await js(`const c = document.createElement('canvas'); c.width = 2600; c.height = 1800; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2600, 1800); g.fillStyle = '#123'; g.font = '120px serif'; g.fillText('Mitosis (slide 1)', 100, 300);
      const b = await new Promise(r => c.toBlob(r, 'image/png')); await ${PG}.addFiles([new File([b], 'IMG_0001.png', { type: 'image/png' })]);`);
    check('photo stored on the device, downscaled to 2000px JPEG', await js(`const img = ${PG}.page.images[0]; const bytes = await window.studyhall.notes.readImage(${PG}.nb.id, img.file); const bmp = await createImageBitmap(new Blob([bytes])); return bytes[0] === 0xff && bmp.width === 2000`));
    await click('.rb.big', 'Turn into notes');
    check('notes generated, with the AI notice', await waitFor(`document.querySelectorAll('.pg-topic').length === 2`) && await js(`return document.querySelector('.pg-credit').textContent.includes('can be wrong') && ${PG}.page.aiBy.length === 1`));
    check('diagram found and offered in Clippings', await js(`return ${PG}.page.clips.length >= 1 && document.querySelectorAll('.clip').length >= 1`));
    await js(`document.querySelector('.clip-head .icon-btn')?.click();`);

    /* stylus */
    await js(`document.querySelector('[data-tab="draw"]').click(); document.querySelector('[data-pen="fountain"]').click();`);
    await js(`const svg = document.querySelector('.pg-topic > svg.pg-ink'); const b = svg.getBoundingClientRect();
      const ev = (t, x, y, o = {}) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + x, clientY: b.top + y, pointerId: 31, bubbles: true, button: 0, buttons: 1, pointerType: 'pen', pressure: 0.5, ...o }));
      ev('pointerdown', 60, 80, { pressure: 0.15 }); for (let i = 1; i < 40; i++) ev('pointermove', 60 + i * 8, 80 + Math.sin(i / 3) * 10, { pressure: 0.15 + 0.8 * Math.sin(i / 40 * Math.PI) }); ev('pointerup', 380, 80, { buttons: 0 });`);
    check('pen draws with pressure', await js(`const s = ${PG}.page.topics[0].ink[0]; const p = s.pts.map(q => q[2]); return s.tool === 'fountain' && Math.max(...p) - Math.min(...p) > 0.3`));
    await js(`const svg = document.querySelector('.pg-topic > svg.pg-ink'); const b = svg.getBoundingClientRect();
      const ev = (t, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + 200, clientY: b.top + y, pointerId: 32, bubbles: true, button: 2, buttons: 2, pointerType: 'pen', pressure: 0.5 }));
      ev('pointerdown', 40); for (let y = 40; y < 130; y += 4) ev('pointermove', y); ev('pointerup', 130);`);
    check('holding the S Pen side button erases', await js(`return ${PG}.page.topics[0].ink.length === 0`));
    await js(`${PG}.history.undo();`);
    await js(`const svg = document.querySelector('.pg-topic > svg.pg-ink'); const sc = document.querySelector('.pg-scroll'); const b = svg.getBoundingClientRect(); window.__y = sc.scrollTop;
      const ev = (t, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + 120, clientY: y, pointerId: 33, bubbles: true, button: 0, pointerType: 'touch' }));
      ev('pointerdown', 700); for (let y = 700; y > 400; y -= 25) ev('pointermove', y); ev('pointerup', 400);`);
    check('a finger scrolls instead of drawing (palm rejection)', await js(`return ${PG}.page.topics[0].ink.length === 1 && document.querySelector('.pg-scroll').scrollTop > window.__y`));
    await js(`document.querySelector('[data-tab="home"]').click(); document.querySelector('.pg-scroll').scrollTop = 0;`);
    await shot('w04-notes-portrait');

    /* fonts and print */
    check('font list has device-independent choices', await js(`const o = [...document.querySelectorAll('.rb-select.font option')].map(x => x.value); return ['System', 'Serif', 'Monospace', 'Handwriting'].every(f => o.includes(f))`));
    await js(`window.__printed = 0; window.print = () => { window.__printed++; }; [...document.querySelectorAll('#ribbon .rb')].find(b => b.textContent.includes('Print')).click();`); await sleep(200);
    check('Print / PDF opens the print screen', await js(`return window.__printed === 1`));

    /* AI setup on iPad */
    await js(`document.querySelector('.ai-chip').click();`); await sleep(400);
    check('Ollama is marked unavailable on iPad, with an explanation', await js(`document.querySelector('[data-pick="ollama"]').click(); return document.querySelector('[data-pick="ollama"]').classList.contains('unavailable') && document.querySelector('[data-p="ollama"]').textContent.includes("isn't available in the iPad version")`));
    await js(`[...document.querySelectorAll('.modal footer .btn')].find(b => b.textContent === 'Save').click(); await new Promise(r => setTimeout(r, 200));`);
    check('and cannot be saved as the AI', await js(`const ok = document.querySelector('[data-status]').textContent.includes("isn't available"); document.querySelector('.modal [data-close]').click(); return ok`));

    /* study tools */
    await js(`document.querySelector('[data-tab="study"]').click();`); await click('.rb.big', 'Flashcards'); await sleep(250);
    await click('.menu-item', 'Generate from your notes'); await sleep(300);
    await js(`document.querySelector('.modal .btn.primary').click();`);
    check('flashcards generated and opened', await waitFor(`/^#\\/set\\//.test(location.hash) && document.querySelectorAll('.term-row').length === 5`));
    await js(`location.hash = location.hash + '/learn';`); await sleep(500);
    check('Learn mode runs', await js(`return document.querySelector('#main').textContent.includes('Learn')`));

    /* landscape */
    win.setSize(1280, 800); await sleep(600);
    await js(`history.back();`); await sleep(500);
    check('landscape shows the navigation pane beside the page', await js(`return getComputedStyle(document.querySelector('.nav-toggle')).display === 'none' && document.querySelector('#nav').getBoundingClientRect().left === 0`));
    await js(`[...document.querySelectorAll('.page-item')][0]?.click();`); await sleep(700);
    await shot('w05-landscape');

    /* data survives the app being closed */
    const nbId = await js(`return (await import('./js/notes/nbstore.js')).list().find(n => n.name === 'Biology 101').id`);
    await win.webContents.reload(); await sleep(2500);
    await js(`document.querySelector('.tour-layer') && [...document.querySelectorAll('.tour-tip button')].find(b => b.textContent.includes('Skip')).click();`); await sleep(300);
    await js(`location.hash = '#/nb/${nbId}';`); await sleep(1200);
    check('notes, ink and flashcards are still there after reopening', await js(`const m = await import('./js/store.js'); return document.querySelectorAll('.pg-topic').length === 2 && document.querySelectorAll('.pg-topic > svg.pg-ink path').length === 1 && m.setsForNotebook('${nbId}').length === 1`));

    /* usage counter */
    await js(`await window.studyhall.notes.setSettings({ provider: 'gemini' }); (await import('./js/views/nav.js')).refreshAi(); await new Promise(r => setTimeout(r, 300));`);
    check('AI requests are counted on the device', await js(`return /[1-9]\\d*\\/20 today/.test(document.querySelector('.ai-chip').textContent)`));

    /* export everything -> remove -> import */
    await js(`window.__saved = null; window.studyhall.saveFile = async (name, mime, text) => { window.__saved = { name, text }; return true; }; (await import('./js/notes/transfer.js')).exportEverything(); await new Promise(r => setTimeout(r, 1500));`);
    check('Export everything packs notebooks, photos and flashcards in one file', await js(`const d = JSON.parse(window.__saved.text); const e = d.notebooks.find(x => x.notebook.id === '${nbId}'); return d.kind === 'studyhall-export' && window.__saved.name.endsWith('.json') && e.pages.length === 1 && Object.keys(e.images).length >= 1 && JSON.parse(d.flashcards).sets.length >= 2`));
    await js(`const nbs = await import('./js/notes/nbstore.js'); await nbs.removeNotebook('${nbId}'); const m = await import('./js/store.js'); for (const s of m.setsForNotebook('${nbId}')) m.db().sets.splice(m.db().sets.indexOf(s), 1); m.save();`);
    check('(notebook removed)', await js(`return !(await import('./js/notes/nbstore.js')).get('${nbId}')`));
    await js(`(await import('./js/notes/transfer.js')).importEverything(new File([window.__saved.text], 'backup.json')); await new Promise(r => setTimeout(r, 2000));`);
    check('Import brings back the notebook, its photo, ink and flashcards', await js(`const nbs = await import('./js/notes/nbstore.js'); const nb = nbs.get('${nbId}'); const pid = nb.sections[0].pages[0].id; const pg = await window.studyhall.notes.loadPage('${nbId}', pid);
      const bytes = await window.studyhall.notes.readImage('${nbId}', pg.images[0].file); const m = await import('./js/store.js'); return pg.topics[0].ink.length === 1 && bytes.length > 1000 && m.setsForNotebook('${nbId}').length === 1`));
    await js(`(await import('./js/notes/transfer.js')).importEverything(new File([window.__saved.text], 'backup.json')); await new Promise(r => setTimeout(r, 1500));`);
    check('importing again does not duplicate anything', await js(`const nbs = await import('./js/notes/nbstore.js'); const m = await import('./js/store.js'); return nbs.list().filter(n => n.name === 'Biology 101').length === 1 && m.setsForNotebook('${nbId}').length === 1`));

    /* web app manifest and offline files */
    check('installable web app: manifest, icons, offline cache list', await js(`const m = await (await fetch('manifest.webmanifest')).json(); const sw = await (await fetch('sw.js')).text(); return m.display === 'standalone' && m.icons.length === 3 && sw.includes('vendor/katex/katex.min.js') && !!document.querySelector('link[rel=apple-touch-icon]')`));
    check('no console errors', errors.length === 0);
    if (errors.length) console.log(errors.join('\n'));
  } catch (e) { console.log('FAIL  exception:', e.stack); process.exitCode = 1; }
  console.log('screenshots in', out);
  server.close();
  app.exit(process.exitCode || 0);
}
