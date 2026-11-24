// The tablet / browser version of the desktop app's back end (main.js + notes/main.js
// + preload.js). It defines the same window.studyhall API, so the interface code is
// shared unchanged. Used by:
//   - the iPad / browser web app (served from GitHub Pages, installable to the Home Screen)
//   - the Android app (the same files inside a Capacitor shell, see android/)
// Data lives in the device's IndexedDB. AI requests go straight from the device to
// the provider (natively on Android, so a computer running Ollama can be used too).
import './env.js';
import aiModule from '../notes/ai.js';
import { createUsage } from '../notes/usage-core.js';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as db from './idb.js';
import { startUpdates, updateApi } from './update.js';

const ai = aiModule.configure ? aiModule : aiModule.default;
const native = Capacitor.isNativePlatform();
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MAX_EDGE = 2000;
const PROVIDERS = ['gemini', 'ollama', 'claude'];
const DEFAULTS = {
  provider: 'gemini', detail: 'detailed', autoDraw: true,
  gemini: { model: 'gemini-3.5-flash' },
  ollama: { url: 'http://192.168.1.10:11434', model: 'qwen3-vl:8b' },
  claude: { model: 'claude-sonnet-5-5' },
};
const ID = /^\w{1,40}$/;
const FILE = /^\w{1,40}\.(jpg|png|pdf|docx|pptx|txt|md|csv|wav|mp3|m4a|mp4|aac|ogg|oga|webm|flac)$/;
const SOURCE_EXT = /^(pdf|docx|pptx|txt|md|csv|wav|mp3|m4a|mp4|aac|ogg|oga|webm|flac)$/;
const check = (re, v, what) => { if (!re.test(String(v))) throw new Error(`Invalid ${what}`); return v; };

/* ---------- platform ---------- */
const platform = {
  kind: native ? Capacitor.getPlatform() : 'web', // 'android' | 'ios' | 'web'
  os: native ? Capacitor.getPlatform() : isIOS ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : 'other',
  qr: false,                 // no phone-camera QR server; tablets use their own camera
  camera: true,
  ollama: native,            // a browser page served over https can't reach Ollama on the local network
  quizlet: false,            // Quizlet link import needs the desktop app
  installed: native || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  vendor: 'vendor/',         // document readers (pdf.js, mammoth, JSZip) copied in by build-web.mjs
  mock: !!globalThis.STUDYHALL_ENV?.STUDYHALL_MOCK, // automated checks: stand-in AI and sharing
};

/* ---------- helpers ---------- */
function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

// The Android app sends AI requests natively: no browser CORS limits, and plain-http
// addresses (a computer running Ollama) are allowed.
async function nativeFetch(url, init = {}) {
  const r = await CapacitorHttp.request({
    url, method: init.method || 'GET', headers: init.headers || {},
    data: init.body ? JSON.parse(init.body) : undefined, connectTimeout: 30000, readTimeout: 300000,
  });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) };
}

const usageListeners = new Set();
const usage = createUsage({
  read: () => JSON.parse(localStorage.getItem('studyhall-usage') || '{}'),
  write: (state) => localStorage.setItem('studyhall-usage', JSON.stringify(state)),
  changed: () => usageListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } }),
});
ai.configure({ usage, ...(native ? { fetch: nativeFetch } : {}) });

