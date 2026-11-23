// Main-process side of notebooks: storage, AI calls, phone capture, PDF export.
//
// On disk, next to the flashcard data file:
//   notebooks/<notebookId>/notebook.json    name, colour, sections and their page titles
//   notebooks/<notebookId>/pages/<id>.json  one page: title, photos list, topics (text + ink)
//   notebooks/<notebookId>/images/          the photos themselves
const { app, ipcMain, BrowserWindow, dialog, safeStorage, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const ai = require('./ai');
const capture = require('./capture');
const usage = require('./usage');

const MAX_EDGE = 2000;
const PROVIDERS = ['gemini', 'ollama', 'claude'];
const DEFAULTS = {
  provider: 'gemini', detail: 'detailed', autoDraw: true,
  gemini: { model: 'gemini-3.5-flash' },
  ollama: { url: 'http://localhost:11434', model: 'qwen3-vl:8b' },
  claude: { model: 'claude-sonnet-5-5' },
};
const ID = /^\w{1,40}$/;
const FILE = /^\w{1,40}\.(jpg|png)$/;

const root = () => path.join(app.getPath('userData'), 'notebooks');
const settingsFile = () => path.join(app.getPath('userData'), 'notes-settings.json');
const checkId = (id) => { if (!ID.test(String(id))) throw new Error('Invalid id'); return id; };
const dir = (id) => path.join(root(), checkId(id));
const nbFile = (id) => path.join(dir(id), 'notebook.json');
const pageFile = (id, pageId) => path.join(dir(id), 'pages', `${checkId(pageId)}.json`);
const imageFile = (id, file) => { if (!FILE.test(String(file))) throw new Error('Invalid image name'); return path.join(dir(id), 'images', file); };

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file + '.tmp', JSON.stringify(data), 'utf8');
  await fsp.rename(file + '.tmp', file);
}
function writeJsonSync(file, json) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', json, 'utf8');
  fs.renameSync(file + '.tmp', file);
}
const newId = () => crypto.randomBytes(6).toString('hex');

// Notebooks made by StudyDeck 1.3 were a single page. Turn one into the
// notebook > section > page layout, keeping its photos, notes and ink.
async function upgradeOld(nb) {
  const pageId = newId();
  await writeJson(pageFile(nb.id, pageId), {
    id: pageId, title: nb.name, kind: 'notes', created: nb.created || Date.now(), updated: nb.updated || Date.now(),
    images: nb.images || [], topics: (nb.sections || []).map((s) => ({ id: s.id || newId(), heading: s.heading || '', html: s.html || '', ink: s.ink || [] })),
  });
  const out = {
    id: nb.id, name: nb.name, color: '#5a45c2', created: nb.created || Date.now(), updated: Date.now(),
    sections: [{ id: newId(), name: 'Notes', color: '#5a45c2', pages: [{ id: pageId, title: nb.name, kind: 'notes' }] }],
  };
  if (nb.setId) out.legacySetId = nb.setId;
  await writeJson(nbFile(nb.id), out);
  return out;
}

/* ---------- AI settings ---------- */
function encode(key) {
  return safeStorage.isEncryptionAvailable()
    ? { key: safeStorage.encryptString(key).toString('base64'), enc: true }
    : { key: Buffer.from(key, 'utf8').toString('base64'), enc: false };
}
function decode(entry) {
  if (!entry?.key) return '';
  try {
    const buf = Buffer.from(entry.key, 'base64');
    return entry.enc ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch { return ''; }
}
async function loadSettings() {
  const raw = await readJson(settingsFile(), {});
  const s = { provider: PROVIDERS.includes(raw.provider) ? raw.provider : null, detail: raw.detail || DEFAULTS.detail, autoDraw: raw.autoDraw !== false };
  for (const p of PROVIDERS) s[p] = { ...DEFAULTS[p], ...(raw[p] || {}) };
  if (raw.apiKey && !s.claude.key) { // settings saved by StudyDeck 1.3 (Claude only)
    s.claude.key = raw.apiKey; s.claude.enc = !!raw.apiKeyEncrypted;
    if (raw.model) s.claude.model = raw.model;
    if (!s.provider && decode(s.claude)) s.provider = 'claude';
  }
  s.provider ||= DEFAULTS.provider;
  usage.setUserLimits({ gemini: +raw.gemini?.dailyLimit || 0, claude: +raw.claude?.dailyLimit || 0 });
  return s;
}
// Connection details for a provider; form values (not yet saved) win over saved ones.
function ctxFor(s, provider, form = {}) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown AI provider');
  const ctx = { provider, detail: s.detail, model: String(form.model || s[provider].model || '').trim() };
  if (provider === 'ollama') {
    ctx.url = String(form.url || s.ollama.url || DEFAULTS.ollama.url).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(ctx.url)) throw new Error('The Ollama address should look like http://localhost:11434');
  } else {
    ctx.apiKey = String(form.key || '').trim() || decode(s[provider]);
    if (!ctx.apiKey && !process.env.STUDYHALL_MOCK) throw new Error('NO_KEY');
  }
  return ctx;
}
const activeCtx = async () => { const s = await loadSettings(); return ctxFor(s, s.provider); };

