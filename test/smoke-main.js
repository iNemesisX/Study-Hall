// Headless end-to-end check. Run: npm run smoke
// The AI is mocked for the app flow; the Gemini, Ollama and Claude request code
// is exercised against small stand-in servers. Uses a throwaway data folder.
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { app, BrowserWindow, nativeImage } = require('electron');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'studyhall-test-'));
const old = fs.mkdtempSync(path.join(os.tmpdir(), 'studydeck-old-'));
const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'studyhall-shots');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- a pretend StudyDeck 1.3 data folder, to test the upgrade path
fs.mkdirSync(path.join(old, 'notebooks', 'oldnb1', 'images'), { recursive: true });
fs.writeFileSync(path.join(old, 'notebooks', 'oldnb1', 'notebook.json'), JSON.stringify({
  id: 'oldnb1', name: 'Chem 110', created: 5, updated: 6, images: [], setId: 'oldset1',
  sections: [{ id: 'sec1', heading: 'Atoms', html: '<p>Protons and neutrons.</p>', ink: [{ tool: 'pen', color: '#1d4ed8', size: 2, pts: [[1, 1], [9, 9]] }] }],
}));
fs.writeFileSync(path.join(old, 'studydeck-data.json'), JSON.stringify({
  version: 1, settings: { theme: 'paper' }, folders: [], studyDays: [],
  sets: [{ id: 'oldset1', title: 'Chem 110', cards: [{ id: 'c1', term: 'Proton', def: 'Positive particle' }] }],
}));

// --- stand-in AI servers
const seen = {};
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const doc = { title: 'T', sections: [{ heading: 'H', summary: 's', blocks: [{ type: 'paragraph', text: 'from ' + req.url.split('/')[1] }] }] };
    if (req.url.startsWith('/gemini/models/limited')) return send(429, { error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }] } });
    if (req.url.startsWith('/gemini/models/busy')) { seen.busy = (seen.busy || 0) + 1; if (seen.busy === 1) return send(429, { error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '1s' }] } }); }
    if (req.url.startsWith('/gemini/models?')) return send(200, { models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-x-tts', supportedGenerationMethods: ['generateContent'] }] });
    if (req.url.startsWith('/gemini/')) {
      seen.gemini = { url: req.url, key: req.headers['x-goog-api-key'], img: j.contents[0].parts.some(p => p.inlineData?.mimeType === 'image/jpeg'), schema: !!j.generationConfig.responseJsonSchema, sys: !!j.systemInstruction };
      return send(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```json\n' + JSON.stringify(doc) + '\n```' }] } }] });
    }
    if (req.url === '/ollama/api/tags') return send(200, { models: [{ name: 'qwen3-vl:8b' }] });
    if (req.url === '/ollama/api/chat') {
      if (j.model === 'missing') return send(404, { error: 'model "missing" not found' });
      seen.ollama = { img: j.messages[1].images.length === 1, schema: typeof j.format === 'object', stream: j.stream };
      return send(200, { done_reason: 'stop', message: { content: JSON.stringify(doc) } });
    }
    if (req.url === '/claude/messages') {
      seen.claude = { key: req.headers['x-api-key'], tool: j.tool_choice?.name, img: j.messages[0].content.some(c => c.type === 'image') };
      return send(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', input: doc }] });
    }
    send(404, {});
  });
});