/* ---------- AI settings ---------- */
async function loadSettings() {
  const raw = (await db.get('settings')) || {};
  const s = { provider: PROVIDERS.includes(raw.provider) ? raw.provider : DEFAULTS.provider, detail: raw.detail || DEFAULTS.detail, autoDraw: raw.autoDraw !== false, webSearch: raw.webSearch === true, speed: raw.speed === 'thorough' ? 'thorough' : 'fast' };
  for (const p of PROVIDERS) s[p] = { ...DEFAULTS[p], ...(raw[p] || {}) };
  usage.setUserLimits({ gemini: +s.gemini.dailyLimit || 0, claude: +s.claude.dailyLimit || 0 });
  return s;
}
function ctxFor(s, provider, form = {}) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown AI provider');
  if (provider === 'ollama' && !platform.ollama) throw new Error('Ollama can\'t be used from the iPad or browser version. Use Google Gemini or Claude here, or Ollama from the desktop or Android app.');
  const ctx = { provider, detail: s.detail, speed: s.speed, model: String(form.model || s[provider].model || '').trim() };
  if (provider === 'ollama') {
    ctx.url = String(form.url || s.ollama.url).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(ctx.url)) throw new Error('The Ollama address should look like http://192.168.1.10:11434');
  } else {
    ctx.apiKey = String(form.key || '').trim() || s[provider].key || '';
    if (!ctx.apiKey && !globalThis.STUDYHALL_ENV.STUDYHALL_MOCK) throw new Error('NO_KEY');
  }
  return ctx;
}
const activeCtx = async () => { const s = await loadSettings(); return ctxFor(s, s.provider); };
async function geminiCtx() {
  const s = await loadSettings();
  try { return ctxFor(s, 'gemini'); } catch (e) { if (String(e.message).includes('NO_KEY')) throw new Error('NO_GEMINI'); throw e; }
}
const signed = async (fn) => { const ctx = await activeCtx(); return { ...(await fn(ctx)), by: { provider: ctx.provider, model: ctx.model } }; };

/* ---------- images ---------- */
async function storeImage(nbId, bytes, name) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const isJpeg = u8[0] === 0xff && u8[1] === 0xd8;
  const isPng = u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
  if (!isJpeg && !isPng) throw new Error('Only JPEG and PNG images can be added');
  let out = u8;
  const bmp = await createImageBitmap(new Blob([u8], { type: isJpeg ? 'image/jpeg' : 'image/png' })).catch(() => null);
  if (!bmp) throw new Error('Could not read that image');
  if (!isJpeg || Math.max(bmp.width, bmp.height) > MAX_EDGE * 1.2) {
    const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    out = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer());
  }
  bmp.close?.();
  const file = `${newId()}${newId().slice(0, 4)}.jpg`;
  await db.set(`img/${check(ID, nbId, 'notebook')}/${file}`, out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  return { id: file.slice(0, -4), file, name: String(name || 'Photo').slice(0, 200), processed: false, ink: [] };
}
async function readImage(nbId, file) {
  const buf = await db.get(`img/${check(ID, nbId, 'notebook')}/${check(FILE, file, 'image name')}`);
  if (!buf) throw new Error('Image missing');
  return new Uint8Array(buf);
}
const readB64 = async (nbId, files) => Promise.all(files.map(async (f) => ({ mediaType: 'image/jpeg', data: toBase64(await readImage(nbId, f)) })));

