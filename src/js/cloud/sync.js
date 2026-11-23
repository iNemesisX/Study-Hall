// Keeps shared notebooks in step between this device and the cloud.
// A notebook is shared when it has `nb.cloud = { id, role, owner }`. Everything stays
// on the device too (so it works offline); changes are sent up a moment after they're
// saved, and other people's changes arrive live while the notebook is open.
// Conflicts are settled per page: the most recent save wins.
import * as nbstore from '../notes/nbstore.js';
import { getBackend, configured } from './backend.js';
import { CLOUD } from './config.js';
import { uid, toast } from '../ui.js';

const api = nbstore.api;
const MIME = { jpg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
const mimeOf = f => MIME[String(f).split('.').pop().toLowerCase()] || 'application/octet-stream';

let user = null;
const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
export const currentUser = () => user;
export const isShared = nb => !!nb?.cloud?.id;
export const roleOf = nb => nb?.cloud?.role || null;
export const canEdit = nb => !nb?.cloud || nb.cloud.role === 'owner' || nb.cloud.role === 'editor';
export { configured };

/* ---------- signing in ---------- */
export async function init() {
  if (!configured()) return;
  const b = await getBackend();
  user = await b.user().catch(() => null);
  b.onAuth(u => { const was = user?.email; user = u; if (was !== u?.email) emit(); });
  emit();
  if (user) syncAll().catch(e => console.warn('Sync failed', e));
}
export async function sendCode(email) { await (await getBackend()).sendCode(email.trim().toLowerCase()); }
export async function verifyCode(email, code) { user = await (await getBackend()).verifyCode(email.trim().toLowerCase(), code.trim()); emit(); syncAll().catch(() => {}); return user; }
export async function signOut() { stopAll(); await (await getBackend()).signOut(); user = null; emit(); }

/* ---------- what's sent up ---------- */
const filesOf = page => [...(page.images || []), ...(page.docs || []), ...(page.audio || []), ...(page.topics || []).flatMap(t => t.pics || [])].map(x => x.file).filter(Boolean);
const uploadedKey = nb => `studyhall-up-${nb.cloud.id}`;
const uploaded = nb => { try { return new Set(JSON.parse(localStorage.getItem(uploadedKey(nb)) || '[]')); } catch { return new Set(); } };
const markUploaded = (nb, set) => { try { localStorage.setItem(uploadedKey(nb), JSON.stringify([...set])); } catch { /* full: files are re-checked next time */ } };
const metaOf = nb => ({ sections: nb.sections.map(s => ({ id: s.id, name: s.name, color: s.color, pages: s.pages.map(p => ({ id: p.id, title: p.title, kind: p.kind })) })) });

async function uploadFiles(nb, names) {
  const b = await getBackend();
  const done = uploaded(nb);
  for (const f of names) {
    if (done.has(f)) continue;
    try { await b.upload(nb.cloud.id, f, await api.readImage(nb.id, f), mimeOf(f)); done.add(f); } catch (e) { console.warn('Upload failed', f, e); }
  }
  markUploaded(nb, done);
}

/** Owner: puts a notebook online. Returns the shared notebook. */
export async function share(nb, progress) {
  if (!user) throw new Error('Sign in first');
  if (nb.cloud?.id) return nb;
  const b = await getBackend();
  progress?.('Creating the shared notebook…');
  const row = await b.createNotebook({ name: nb.name, color: nb.color, meta: metaOf(nb) });
  nb.cloud = { id: row.id, role: 'owner', owner: user.email, syncedAt: null };
  await nbstore.saveNotebook(nb);
  const metas = nb.sections.flatMap(s => s.pages);
  for (const [i, meta] of metas.entries()) {
    progress?.(`Uploading page ${i + 1} of ${metas.length}…`);
    const page = await nbstore.loadPage(nb.id, meta.id);
    if (!page) continue;
    await uploadFiles(nb, filesOf(page));
    await b.putPage(nb.cloud.id, page.id, page);
  }
  nb.cloud.syncedAt = new Date().toISOString();
  await nbstore.saveNotebook(nb);
  watch(nb);
  emit();
  return nb;
}

// Page saves are batched: a page is sent 1.2 s after the last change to it.
const pending = new Map();
function queuePage(nb, page) {
  if (!user || !nb.cloud?.id || !canEdit(nb)) return;
  const key = `${nb.id}/${page.id}`;
  clearTimeout(pending.get(key)?.t);
  pending.set(key, { t: setTimeout(() => pushPage(nb, key), 1200), page: structuredClone(page) });
}
async function pushPage(nb, key) {
  const item = pending.get(key);
  pending.delete(key);
  if (!item) return;
  try {
    const b = await getBackend();
    await uploadFiles(nb, filesOf(item.page));
    const res = await b.putPage(nb.cloud.id, item.page.id, item.page);
    ownWrites.set(`${nb.cloud.id}/${item.page.id}`, res?.version);
    status.lastSent = Date.now(); status.error = null; emit();
  } catch (e) { status.error = String(e.message || e); emit(); }
}
let metaTimer = null;
function queueMeta(nb) {
  if (!user || !nb.cloud?.id || !canEdit(nb)) return;
  clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    try { await (await getBackend()).updateNotebook(nb.cloud.id, { name: nb.name, color: nb.color, meta: metaOf(nb) }); } catch (e) { status.error = String(e.message || e); emit(); }
  }, 800);
}
/** Sends everything waiting now (before closing, or for the automated checks). */
export async function flushPending() {
  for (const [key, item] of [...pending]) { clearTimeout(item.t); const nb = nbstore.get(key.split('/')[0]); if (nb) await pushPage(nb, key); }
}
export const status = { lastSent: 0, error: null };