/* ---------- images ---------- */
// Normalises any JPEG/PNG to a JPEG no larger than MAX_EDGE and stores it.
async function storeImage(id, buffer, name) {
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isJpeg && !isPng) throw new Error('Only JPEG and PNG images can be added');
  const img = nativeImage.createFromBuffer(buffer);
  if (img.isEmpty()) throw new Error('Could not read that image');
  const { width, height } = img.getSize();
  let out = buffer;
  if (!isJpeg || Math.max(width, height) > MAX_EDGE * 1.2) {
    const k = Math.min(1, MAX_EDGE / Math.max(width, height));
    out = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' }).toJPEG(88);
  }
  const imgId = crypto.randomBytes(8).toString('hex');
  const file = `${imgId}.jpg`;
  await fsp.mkdir(path.join(dir(id), 'images'), { recursive: true });
  await fsp.writeFile(imageFile(id, file), out);
  return { id: imgId, file, name: String(name || 'Photo').slice(0, 200), processed: false, ink: [] };
}

function register(guarded) {
  const on = (channel, fn) => ipcMain.handle(channel, guarded((e, ...args) => fn(...args, e)));

  /* settings */
  on('notes:settings:get', async () => {
    const s = await loadSettings();
    const mock = !!process.env.STUDYHALL_MOCK;
    const out = {
      provider: s.provider, detail: s.detail, autoDraw: s.autoDraw,
      gemini: { model: s.gemini.model, hasKey: mock || !!decode(s.gemini), dailyLimit: +s.gemini.dailyLimit || 0 },
      claude: { model: s.claude.model, hasKey: mock || !!decode(s.claude), dailyLimit: +s.claude.dailyLimit || 0 },
      ollama: { model: s.ollama.model, url: s.ollama.url },
    };
    out.ready = s.provider === 'ollama' || out[s.provider].hasKey;
    return out;
  });
  on('notes:settings:set', async (patch = {}) => {
    const s = await loadSettings();
    const next = { provider: PROVIDERS.includes(patch.provider) ? patch.provider : s.provider, detail: ['concise', 'detailed', 'exhaustive'].includes(patch.detail) ? patch.detail : s.detail, autoDraw: typeof patch.autoDraw === 'boolean' ? patch.autoDraw : s.autoDraw };
    for (const p of PROVIDERS) {
      next[p] = { ...s[p] };
      const f = patch[p] || {};
      if (typeof f.model === 'string' && f.model.trim()) next[p].model = f.model.trim().slice(0, 100);
      if (p === 'ollama' && typeof f.url === 'string' && f.url.trim()) next[p].url = f.url.trim().replace(/\/+$/, '').slice(0, 200);
      if (p !== 'ollama' && f.dailyLimit !== undefined) next[p].dailyLimit = Math.max(0, Math.min(100000, Math.round(+f.dailyLimit || 0)));
      if (p !== 'ollama' && typeof f.key === 'string') {
        if (f.key.trim()) Object.assign(next[p], encode(f.key.trim()));
        else if (f.clear) { delete next[p].key; delete next[p].enc; }
      }
    }
    await writeJson(settingsFile(), next);
    await loadSettings(); // refreshes the usage limits
  });
  on('notes:usage:get', async () => usage.status((await loadSettings()).provider));
  on('notes:ai:models', async ({ provider, form }) => ai.listModels(ctxFor(await loadSettings(), provider, form)));
  on('notes:ai:test', async ({ provider, form }) => ai.test(ctxFor(await loadSettings(), provider, form)));

  /* notebooks */
  on('notes:list', async () => {
    await fsp.mkdir(root(), { recursive: true });
    const out = [];
    for (const d of await fsp.readdir(root())) {
      if (!ID.test(d)) continue;
      let nb = await readJson(path.join(root(), d, 'notebook.json'), null);
      if (!nb || nb.id !== d) continue;
      if (Array.isArray(nb.images) || (nb.sections || []).some((s) => 'html' in s)) nb = await upgradeOld(nb);
      out.push(nb);
    }
    return out.sort((a, b) => (a.created || 0) - (b.created || 0));
  });
  on('notes:nb:save', async (nb) => {
    if (!nb || typeof nb !== 'object' || !Array.isArray(nb.sections)) throw new Error('Invalid notebook');
    await writeJson(nbFile(nb.id), nb);
  });
  on('notes:nb:delete', (id) => fsp.rm(dir(id), { recursive: true, force: true }));

  /* pages */
  on('notes:page:load', (id, pageId) => readJson(pageFile(id, pageId), null));
  on('notes:page:save', async (id, page) => {
    if (!page || typeof page !== 'object') throw new Error('Invalid page');
    page.updated = Date.now();
    await writeJson(pageFile(id, page.id), page);
  });
  // Used while the window is closing so the last stroke or edit is never lost.
  ipcMain.on('notes:page:save-sync', (e, id, json) => {
    try { guarded(() => writeJsonSync(pageFile(id, JSON.parse(json).id), json))(e); } catch { /* closing anyway */ }
    e.returnValue = true;
  });
  on('notes:page:delete', async (id, pageId) => {
    const page = await readJson(pageFile(id, pageId), null);
    const files = [...(page?.images || []), ...(page?.topics || []).flatMap((t) => t.pics || [])].map((x) => x.file).filter(Boolean);
    for (const f of files) { try { await fsp.rm(imageFile(id, f), { force: true }); } catch { /* already gone */ } }
    await fsp.rm(pageFile(id, pageId), { force: true });
  });

  /* images */
  on('notes:image:add', (id, name, bytes) => storeImage(id, Buffer.from(bytes), name));
  on('notes:image:read', (id, file) => fsp.readFile(imageFile(id, file)));
  on('notes:image:remove', (id, file) => fsp.rm(imageFile(id, file), { force: true }));

  /* AI */
  on('notes:ai:notes', async ({ id, files, notebookName, pageTitle, existingHeadings }) => {
    const ctx = await activeCtx();
    const images = [];
    for (const f of files) images.push({ mediaType: 'image/jpeg', data: (await fsp.readFile(imageFile(id, f))).toString('base64') });
    return ai.generateNotes(ctx, { images, notebookName, pageTitle, existingHeadings });
  });
  const readImages = async (id, files) => {
    const images = [];
    for (const f of files) images.push({ mediaType: 'image/jpeg', data: (await fsp.readFile(imageFile(id, f))).toString('base64') });
    return images;
  };
  on('notes:ai:figures', async ({ id, files }) => ai.findFigures(await activeCtx(), { images: await readImages(id, files) }));
  on('notes:ai:diagram', async ({ bytes, label, context }) => ai.drawDiagram(await activeCtx(), { image: { mediaType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') }, label, context }));
  on('notes:ai:cards', async (args) => ai.generateCards(await activeCtx(), args));
  on('notes:ai:guide', async (args) => ai.generateGuide(await activeCtx(), args));

  /* phone camera */
  on('notes:capture:start', async (id, e) => {
    dir(id); // validates the id
    const sender = e.sender;
    let n = 0;
    return capture.start(async (buffer) => {
      const image = await storeImage(id, buffer, `Phone photo ${++n}`);
      if (sender.isDestroyed()) throw new Error('Study Hall was closed');
      sender.send('notes:captured', { id, image });
    });
  });
  on('notes:capture:stop', () => capture.stop());

  on('notes:pdf', async (name, e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const safe = String(name || 'notes').replace(/[^\w\- ]+/g, '').trim() || 'notes';
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${safe}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, await e.sender.printToPDF({ printBackground: true, pageSize: 'Letter' }));
    return filePath;
  });
  on('notes:path', () => root());

  app.on('before-quit', () => { capture.stop(); });
}

module.exports = { register };