/* ---------- saving files (backups, exports) ---------- */
async function saveFile(name, mime, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (native) {
    const res = await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
    await Share.share({ title: name, files: [res.uri], dialogTitle: `Save ${name}` });
    return true;
  }
  const file = new File([bytes], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

// Android: the Print plugin in android/ opens the system print screen, which has "Save as PDF".
const AndroidPrint = registerPlugin('StudyHallPrint');
async function printPage(name) {
  if (platform.kind === 'android') { await AndroidPrint.print({ name: String(name || 'Study Hall') }); return null; }
  const before = document.title;
  document.title = String(name || before);
  window.print();
  setTimeout(() => { document.title = before; }, 1000);
  return null;
}

/* ---------- the API ---------- */
const pageKey = (nbId, pageId) => `page/${check(ID, nbId, 'notebook')}/${check(ID, pageId, 'page')}`;
window.studyhall = {
  platform,
  load: () => db.get('data'),
  save: (json) => db.set('data', json),
  saveSync: (json) => { db.set('data', json).catch(() => {}); },
  dataPath: async () => null,
  saveFile,
  update: updateApi,
  version: async () => __APP_VERSION__, // eslint-disable-line no-undef
  notes: {
    getSettings: async () => {
      const s = await loadSettings();
      const mock = !!globalThis.STUDYHALL_ENV.STUDYHALL_MOCK;
      const out = {
        provider: s.provider, detail: s.detail, autoDraw: s.autoDraw, webSearch: s.webSearch, speed: s.speed,
        gemini: { model: s.gemini.model, hasKey: mock || !!s.gemini.key, dailyLimit: +s.gemini.dailyLimit || 0 },
        claude: { model: s.claude.model, hasKey: mock || !!s.claude.key, dailyLimit: +s.claude.dailyLimit || 0 },
        ollama: { model: s.ollama.model, url: s.ollama.url },
      };
      out.ready = s.provider === 'ollama' ? platform.ollama : out[s.provider].hasKey;
      return out;
    },
    setSettings: async (patch = {}) => {
      const s = await loadSettings();
      const next = { provider: PROVIDERS.includes(patch.provider) ? patch.provider : s.provider, detail: ['concise', 'detailed', 'exhaustive'].includes(patch.detail) ? patch.detail : s.detail, autoDraw: typeof patch.autoDraw === 'boolean' ? patch.autoDraw : s.autoDraw, webSearch: typeof patch.webSearch === 'boolean' ? patch.webSearch : s.webSearch, speed: patch.speed === 'thorough' || patch.speed === 'fast' ? patch.speed : s.speed };
      for (const p of PROVIDERS) {
        next[p] = { ...s[p] };
        const f = patch[p] || {};
        if (typeof f.model === 'string' && f.model.trim()) next[p].model = f.model.trim().slice(0, 100);
        if (p === 'ollama' && typeof f.url === 'string' && f.url.trim()) next[p].url = f.url.trim().replace(/\/+$/, '').slice(0, 200);
        if (p !== 'ollama' && f.dailyLimit !== undefined) next[p].dailyLimit = Math.max(0, Math.min(100000, Math.round(+f.dailyLimit || 0)));
        if (p !== 'ollama' && typeof f.key === 'string') {
          if (f.key.trim()) next[p].key = f.key.trim();
          else if (f.clear) delete next[p].key;
        }
      }
      await db.set('settings', next);
      await loadSettings();
      usage.setUserLimits({ gemini: +next.gemini.dailyLimit || 0, claude: +next.claude.dailyLimit || 0 });
    },
    models: async ({ provider, form }) => ai.listModels(ctxFor(await loadSettings(), provider, form)),
    testAi: async ({ provider, form }) => ai.test(ctxFor(await loadSettings(), provider, form)),
    usage: async () => usage.status((await loadSettings()).provider),
    onUsage: (fn) => { usageListeners.add(fn); },

    list: async () => {
      const list = (await db.values('nb/')).filter((nb) => nb && ID.test(nb.id));
      return list.sort((a, b) => (a.created || 0) - (b.created || 0));
    },
    saveNotebook: async (nb) => {
      if (!nb || typeof nb !== 'object' || !Array.isArray(nb.sections)) throw new Error('Invalid notebook');
      await db.set(`nb/${check(ID, nb.id, 'notebook')}`, JSON.parse(JSON.stringify(nb)));
    },
    removeNotebook: async (id) => {
      await db.delPrefix(`page/${check(ID, id, 'notebook')}/`);
      await db.delPrefix(`img/${id}/`);
      await db.del(`nb/${id}`);
    },
    loadPage: async (nbId, pageId) => (await db.get(pageKey(nbId, pageId))) || null,
    savePage: async (nbId, page) => {
      if (!page || typeof page !== 'object') throw new Error('Invalid page');
      page.updated = Date.now();
      await db.set(pageKey(nbId, page.id), JSON.parse(JSON.stringify(page)));
    },
    savePageSync: (nbId, json) => { try { const page = JSON.parse(json); db.set(pageKey(nbId, page.id), page).catch(() => {}); } catch { /* closing anyway */ } },
    removePage: async (nbId, pageId) => {
      const page = await db.get(pageKey(nbId, pageId));
      const files = [...(page?.images || []), ...(page?.topics || []).flatMap((t) => t.pics || [])].map((x) => x.file).filter(Boolean);
      for (const f of files) await db.del(`img/${nbId}/${f}`).catch(() => {});
      await db.del(pageKey(nbId, pageId));
    },
    addImage: (nbId, name, bytes) => storeImage(nbId, bytes, name),
    putImage: async (nbId, file, bytes) => { const u8 = new Uint8Array(bytes); await db.set(`img/${check(ID, nbId, 'notebook')}/${check(FILE, file, 'image name')}`, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); },
    readImage,
    addFile: async (nbId, name, ext, bytes) => {
      ext = String(ext || '').toLowerCase();
      if (!SOURCE_EXT.test(ext)) throw new Error('This kind of file can\'t be added');
      const u8 = new Uint8Array(bytes);
      if (u8.length > 200 * 1024 * 1024) throw new Error('That file is too large (over 200 MB)');
      const id = `${newId()}${newId().slice(0, 4)}`;
      const file = `${id}.${ext}`;
      await db.set(`img/${check(ID, nbId, 'notebook')}/${file}`, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      return { id, file, name: String(name || 'File').slice(0, 200), ext, size: u8.length, processed: false };
    },
    removeImage: (nbId, file) => db.del(`img/${check(ID, nbId, 'notebook')}/${check(FILE, file, 'image name')}`),

    generate: async ({ id, files = [], imageBytes = [], docs = [], transcripts = [], notebookName, pageTitle, existingHeadings }) => {
      const images = [...await readB64(id, files), ...imageBytes.map((b) => ({ mediaType: 'image/jpeg', data: toBase64(b) }))];
      const docParts = [];
      for (const d of docs) {
        if (d.file) docParts.push({ name: d.name, pdf: toBase64(await readImage(id, d.file)) });
        else docParts.push({ name: d.name, text: d.text, images: (d.imageBytes || []).map((b) => ({ mediaType: 'image/jpeg', data: toBase64(b) })) });
      }
      return signed((ctx) => ai.generateNotes(ctx, { images, docs: docParts, transcripts, notebookName, pageTitle, existingHeadings }));
    },
    transcribe: async ({ bytes, mediaType, mode, part, of }) => {
      const ctx = await geminiCtx();
      return { ...(await ai.transcribe(ctx, { audio: { mediaType, data: toBase64(bytes) }, mode, part, of })), by: { provider: ctx.provider, model: ctx.model } };
    },
    ask: async (args) => { const verify = (await loadSettings()).webSearch ? 'web' : 'wiki'; return signed((ctx) => ai.ask(ctx, { ...args, verify, image: args.imageBytes ? { mediaType: 'image/png', data: toBase64(args.imageBytes) } : undefined })); },
    findFigures: async ({ id, files }) => ai.findFigures(await activeCtx(), { images: await readB64(id, files) }),
    drawDiagram: ({ bytes, label, context }) => signed((ctx) => ai.drawDiagram(ctx, { image: { mediaType: 'image/jpeg', data: toBase64(bytes) }, label, context })),
    makeCards: (args) => signed((ctx) => ai.generateCards(ctx, args)),
    makeGuide: (args) => signed((ctx) => ai.generateGuide(ctx, args)),

    captureStop: async () => {},
    onCapture: () => () => {},
    exportPdf: printPage,
    path: async () => null,
  },
};

// Offline support for the web app (not needed inside the Android app).
if (!native && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !globalThis.STUDYHALL_ENV.STUDYHALL_MOCK) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (!globalThis.STUDYHALL_ENV.STUDYHALL_MOCK) startUpdates();
// Ask the browser not to clear this app's storage when space runs low.
navigator.storage?.persist?.().catch?.(() => {});