// nbstore tells us about local changes.
nbstore.hooks.pageSaved = (nb, page) => queuePage(nb, page);
nbstore.hooks.metaSaved = nb => queueMeta(nb);
nbstore.hooks.pageRemoved = async (nb, pageId) => {
  if (user && nb.cloud?.id && canEdit(nb)) { try { await (await getBackend()).deletePage(nb.cloud.id, pageId); } catch (e) { console.warn(e); } }
};

/* ---------- what comes down ---------- */
const ownWrites = new Map(); // our own saves come back through the live feed: skip them
async function savePulled(nb, row) {
  const page = row.data;
  if (!page?.id) return;
  for (const f of filesOf(page)) {
    try { await api.readImage(nb.id, f); } catch {
      try { await api.putImage(nb.id, f, await (await getBackend()).download(nb.cloud.id, f)); } catch (e) { console.warn('Download failed', f, e); }
    }
  }
  await api.savePage(nb.id, page);
  remote.forEach(fn => fn(nb, page, row.updated_by));
}
function applyMeta(nb, row) {
  if (!row?.meta?.sections) return;
  nb.name = row.name || nb.name;
  nb.color = row.color || nb.color;
  nb.sections = row.meta.sections.map(s => ({ ...s, pages: s.pages.map(p => ({ ...p })) }));
}
/** Brings one shared notebook up to date. */
export async function pull(nb) {
  if (!user || !nb.cloud?.id) return;
  const b = await getBackend();
  const row = await b.getNotebook(nb.cloud.id);
  if (!row) return lost(nb);
  const since = nb.cloud.syncedAt;
  const rows = await b.pages(nb.cloud.id, since);
  for (const r of rows) if (!(r.updated_by === user.email && since)) await savePulled(nb, r);
  applyMeta(nb, row);
  nb.cloud.syncedAt = new Date().toISOString();
  await api.saveNotebook(nb);
  await nbstore.load();
}
async function lost(nb) {
  stop(nb);
  nb.cloud = { ...nb.cloud, lost: true };
  await api.saveNotebook(nb);
  toast(`"${nb.name}" is no longer shared with you. Your copy stays on this device.`);
  delete nb.cloud;
  await api.saveNotebook(nb);
  await nbstore.load();
}

/** Called whenever a remote change to a page arrives: (nb, page, byEmail). The open page listens. */
const remote = new Set();
export const onRemotePage = fn => { remote.add(fn); return () => remote.delete(fn); };

