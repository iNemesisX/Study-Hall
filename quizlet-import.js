// Imports a public Quizlet set (terms, definitions and images) from its embed page.
//
// The embed page is loaded in a separate, normal browser window — the same way a
// website shows a Quizlet embed — and the card data is read from the page's
// __NEXT_DATA__ JSON (props.pageProps.dehydratedReduxStateKey → studiableItems).
// The window stays hidden unless loading takes a while; then it is shown so the
// user can see what Quizlet is displaying (for example a verification check,
// which the user completes themselves). The window uses an in-memory session, so
// Quizlet cookies/cache are discarded when the app closes. Images are downloaded and returned as
// data URLs so the set works offline.
const { BrowserWindow, net } = require('electron');

const SET_ID = /^\d{1,15}$/;
const QUIZLET_URL = /^https:\/\/([a-z0-9-]+\.)*quizlet\.com\//i;
const SHOW_AFTER_MS = 5000;
const TIMEOUT_MS = 3 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 200 * 1024 * 1024;
const MAX_IMAGES = 1000;

// Runs inside the Quizlet page. Returns null while the cards aren't there yet,
// { error: 'no-cards' } when the page loaded but has no cards (private/deleted set).
const EXTRACT = `(() => {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return null;
  try {
    const raw = JSON.parse(el.textContent).props?.pageProps?.dehydratedReduxStateKey;
    if (!raw) return { error: 'no-cards' };
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    let items = null, info = null;
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (!items && Array.isArray(o.studiableItems) && o.studiableItems.length) items = o.studiableItems;
      if (!info && typeof o.title === 'string' && 'numTerms' in o) info = { title: o.title, description: o.description || '' };
      for (const k in o) walk(o[k]);
    })(state);
    if (!items) return { error: 'no-cards' };
    const side = (item, label) => {
      const media = ((item.cardSides || []).find(s => s.label === label) || {}).media || [];
      return {
        text: media.filter(m => m.type === 1).map(m => m.plainText || '').join('\\n'),
        image: (media.find(m => m.type === 2 && m.url) || {}).url || null,
      };
    };
    return {
      title: info ? info.title : '',
      description: info ? info.description : '',
      cards: items.filter(i => !i.isDeleted).sort((a, b) => (a.rank || 0) - (b.rank || 0))
        .map(i => ({ term: side(i, 'word'), def: side(i, 'definition') })),
    };
  } catch (e) { return { error: 'no-cards' }; }
})()`;

const str = (v, max) => String(v ?? '').slice(0, max);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchImage(url) {
  if (typeof url !== 'string' || !QUIZLET_URL.test(url)) return null;
  try {
    // No redirects: the host check above must hold for the URL actually fetched.
    const res = await net.fetch(url, { redirect: 'error' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
    if (+res.headers.get('content-length') > MAX_IMAGE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return null;
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function downloadImages(cards) {
  const jobs = [];
  cards.forEach(c => ['termImg', 'defImg'].forEach(k => { if (c[k]) jobs.push([c, k]); }));
  let failed = 0, total = 0;
  for (const [card, key] of jobs.slice(MAX_IMAGES)) { delete card[key]; failed++; }
  const allowed = jobs.slice(0, MAX_IMAGES);
  for (let i = 0; i < allowed.length; i += 6) {
    await Promise.all(allowed.slice(i, i + 6).map(async ([card, key]) => {
      const data = total < MAX_TOTAL_IMAGE_BYTES ? await fetchImage(card[key]) : null;
      if (data) { card[key] = data; total += data.length; } else { delete card[key]; failed++; }
    }));
  }
  return failed;
}

async function importQuizletSet(parent, setId) {
  if (!SET_ID.test(String(setId))) throw new Error("That doesn't look like a Quizlet set link or embed code.");

  const win = new BrowserWindow({
    parent,
    show: false,
    width: 960,
    height: 720,
    title: 'Loading from Quizlet… (close this window to cancel)',
    autoHideMenuBar: true,
    webPreferences: { partition: 'quizlet', spellcheck: false, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const stayOnQuizlet = (e, url) => { if (!QUIZLET_URL.test(url)) e.preventDefault(); };
  win.webContents.on('will-navigate', stayOnQuizlet);
  win.webContents.on('will-redirect', stayOnQuizlet);

  try {
    win.loadURL(`https://quizlet.com/${setId}/flashcards/embed`).catch(() => {});
    const started = Date.now();
    while (!win.isDestroyed()) {
      const data = await win.webContents.executeJavaScript(EXTRACT, true).catch(() => null);
      if (data?.error) throw new Error("Couldn't find any cards. The set may be private or deleted. Only public sets can be imported.");
      if (data?.cards?.length) {
        const cards = data.cards.slice(0, 2000).map(c => ({
          term: str(c.term?.text, 5000), def: str(c.def?.text, 5000),
          termImg: c.term?.image || undefined, defImg: c.def?.image || undefined,
        }));
        if (!win.isDestroyed()) win.destroy();
        const failedImages = await downloadImages(cards);
        return { title: str(data.title, 120), description: str(data.description, 2000), cards, failedImages };
      }
      if (Date.now() - started > TIMEOUT_MS) throw new Error('Quizlet took too long to load. Check your internet connection and try again.');
      if (!win.isVisible() && Date.now() - started > SHOW_AFTER_MS) win.show(); // let the user see what Quizlet is showing
      await sleep(800);
    }
    throw new Error('Import cancelled.');
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { importQuizletSet };