fake.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${fake.address().port}`;
  process.env.STUDYHALL_MOCK = '1';
  process.env.STUDYHALL_OLD_DIR = old;
  process.env.STUDYHALL_GEMINI_URL = `${base}/gemini`;
  process.env.STUDYHALL_CLAUDE_URL = `${base}/claude`;
  app.setPath('userData', data);
  require('../main.js');
  app.whenReady().then(() => run(base));
});

async function run(base) {
  await sleep(1800);
  const win = BrowserWindow.getAllWindows()[0];
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 2) errors.push(`${msg} @${src}:${line}`); });
  const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const shot = async name => { await sleep(450); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; };
  const PG = `document.querySelector('.pg-root')._pg`;
  const clickText = (sel, text) => js(`[...document.querySelectorAll('${sel}')].find(b => b.textContent.includes(${JSON.stringify(text)})).click();`);
  try {
    /* ---- upgrade from StudyDeck ---- */
    check('StudyDeck data carried over on first launch', fs.existsSync(path.join(data, 'studyhall-data.json')) && fs.existsSync(path.join(data, 'notebooks', 'oldnb1')));
    const conv = JSON.parse(fs.readFileSync(path.join(data, 'notebooks', 'oldnb1', 'notebook.json'), 'utf8'));
    const convPage = JSON.parse(fs.readFileSync(path.join(data, 'notebooks', 'oldnb1', 'pages', conv.sections[0].pages[0].id + '.json'), 'utf8'));
    check('old notebook converted to section + page, ink kept', conv.sections.length === 1 && convPage.topics[0].heading === 'Atoms' && convPage.topics[0].ink.length === 1);
    check('old flashcard set linked to its notebook', await js(`const m = await import('./js/store.js'); return m.getSet('oldset1').notebookId === 'oldnb1'`));

    /* ---- first-run tour ---- */
    check('tour starts on first launch', await js(`for (let i = 0; i < 60 && !document.querySelector('.tour-tip h3'); i++) await new Promise(r => setTimeout(r, 100));
      return !!document.querySelector('.tour-layer') && document.querySelector('.tour-tip h3').textContent.includes('Welcome')`));
    await shot('01-tour-welcome');
    const tip = () => js(`return document.querySelector('.tour-tip h3')?.textContent || ''`);
    const nextBtn = () => js(`document.querySelector('.tour-tip .btn.primary').click();`);
    await nextBtn(); await sleep(300);
    check('tour step 1 points at the notebook picker', (await tip()).includes('One notebook per class'));
    check('clicks outside the spotlight are blocked', await js(`
      const r = document.querySelector('[data-tour="pages"]').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 20, r.bottom - 60); const before = location.hash;
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); return hit.classList.contains('tour-shade') && location.hash === before;`));
    check('typing is blocked during the tour', await js(`const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }); document.body.dispatchEvent(ev); return ev.defaultPrevented;`));
    await shot('02-tour-step');
    await nextBtn(); await sleep(200); await nextBtn(); await sleep(300);
    check('"do it" step has no Next button', (await tip()).includes('Pages hold') && await js(`return !document.querySelector('.tour-tip .btn.primary')`));
    check('the highlighted target is clickable', await js(`const a = [...document.querySelectorAll('.page-item')].find(p => p.textContent.includes('Sample notes')); const r = a.getBoundingClientRect(); return document.elementFromPoint(r.left + 30, r.top + 8).closest('.page-item') === a;`));
    await clickText('.page-item', 'Sample notes'); await sleep(900);
    check('doing the action advances the tour', (await tip()).includes('what Study Hall writes'));
    await shot('03-tour-notes');
    await nextBtn(); await sleep(700);
    check('sample notes are labelled as sample content', await js(`const c = document.querySelector('.pg-credit'); return !!c && c.textContent.includes('Sample content') && !document.querySelector('.pg-pic.diagram .dg-credit')`));
    check('tour shows pictures and diagrams on the sample page', (await tip()).includes('Pictures and diagrams') && await js(`return !!document.querySelector('.pg-pic.diagram') && document.querySelectorAll('.pg-pic.diagram .dg-label').length === 10`));
    await shot('03b-tour-pictures');
    await nextBtn(); await sleep(300);
    await js(`document.querySelector('[data-tab="insert"]').click();`); await sleep(500);
    check('Insert tab step', (await tip()).includes('Three ways'));
    await shot('04-tour-insert');
    await nextBtn(); await sleep(300);
    await js(`document.querySelector('[data-tab="draw"]').click();`); await sleep(500);
    check('Draw tab step asks to pick a pen', (await tip()).includes('Pick a pen'));
    await js(`document.querySelector('[data-pen="marker"]').click();`); await sleep(500);
    check('picking a pen advances', (await tip()).includes('Draw on the page'));
    await js(`const svg = document.querySelector('.pg-topic svg.pg-ink'); const b = svg.getBoundingClientRect();
      const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + x, clientY: b.top + y, pointerId: 3, bubbles: true, button: 0, pointerType: 'mouse' }));
      ev('pointerdown', 80, 60); for (let i = 1; i < 20; i++) ev('pointermove', 80 + i * 9, 60 + Math.sin(i / 2) * 8); ev('pointerup', 260, 60);`);
    await sleep(500);
    check('drawing advances', (await tip()).includes('Back to typing'));
    await shot('05-tour-draw');
    await js(`document.querySelector('[data-tab="home"]').click();`); await sleep(500);
    check('part 1 ends on fonts, highlights and comments', (await tip()).includes('Fonts, highlights'));
    check('step cards show no stray text', await js(`return !document.querySelector('.tour-tip').textContent.includes('null')`));
    await nextBtn(); await sleep(300);
    check('checkpoint after part 1 offers to continue or finish', (await tip()).includes('Part 1 done') && await js(`return [...document.querySelectorAll('.tour-tip button')].some(b => b.textContent === 'Finish for now') && document.querySelector('.tour-tip .btn.primary').textContent.includes('part 2')`));
    await shot('06a-tour-checkpoint');
    await nextBtn(); await sleep(300);
    check('part 2 starts: Study tab', (await tip()).includes('The Study tab') && await js(`return document.querySelector('.tour-count').textContent.includes('Part 2 of 3')`));
    await js(`document.querySelector('[data-tab="study"]').click();`); await sleep(500);
    check('asks to click Flashcards', (await tip()) === 'Flashcards');
    await js(`document.querySelector('[data-tour="flashcards"]').click();`); await sleep(600);
    check('flashcard menu step explains generate / type / Quizlet', (await tip()).includes('Three ways to make a set') && await js(`const t = document.querySelector('.tour-tip').textContent; return t.includes('Generate from your notes') && t.includes('Type your own') && t.includes('Import from Quizlet') && !!document.querySelector('.menu')`));
    await shot('06b-tour-flashcard-menu');
    await nextBtn(); await sleep(600);
    check('asks to open the sample set from the menu', (await tip()).includes('Open a set') && await js(`return !!document.querySelector('.menu')`));
    await js(`[...document.querySelectorAll('.menu .menu-item')].find(m => m.textContent.includes('Sample: Cellular')).click();`); await sleep(800);
    check('opening the set advances to the study modes', (await tip()).includes('Four ways to study') && /^#\/set\//.test(await js(`return location.hash`)) && await js(`return !document.querySelector('.menu')`));
    await shot('06c-tour-modes');
    await nextBtn(); await sleep(400);
    check('asks to flip a card', (await tip()).includes('Try a card'));
    await js(`document.querySelector('#fc .flash').click();`); await sleep(500);
    check('flipping advances to edit / export to Quizlet', (await tip()).includes('export to Quizlet'));
    await shot('06d-tour-export');
    await nextBtn(); await sleep(400);
    check('practice test and study guide step', (await tip()).includes('Practice tests and study guides'));
    await nextBtn(); await sleep(300); await nextBtn(); await sleep(300);
    check('checkpoint after part 2', (await tip()).includes('Part 2 done'));
    await nextBtn(); await sleep(400);
    check('part 3: AI setup step', (await tip()).includes('Set up the AI') && await js(`return document.querySelector('.tour-count').textContent.includes('Part 3 of 3')`));
    await nextBtn(); await sleep(200); await nextBtn(); await sleep(500);
    check('tour ends, is remembered, and suggests next steps', await js(`const m = await import('./js/store.js'); return !document.querySelector('.tour-layer') && m.db().settings.tourDone && document.querySelector('.modal h2').textContent.includes('ready')`));
    await shot('07-tour-finish');
    await js(`document.querySelector('.modal [data-action="0"]').click();`);

    /* ---- welcome content + feature guide ---- */
    check('welcome notebook has how-to, sample notes, sample guide and a sample set', await js(`
      const nb = (await import('./js/notes/nbstore.js')).list().find(n => n.sample); const m = await import('./js/store.js');
      return nb.sections.length === 2 && nb.sections[0].pages.length === 3 && nb.sections[1].pages[0].kind === 'guide' && m.setsForNotebook(nb.id).length === 1`));
    await js(`document.querySelector('[data-tab="help"]').click();`); await clickText('.rb.big', 'Feature guide'); await sleep(300);
    check('feature guide lists every feature', await js(`return document.querySelectorAll('.modal .feature').length === 12`));
    await shot('08-feature-guide');
    await js(`document.querySelector('.modal [data-close]').click();`);

    /* ---- FAQ ---- */
    await js(`document.querySelector('#appbar [data-tour="help-btn"]').click();`); await sleep(300);
    check('? button opens the FAQ', await js(`return document.querySelector('.modal h2').textContent.includes('Frequently') && document.querySelectorAll('.modal details.faq').length >= 20`));
    await js(`const s = document.querySelector('.faq-search'); s.value = 'gemini key'; s.dispatchEvent(new Event('input'));`); await sleep(100);
    check('FAQ search filters and opens the API key answer', await js(`const shown = [...document.querySelectorAll('details.faq')].filter(d => !d.hidden);
      const g = document.querySelector('[data-faq="gemini"]'); return shown.length >= 1 && shown.length < 8 && g.open && g.querySelector('a[href="https://aistudio.google.com/apikey"]') && g.textContent.includes('Create API key')`));
    await shot('08b-faq');
    check('FAQ "Open AI setup" button works', await js(`document.querySelector('[data-faq="gemini"] [data-ai]').click(); await new Promise(r => setTimeout(r, 300)); return document.querySelector('.modal h2').textContent === 'AI setup'`));
    check('AI setup links back to the FAQ', await js(`document.querySelector('[data-faq-link]').click(); await new Promise(r => setTimeout(r, 400)); return document.querySelector('[data-faq="gemini"]').open`));
    await js(`document.querySelector('.modal [data-close]').click();`); await sleep(200);
    check('Welcome notebook has an AI setup page with clean links', await js(`const nb = (await import('./js/notes/nbstore.js')).list().find(n => n.sample); const meta = nb.sections[0].pages[2];
      const pg = await window.studyhall.notes.loadPage(nb.id, meta.id); const html = pg.topics.map(t => t.html).join(''); return meta.title.includes('Set up the AI') && html.includes('aistudio.google.com/apikey') && !html.includes('](')`));

    /* ---- AI setup ---- */
    await js(`document.querySelector('.ai-chip').click();`); await sleep(400);
    check('AI setup offers Gemini (default), Ollama and Claude', await js(`const c = [...document.querySelectorAll('.ai-choice')]; return c.length === 3 && c[0].classList.contains('on') && c[0].textContent.includes('Free') && !document.querySelector('[data-p="gemini"]').hidden && document.querySelector('[data-p="claude"]').hidden`));
    await shot('09-ai-setup');
    await js(`document.querySelector('[data-pick="ollama"]').click(); document.querySelector('[data-p="ollama"] [data-f="url"]').value = '${base}/ollama';
      document.querySelector('[data-p="ollama"] [data-f="model"]').value = 'qwen3-vl:8b';
      [...document.querySelectorAll('.modal footer .btn')].find(b => b.textContent === 'Save').click();`);
    await sleep(500);
    check('provider choice is saved and shown in the app bar', await js(`const s = await window.studyhall.notes.getSettings(); return s.provider === 'ollama' && s.ollama.url === '${base}/ollama' && document.querySelector('.ai-chip').textContent.includes('Ollama')`));

    /* ---- the three providers, against stand-in servers ---- */
    const ai = require('../notes/ai.js');
    const img = { mediaType: 'image/jpeg', data: nativeImage.createFromBitmap(Buffer.alloc(40 * 40 * 4, 180), { width: 40, height: 40 }).toJPEG(80).toString('base64') };
    const args = { images: [img], notebookName: 'N', pageTitle: 'P' };
    delete process.env.STUDYHALL_MOCK;
    const g = await ai.generateNotes({ provider: 'gemini', apiKey: 'gk', model: 'gemini-3.5-flash', detail: 'detailed' }, args);
    check('Gemini: request shape and fenced-JSON reply handled', g.sections[0].blocks[0].text === 'from gemini' && seen.gemini.key === 'gk' && seen.gemini.img && seen.gemini.schema && seen.gemini.sys && seen.gemini.url.includes('gemini-3.5-flash:generateContent'));
    const o = await ai.generateNotes({ provider: 'ollama', url: `${base}/ollama`, model: 'qwen3-vl:8b', detail: 'detailed' }, args);
    check('Ollama: request shape and reply handled', o.sections[0].blocks[0].text === 'from ollama' && seen.ollama.img && seen.ollama.schema && seen.ollama.stream === false);
    const c = await ai.generateNotes({ provider: 'claude', apiKey: 'ck', model: 'claude-sonnet-5-5', detail: 'detailed' }, args);
    check('Claude: request shape and reply handled', c.sections[0].blocks[0].text === 'from claude' && seen.claude.key === 'ck' && seen.claude.tool === 'save_notes' && seen.claude.img);
    const msg = async fn => { try { await fn(); return ''; } catch (e) { return e.message; } };
    check('Gemini free-limit error is explained', (await msg(() => ai.generateNotes({ provider: 'gemini', apiKey: 'k', model: 'limited' }, args))).includes('free Gemini limit'));
    const usage = require('../notes/usage.js');
    check('daily limit is learned from Gemini\'s own error', usage.status('gemini').limit === 20 && usage.status('gemini').level === 'max' && usage.status('gemini').source === 'reported');
    const before = usage.status('gemini').count;
    const waited = await ai.generateNotes({ provider: 'gemini', apiKey: 'k', model: 'busy', detail: 'detailed' }, args);
    check('per-minute limit waits and retries once', waited.sections.length === 1 && seen.busy === 2 && usage.status('gemini').count === before + 2);
    const fd = await ai.drawDiagram({ provider: 'gemini', apiKey: 'gk', model: 'gemini-3.5-flash' }, { image: img, label: 'x' }).catch(e => e.message);
    check('a diagram reply without shapes is rejected', String(fd).includes('empty'));
    check('Ollama missing model tells you the pull command', (await msg(() => ai.generateNotes({ provider: 'ollama', url: `${base}/ollama`, model: 'missing' }, args))).includes('ollama pull missing'));
    check('Ollama not running is explained', (await msg(() => ai.generateNotes({ provider: 'ollama', url: 'http://127.0.0.1:9', model: 'm' }, args))).includes('Install it from ollama.com'));
    check('model lists load', (await ai.listModels({ provider: 'gemini', apiKey: 'k' })).join() === 'gemini-3.5-flash' && (await ai.listModels({ provider: 'ollama', url: `${base}/ollama` })).join() === 'qwen3-vl:8b');
    process.env.STUDYHALL_MOCK = '1';

    /* ---- usage alerts ---- */
    await js(`await window.studyhall.notes.setSettings({ provider: 'gemini' }); document.querySelector('[data-tab="home"]').click();`);
    await js(`(await import('./js/views/nav.js')).refreshAi(); await new Promise(r => setTimeout(r, 400));`);
    check('used-up limit shows a red bar and count on the AI button', await js(`const b = document.querySelector('#usagebar'); return !b.hidden && b.classList.contains('max') && b.textContent.includes('used up') && /\\d+\\/20 today/.test(document.querySelector('.ai-chip').textContent) && document.querySelector('.ai-chip').classList.contains('max')`));
    await shot('09b-usage-max');
    await js(`await window.studyhall.notes.setSettings({ provider: 'claude', claude: { dailyLimit: 4 } }); (await import('./js/views/nav.js')).refreshAi(); await new Promise(r => setTimeout(r, 300));`);
    check('no warning while usage is low', await js(`return document.querySelector('#usagebar').hidden && document.querySelector('.ai-chip').textContent.includes('1/4 today')`));
    await js(`await window.studyhall.notes.makeCards({ notes: 'x', count: 3 }); await window.studyhall.notes.makeCards({ notes: 'x', count: 3 }); await new Promise(r => setTimeout(r, 500));`);
    check('warning bar appears at 75% of the daily limit', await js(`const b = document.querySelector('#usagebar'); return !b.hidden && b.classList.contains('warn') && b.textContent.includes('3 of 4') && b.textContent.includes('1 left')`));
    await shot('09c-usage-warn');
    check('multi-request actions ask first when the allowance is short', await js(`const m = await import('./js/notes/aiui.js'); const p = m.checkBudget(3); await new Promise(r => setTimeout(r, 200));
      const shown = document.querySelector('.modal h2').textContent.includes('use up'); document.querySelector('.modal [data-action="0"]').click(); return shown && (await p) === false`));
    await js(`[...document.querySelectorAll('#usagebar button')].find(b => b.textContent === 'Dismiss').click();`);
    check('dismissing hides the bar until the next level', await js(`return document.querySelector('#usagebar').hidden`));
    await js(`await window.studyhall.notes.makeCards({ notes: 'x', count: 3 }); await new Promise(r => setTimeout(r, 500));`);
    check('it comes back when the limit is reached', await js(`const b = document.querySelector('#usagebar'); return !b.hidden && b.classList.contains('max')`));
    await js(`await window.studyhall.notes.setSettings({ provider: 'ollama' }); (await import('./js/views/nav.js')).refreshAi(); await new Promise(r => setTimeout(r, 300));`);
    check('no limit warnings for the local AI', await js(`return document.querySelector('#usagebar').hidden`));

    /* ---- make a class notebook, add photos, get notes ---- */
    await js(`document.querySelector('.nb-picker').click();`); await sleep(150);
    await clickText('.menu-item', 'New notebook'); await sleep(200);
    await js(`document.querySelector('.modal input').value = 'Physics 101'; document.querySelector('.modal .btn.primary').click();`);
    await sleep(900);
    check('new notebook opens on an empty page that invites photos', await js(`return /^#\\/nb\\/\\w+\\/p\\/\\w+$/.test(location.hash) && !!document.querySelector('.pg-start') && document.querySelector('.nb-picker b').textContent === 'Physics 101'`));
    await shot('10-empty-page');
    await js(`const c = document.createElement('canvas'); c.width = 900; c.height = 600;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,900,600); g.fillStyle = '#123'; g.font = '48px serif'; g.fillText('F = ma  (slide 1)', 60, 120);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      await ${PG}.addFiles([new File([b], 'slide1.png', { type: 'image/png' })]);`);
    check('photo added and Insert tab shows 1 waiting', await js(`document.querySelector('[data-tab="insert"]').click(); return ${PG}.page.images.length === 1 && document.querySelector('.rb-badge').textContent === '1'`));
    await clickText('.rb.big', 'Phone camera'); await sleep(900);
    const url = await js(`return document.querySelector('.qr-url')?.textContent`);
    const local = String(url).replace(/\/\/[^:]+:/, '//127.0.0.1:');
    check('phone capture page is served', !!url && (await (await fetch(local)).text()).includes('Take photo'));
    const photo = nativeImage.createFromBitmap(Buffer.alloc(3000 * 2000 * 4, 200), { width: 3000, height: 2000 }).toJPEG(80);
    check('phone upload accepted, junk refused', (await fetch(local + '/upload', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: photo })).ok && (await fetch(local + '/upload', { method: 'POST', body: 'x' })).status === 415);
    await sleep(500);
    check('phone photo lands on the open page', await js(`return ${PG}.page.images.length === 2 && document.querySelector('[data-count]').textContent.startsWith('1 photo')`));
    await js(`document.querySelector('.modal [data-action="0"]').click();`); await sleep(300);
    await shot('11-photos-waiting');
    await clickText('.rb.big', 'Turn photos into notes'); await sleep(1200);
    check('notes written into topics, page titled, photos marked used', await js(`return document.querySelectorAll('.pg-topic').length === 2 && ${PG}.page.title === 'Newtonian Mechanics' && ${PG}.newPhotos() === 0 && document.querySelectorAll('.pg-text .katex').length >= 3`));
    check('page title shows in the page list', await js(`return document.querySelector('.page-item.on').textContent.includes('Newtonian Mechanics')`));

    /* ---- AI disclaimer ---- */
    check('AI notes show which model wrote them and that they can be wrong', await js(`const c = document.querySelector('.pg-credit'); return !!c && c.textContent.includes('Notes on this page were written with Ollama (qwen3-vl:8b)') && c.textContent.includes('can be wrong') && ${PG}.page.aiBy[0].model === 'qwen3-vl:8b'`));
    check('the notice is not part of the editable notes', await js(`return !document.querySelector('.pg-credit').closest('.pg-text') && !${PG}.page.topics.some(t => t.html.includes('ai-credit'))`));

    /* ---- clippings, pictures and AI diagrams ---- */
    check('diagram found in the photos is offered in Clippings, with a clean redraw', await js(`const c = ${PG}.page.clips; return c.length === 2 && c[0].src && c[1].kind === 'diagram' && document.querySelectorAll('.clip-dock.open .clip').length === 2 && document.querySelector('.clip.drawn svg.clip-thumb') !== null`));
    await shot('11b-clippings');
    await js(`document.querySelector('.clip:not(.drawn) .btn.primary').click(); await new Promise(r => setTimeout(r, 900));`);
    check('Place puts the cut-out under its section as a picture', await js(`const t = ${PG}.page.topics[0]; const p = t.pics[0]; const el = document.querySelector('.pg-pic img'); return t.pics.length === 1 && !!p.file && p.y > 50 && Math.abs(p.r - 0.5) < 0.2 && !!el && ${PG}.page.clips[0].used`));
    await js(`const paper = document.querySelector('.pg-paper'); const t = document.querySelectorAll('.pg-topic')[1].getBoundingClientRect();
      const dt = new DataTransfer(); dt.setData('application/x-studyhall-clip', ${PG}.page.clips[1].id);
      paper.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: t.left + 400, clientY: t.top + 200 })); await new Promise(r => setTimeout(r, 700));`);
    check('dragging the clean diagram into the notes places it at the drop point', await js(`const p = ${PG}.page.topics[1].pics[0]; return p.kind === 'diagram' && Math.abs(p.x + p.w / 2 - 400) < 3 && document.querySelectorAll('.pg-pic.diagram .dg-label').length === 3`));
    check('AI-drawn diagrams carry an "AI-drawn" badge naming the model', await js(`const b = document.querySelector('.pg-pic.diagram .dg-credit'); return !!b && b.textContent.includes('AI-drawn') && b.title.includes('qwen3-vl:8b') && b.title.includes('can be wrong') && document.querySelector('.clip.drawn .pill').textContent.includes('AI')`));
    check('AI-drawn SVG is stripped of scripts and handlers', await js(`const a = document.querySelector('.pg-pic.diagram .dg-art'); return !a.querySelector('script') && !a.innerHTML.includes('onclick') && a.querySelectorAll('rect').length === 2 && a.querySelectorAll('polygon').length === 1`));
    const drag = (sel, dx, dy) => js(`const el = document.querySelector('${sel}'); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const ev = (t, X, Y) => el.dispatchEvent(new PointerEvent(t, { clientX: X, clientY: Y, pointerId: 21, bubbles: true, button: 0, pointerType: 'mouse' }));
      ev('pointerdown', x, y); ev('pointermove', x + ${dx} / 2, y + ${dy} / 2); ev('pointermove', x + ${dx}, y + ${dy}); ev('pointerup', x + ${dx}, y + ${dy}); await new Promise(r => setTimeout(r, 250));`);
    const d0 = await js(`const p = ${PG}.page.topics[1].pics[0]; return [p.x, p.y, p.w]`);
    await drag('.pg-pic.diagram', -60, 30);
    check('pictures show no stray text', await js(`return document.querySelectorAll('.pg-pic').length === 2 && [...document.querySelectorAll('.pg-pic')].every(p => ![...p.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))`));
    check('a picture can be dragged to a new position', await js(`const p = ${PG}.page.topics[1].pics[0]; return p.x === ${d0[0]} - 60 && p.y === ${d0[1]} + 30 && document.querySelector('.pg-pic.diagram').classList.contains('sel')`));
    await drag('.pg-pic.diagram .pic-handle', -80, 0);
    check('dragging the corner resizes it', await js(`return ${PG}.page.topics[1].pics[0].w === ${d0[2]} - 80`));
    await js(`const l = document.querySelector('.pg-pic.diagram .dg-label'); l.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); l.textContent = 'Mass (kg)'; l.blur(); await new Promise(r => setTimeout(r, 100));`);
    check('diagram labels can be edited', await js(`return ${PG}.page.topics[1].pics[0].diagram.labels[0].text === 'Mass (kg)' && document.querySelector('.pg-pic.diagram .dg-label').textContent === 'Mass (kg)'`));
    const l0 = await js(`return ${PG}.page.topics[1].pics[0].diagram.labels[0].x`);
    await drag('.pg-pic.diagram .dg-label', 40, 0);
    check('diagram labels can be moved, and added', await js(`const d = ${PG}.page.topics[1].pics[0].diagram; const moved = d.labels[0].x > ${l0} + 30; [...document.querySelectorAll('.pg-pic.diagram .pic-bar button')].find(b => b.textContent.includes('Label')).click(); return moved && d.labels.length === 4`));
    await js(`[...document.querySelectorAll('.pg-pic.diagram .pic-bar button')].find(b => b.textContent.includes('Draw on it')).click(); await new Promise(r => setTimeout(r, 200));
      const svg = document.querySelector('.pg-pic.diagram svg.pic-ink'); const b = svg.getBoundingClientRect();
      const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + x, clientY: b.top + y, pointerId: 22, bubbles: true, button: 0, pointerType: 'mouse' }));
      ev('pointerdown', 30, 30); for (let i = 1; i < 15; i++) ev('pointermove', 30 + i * 8, 30 + i * 3); ev('pointerup', 150, 75);`);
    check('drawing on a picture stores ink with that picture', await js(`return ${PG}.getMode() !== 'text' && ${PG}.page.topics[1].pics[0].ink.length === 1 && ${PG}.page.topics[1].ink.length === 0`));
    await js(`document.querySelector('.pg-pic.diagram').scrollIntoView({ block: 'center' });`);
    await shot('11c-pictures');
    await js(`document.querySelector('[data-tab="home"]').click();
      const c = document.createElement('canvas'); c.width = 500; c.height = 300; c.getContext('2d').fillRect(0, 0, 500, 300);
      const b = await new Promise(r => c.toBlob(r, 'image/png')); await ${PG}.pics.insertFiles([new File([b], 'own.png', { type: 'image/png' })], null);`);
    check('an image file can be placed as a standalone picture', await js(`return ${PG}.pics.count() === 3 && ${PG}.page.images.length === 2`));
    await js(`${PG}.pics.addManualClip(${PG}.page.images[0].file, { x: 0.1, y: 0.1, w: 0.3, h: 0.3 });`);
    check('clipping part of a photo by hand adds it to Clippings', await js(`return ${PG}.page.clips.length === 3 && document.querySelectorAll('.clip').length === 3`));
    await js(`const drop = new DataTransfer(); const c = document.createElement('canvas'); c.width = 80; c.height = 80; const b = await new Promise(r => c.toBlob(r, 'image/png')); drop.items.add(new File([b], 'd.png', { type: 'image/png' }));
      document.querySelector('.pg-root').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drop, clientX: 700, clientY: 500 })); await new Promise(r => setTimeout(r, 200));`);
    check('dropping an image on notes asks: picture or photo for notes', await js(`const t = document.querySelector('.menu')?.textContent || ''; document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return t.includes('as a picture') && t.includes('turn into notes')`));
    const picId = await js(`const all = ${PG}.page.topics.flatMap(t => t.pics || []); return all[all.length - 1].id`);
    await js(`await ${PG}.pics.removePic('${picId}');`);
    check('pictures can be deleted', await js(`return ${PG}.pics.count() === 2`));
    await js(`document.querySelector('.clip-head .icon-btn').click(); document.querySelector('.pg-scroll').scrollTop = 0;`);

    /* ---- annotate ---- */
    await js(`document.querySelector('[data-tab="home"]').click();
      const p = document.querySelector('.pg-text p:not(.lead)'); const r = document.createRange();
      r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 19); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('#ribbon .rb.swatch').click();`);
    check('text highlight stored', await js(`return /background-color/.test(${PG}.page.topics[0].html)`));
    await js(`const li = document.querySelector('.pg-text li'); const r = document.createRange(); r.selectNodeContents(li.firstChild);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      [...document.querySelectorAll('#ribbon .rb')].find(b => b.textContent.includes('Comment')).click();
      document.querySelector('.pg-pop textarea').value = 'Ask about this in class';
      [...document.querySelectorAll('.pg-pop .btn')].find(b => b.textContent === 'Save').click();`);
    check('comment stored', await js(`return ${PG}.page.topics[0].html.includes('data-note="Ask about this in class"')`));
    /* ---- fonts ---- */
    await js(`getSelection().removeAllRanges(); await new Promise(r => setTimeout(r, 60)); const sel = document.querySelector('.rb-select.font'); sel.value = 'Georgia'; sel.dispatchEvent(new Event('change'));`);
    check('font with nothing selected applies to the whole page', await js(`return ${PG}.page.font === 'Georgia' && getComputedStyle(document.querySelector('.pg-text p')).fontFamily.includes('Georgia') && document.querySelector('.rb-select.font').value === 'Georgia'`));
    await js(`const p = document.querySelectorAll('.pg-text li')[2]; const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      await new Promise(r => setTimeout(r, 50)); document.querySelector('.rb-select.font').focus();
      const f = document.querySelector('.rb-select.font'); f.value = 'Consolas'; f.dispatchEvent(new Event('change'));`);
    await js(`const p = document.querySelectorAll('.pg-text li')[2]; const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      await new Promise(r => setTimeout(r, 50));
      const z = document.querySelector('.rb-select.size'); z.value = '22'; z.dispatchEvent(new Event('change'));`);
    check('font and size with text selected apply to that text only', await js(`const html = ${PG}.page.topics[0].html; return /font-family: ?Consolas/.test(html) && /font-size: ?22px/.test(html) && !html.includes('xxx-large') && ${PG}.page.font === 'Georgia'`));
    await js(`document.querySelector('[data-tab="draw"]').click();`);
    const stroke = (pen, y) => js(`document.querySelector('[data-pen="${pen}"]').click();
      const svg = document.querySelector('.pg-topic svg.pg-ink'); const b = svg.getBoundingClientRect();
      const ev = (t, x, y, o = {}) => svg.dispatchEvent(new PointerEvent(t, { clientX: b.left + x, clientY: b.top + y, pointerId: 7, bubbles: true, button: 0, pointerType: 'pen', pressure: 0.5, ...o }));
      ev('pointerdown', 70, ${y}, { pressure: 0.1 });
      for (let i = 1; i < 40; i++) ev('pointermove', 70 + i * 9, ${y} + Math.sin(i / 3) * 10, { pressure: 0.1 + 0.8 * Math.sin(i / 40 * Math.PI) });
      ev('pointerup', 421, ${y});`);
    await stroke('pen', 70); await stroke('fountain', 140); await stroke('pencil', 200); await stroke('marker', 270); await stroke('hl', 330);
    const tools = await js(`return ${PG}.page.topics[0].ink.map(s => s.tool).join(',')`);
    check('all five pen types draw: ' + tools, tools === 'pen,fountain,pencil,marker,hl');
    check('fountain pen records stylus pressure', await js(`const ps = ${PG}.page.topics[0].ink[1].pts.map(q => q[2]); return Math.max(...ps) - Math.min(...ps) > 0.3`));
    await shot('12-notes-annotated');
    await clickText('#ribbon .rb', 'Undo'); await clickText('#ribbon .rb', 'Undo'); await clickText('#ribbon .rb', 'Redo');
    check('undo / redo', await js(`return ${PG}.page.topics[0].ink.length === 4`));
    await js(`document.querySelector('[data-tab="home"]').click();`);
    check('leaving the Draw tab returns to typing', await js(`return ${PG}.getMode() === 'text' && !document.querySelector('.pg-paper').classList.contains('inking')`));
    await js(`const t = document.querySelectorAll('.pg-topic')[1].querySelector('.pg-text'); const b = t.getBoundingClientRect();
      t.dispatchEvent(new PointerEvent('pointerdown', { clientX: b.left + 40, clientY: b.top + 40, pointerId: 11, bubbles: true, button: 0, pointerType: 'pen', pressure: 0.6 }));
      const svg = document.querySelectorAll('.pg-topic')[1].querySelector('svg');
      for (let i = 1; i < 12; i++) svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.left + 40 + i * 8, clientY: b.top + 40, pointerId: 11, bubbles: true, pointerType: 'pen', pressure: 0.6 }));
      svg.dispatchEvent(new PointerEvent('pointerup', { clientX: b.left + 130, clientY: b.top + 40, pointerId: 11, bubbles: true, pointerType: 'pen' }));`);
    check('a stylus touching the page starts drawing and opens the Draw tab', await js(`return ${PG}.getMode() !== 'text' && ${PG}.page.topics[1].ink.length === 1 && document.querySelector('.rb-tab.on').dataset.tab === 'draw'`));
    await js(`await ${PG}.flush();`);
    const nbId = await js(`return ${PG}.nb.id`), pageId = await js(`return ${PG}.page.id`);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'notebooks', nbId, 'pages', pageId + '.json'), 'utf8'));
    check('page saved to disk with ink + comment', saved.topics[0].ink.length === 4 && saved.topics[0].html.includes('data-note'));
    const pdf = await win.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(path.join(out, 'notes.pdf'), pdf);
    check('PDF export renders', pdf.length > 5000);

    /* ---- sections and pages ---- */
    await clickText('.nav-add', 'Add section'); await sleep(200);
    await js(`document.querySelector('.modal input').value = 'Unit 2'; document.querySelector('.modal .btn.primary').click();`); await sleep(700);
    check('new section gets a first page and is selected', await js(`return document.querySelectorAll('.sec-item').length === 2 && document.querySelector('.sec-item.on').textContent.includes('Unit 2') && !!document.querySelector('.pg-start')`));

    /* ---- study tools ---- */
    await js(`document.querySelector('[data-tab="study"]').click();`); await clickText('.rb.big', 'Study guide'); await sleep(300);
    check('study guide dialog offers class / section / page scope', await js(`return document.querySelectorAll('.modal [data-f="scope"] option').length >= 3 && !!document.querySelector('.modal [data-f="focus"]')`));
    await shot('13-study-guide-dialog');
    await js(`document.querySelector('.modal [data-f="focus"]').value = 'Midterm on forces'; document.querySelector('.modal .btn.primary').click();`); await sleep(1500);
    check('study guide saved as a page under "Study guides"', await js(`return ${PG}.page.kind === 'guide' && document.querySelector('.sec-item.on').textContent.includes('Study guides') && document.querySelectorAll('.pg-text details.qa').length === 2`));
    check('study guide shows the AI notice', await js(`const c = document.querySelector('.pg-credit'); return !!c && c.textContent.includes('This study guide was written with') && c.textContent.includes('can be wrong')`));
    await js(`document.querySelector('details.qa summary').click();`);
    await shot('14-study-guide');
    await js(`document.querySelector('[data-tab="study"]').click();`); await clickText('.rb.big', 'Flashcards'); await sleep(300);
    check('Flashcards menu offers generate, type your own, and Quizlet import', await js(`const t = document.querySelector('.menu').textContent; return t.includes('Generate from your notes') && t.includes('Type your own') && t.includes('Import from Quizlet')`));
    await clickText('.menu-item', 'Type your own'); await sleep(500);
    await js(`document.querySelector('#title').value = 'My own cards'; document.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));
      const f = document.querySelectorAll('[data-field]'); f[0].value = 'Force'; f[0].dispatchEvent(new Event('input', { bubbles: true })); f[1].value = 'A push or pull'; f[1].dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="save"]').click();`); await sleep(500);
    check('hand-typed set is saved under the class notebook', await js(`const m = await import('./js/store.js'); const s = m.setsForNotebook('${nbId}'); return s.length === 1 && s[0].title === 'My own cards' && document.querySelector('.crumb').textContent.includes('Physics 101')`));
    await clickText('.btn', 'Export to Quizlet'); await sleep(300);
    check('Export to Quizlet dialog opens with the cards', await js(`const m = await import('./js/views/set.js'); const q = m.quizletText([{ term: 'Force', def: 'A push or pull' }]); const text = typeof q === 'string' ? q : (q.text || JSON.stringify(q));
      return document.querySelector('.modal h2').textContent === 'Export to Quizlet' && text.includes('Force') && text.includes('A push or pull')`));
    await js(`document.querySelector('.modal [data-close]').click(); location.hash = '#/new/nb/${nbId}/quizlet';`); await sleep(600);
    check('Import from Quizlet opens ready for a link, and recognises set links', await js(`const m = await import('./js/views/editor.js'); return document.querySelector('.modal h2').textContent === 'Import from Quizlet' && document.querySelector('#notebook').value === '${nbId}' && m.quizletSetId('https://quizlet.com/123456789/bio-flash-cards/') === '123456789'`));
    await shot('15b-quizlet-import');
    await js(`document.querySelector('.modal [data-close]').click(); location.hash = '#/nb/${nbId}/p/${pageId}';`); await sleep(700);
    await js(`document.querySelector('[data-tab="study"]').click();`); await clickText('.rb.big', 'Flashcards'); await sleep(200); await clickText('.menu-item', 'Generate from your notes'); await sleep(300);
    await js(`document.querySelector('.modal [data-f="scope"]').value = 'all'; document.querySelector('.modal .btn.primary').click();`); await sleep(1500);
    check('flashcards made from the class notes and opened', await js(`const m = await import('./js/store.js'); const s = m.setsForNotebook('${nbId}'); return s.length === 2 && s[1].cards.length === 5 && location.hash === '#/set/' + s[1].id && document.querySelectorAll('.term-row').length === 5`));
    check('generated flashcard set shows the AI notice; typed set does not', await js(`const m = await import('./js/store.js'); const c = document.querySelector('.set-credit'); return !!c && c.textContent.includes('Cards in this set were generated with') && m.setsForNotebook('${nbId}')[0].ai.length === 0`));
    await js(`location.hash = location.hash + '/flashcards';`); await sleep(500);
    check('study modes repeat the notice for AI sets', await js(`return !!document.querySelector('.mode-credit') && document.querySelector('.mode-credit').textContent.includes('can be wrong')`));
    await js(`history.back();`); await sleep(500);
    await shot('15-flashcards');
    await js(`location.hash = '#/nb/${nbId}/study';`); await sleep(500);
    check('Study tools page lists the set and the guide', await js(`return document.querySelectorAll('.set-card').length === 2 && document.querySelectorAll('.tool-card').length === 3 && [...document.querySelectorAll('.folder-card')].some(c => c.textContent.includes('Study guide'))`));
    await shot('16-study-tools');
    await clickText('.tool-card .btn', 'Take a test'); await sleep(600);
    check('practice test asks which set when a class has several', await js(`return document.querySelectorAll('.modal .pick-item').length === 2`));
    await js(`document.querySelector('.modal .pick-item').click();`); await sleep(600);
    check('practice test opens on the chosen set', await js(`return /\\/test$/.test(location.hash) && document.querySelector('#main').textContent.includes('Test')`));
    await js(`location.hash = '#/library';`); await sleep(500);
    check('library groups sets by notebook, incl. the migrated one', await js(`return document.querySelectorAll('.set-card').length === 4 && document.querySelector('#main').textContent.includes('Chem 110') && !!document.querySelector('a[href="#/import"]')`));

    /* ---- reopen, dark theme ---- */
    await js(`location.hash = '#/nb/${nbId}/p/${pageId}';`); await sleep(800);
    check('reopening restores notes, ink and comment', await js(`return document.querySelectorAll('.pg-topic > svg.pg-ink path').length === 5 && document.querySelectorAll('.pg-cmt').length === 1 && document.querySelectorAll('.pg-pic').length === 2 && document.querySelectorAll('.pg-pic svg.pic-ink path').length === 1 && document.querySelector('.pg-pic.diagram .dg-label').textContent === 'Mass (kg)'`));
    await js(`document.querySelector('#appbar .bar-btn:last-child').click();`);
    await shot('17-dark-theme');
    await js(`document.querySelector('#appbar .bar-btn:last-child').click(); location.hash = '#/nb/oldnb1';`); await sleep(800);
    check('migrated notebook opens with its notes', await js(`return document.querySelector('.pg-topic h2').textContent === 'Atoms' && document.querySelectorAll('.pg-topic svg path').length === 1`));
    /* ---- the tour plays on every launch until turned off ---- */
    check('tour-at-startup is on after finishing the tour', await js(`const m = await import('./js/store.js'); return m.db().settings.tourOnStartup === true`));
    await js(`const nbs = await import('./js/notes/nbstore.js'); const s = await import('./js/notes/sample.js'); const nb = nbs.list().find(n => n.sample); await nbs.removePage(nb, s.welcomePage(nb, 'sample').id);`);
    win.webContents.reload(); await sleep(2500);
    check('tour plays again on the next launch', await js(`return !!document.querySelector('.tour-layer') && document.querySelector('.tour-tip h3').textContent.includes('Welcome') && document.querySelector('.tour-startup input').checked`));
    check('a deleted sample page is put back for the tour', await js(`const nbs = await import('./js/notes/nbstore.js'); const s = await import('./js/notes/sample.js'); return !!s.welcomePage(nbs.list().find(n => n.sample), 'sample')`));
    await shot('18-tour-relaunch');
    await js(`document.querySelector('.tour-jump [data-part="1"]').click();`); await sleep(500);
    check('the first screen can jump straight to the flashcards part', (await tip()).includes('The Study tab'));
    await js(`[...document.querySelectorAll('.tour-tip button')].find(b => b.textContent.includes('Skip the tour')).click();`); await sleep(400);
    win.webContents.reload(); await sleep(2500);
    await js(`const c = document.querySelector('.tour-startup input'); c.checked = false; c.dispatchEvent(new Event('change')); [...document.querySelectorAll('.tour-tip button')].find(b => b.textContent.includes('Skip')).click();`);
    await sleep(600); win.webContents.reload(); await sleep(2500);
    check('unticking "Show this tour every time" stops it at launch', await js(`return !document.querySelector('.tour-layer')`));
    await js(`document.querySelector('[data-tab="help"]').click(); document.querySelector('[data-startup-toggle]').click();`); await sleep(300);
    win.webContents.reload(); await sleep(2500);
    check('Help → Tour at startup turns it back on', await js(`return !!document.querySelector('.tour-layer')`));
    check('no console errors', errors.length === 0);
    if (errors.length) console.log(errors.join('\n'));
  } catch (e) { console.log('FAIL  exception:', e.stack); process.exitCode = 1; }
  console.log('screenshots in', out);
  app.exit(process.exitCode || 0);
}