// Live updates while signed in.
const watching = new Map();
export async function watch(nb) {
  if (!user || !nb.cloud?.id || watching.has(nb.id)) return;
  const b = await getBackend();
  watching.set(nb.id, b.subscribe(nb.cloud.id, {
    onPage: async row => {
      const key = `${nb.cloud.id}/${row.page_id}`;
      if (ownWrites.has(key) && ownWrites.get(key) === row.version) return;
      if (row.deleted) { await api.removePage(nb.id, row.page_id).catch(() => {}); return; }
      if (row.updated_by === user?.email && !row.data) return;
      await savePulled(nb, row);
      nb.cloud.syncedAt = row.updated_at || nb.cloud.syncedAt;
    },
    onNotebook: async row => { applyMeta(nb, row); await api.saveNotebook(nb); await nbstore.load(); },
    onGone: () => lost(nb),
  }));
}
function stop(nb) { watching.get(nb.id)?.(); watching.delete(nb.id); }
function stopAll() { [...watching.keys()].forEach(id => { watching.get(id)?.(); }); watching.clear(); }

/** After signing in or starting up: refresh every shared notebook and listen for changes. */
export async function syncAll() {
  for (const nb of nbstore.list().filter(n => n.cloud?.id)) {
    try { await pull(nb); watch(nbstore.get(nb.id) || nb); } catch (e) { console.warn('Sync failed for', nb.name, e); }
  }
  emit();
}

/* ---------- people and links ---------- */
export async function listShared() {
  const b = await getBackend();
  const rows = await b.listNotebooks();
  const local = new Set(nbstore.list().map(n => n.cloud?.id).filter(Boolean));
  return rows.map(r => ({ ...r, here: local.has(r.id) }));
}
/** Someone else's notebook: makes a copy on this device that stays in sync. */
export async function addShared(row, progress) {
  const b = await getBackend();
  const full = await b.getNotebook(row.id);
  if (!full) throw new Error('That notebook is no longer shared with you');
  progress?.('Downloading the notebook…');
  const nb = { id: uid(), name: full.name, color: full.color || '#5a45c2', created: Date.now(), updated: Date.now(), sections: [], cloud: { id: full.id, role: row.role, owner: full.owner_email, syncedAt: null } };
  applyMeta(nb, full);
  await api.saveNotebook(nb);
  const rows = await b.pages(full.id);
  for (const [i, r] of rows.entries()) { progress?.(`Downloading page ${i + 1} of ${rows.length}…`); await savePulled(nb, r); }
  nb.cloud.syncedAt = new Date().toISOString();
  await api.saveNotebook(nb);
  await nbstore.load();
  watch(nbstore.get(nb.id));
  emit();
  return nbstore.get(nb.id);
}
export async function members(nb) { return (await getBackend()).members(nb.cloud.id); }
export async function invite(nb, email, role) {
  email = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That doesn\'t look like an email address');
  if (email === user?.email) throw new Error('That\'s you');
  await (await getBackend()).invite(nb.cloud.id, email, role);
}
export async function removeMember(nb, email) { await (await getBackend()).removeMember(nb.cloud.id, email); }
const newToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_'); };
/** Turns the view-only link on or off. Returns the link (or null). */
export async function setLink(nb, on) {
  const b = await getBackend();
  const row = await b.getNotebook(nb.cloud.id);
  const token = row.link_token || newToken();
  await b.setLink(nb.cloud.id, on, row.link_token ? null : token);
  return on ? linkFor(token) : null;
}
export async function linkState(nb) {
  const row = await (await getBackend()).getNotebook(nb.cloud.id);
  return { on: !!row?.link_enabled, url: row?.link_token ? linkFor(row.link_token) : null };
}
export const linkFor = token => `${CLOUD.viewer}#${token}`;
/** Owner: stop sharing (deletes the online copy; everyone else keeps their own copy). Member: leave. */
export async function unshare(nb) {
  const b = await getBackend();
  stop(nb);
  if (nb.cloud.role === 'owner') await b.deleteNotebook(nb.cloud.id);
  else await b.removeMember(nb.cloud.id, user.email);
  try { localStorage.removeItem(uploadedKey(nb)); } catch { /* ignore */ }
  delete nb.cloud;
  await nbstore.saveNotebook(nb);
  emit();
}
