// Notebooks (classes), their sections and pages. The notebook list with section
// and page titles is kept in memory for the navigation pane; a page's content is
// loaded only when it is opened. Storage is in the main process (notes/main.js).
import { uid } from '../ui.js';

export const api = window.studyhall?.notes || null;
export const COLORS = ['#5a45c2', '#0f7b6c', '#c2410c', '#1d6fd8', '#b0409f', '#4d7c0f', '#b45309', '#be123c'];
let items = [];
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

export const list = () => items;
export const get = id => items.find(n => n.id === id);
export const onChange = fn => listeners.add(fn);

export async function load() {
  if (!api) return;
  try { items = await api.list(); } catch (e) { console.error(e); }
}

async function saveMeta(nb) {
  nb.updated = Date.now();
  await api.saveNotebook(nb);
  emit();
}
export const saveNotebook = saveMeta;

export async function createNotebook(name, extra = {}) {
  const color = COLORS[items.length % COLORS.length];
  const nb = { id: uid(), name, color, created: Date.now(), updated: Date.now(), sections: [], ...extra };
  items.push(nb);
  await saveMeta(nb);
  return nb;
}
export async function removeNotebook(id) {
  await api.removeNotebook(id);
  items = items.filter(n => n.id !== id);
  emit();
}

export async function addSection(nb, name, extra = {}) {
  const sec = { id: uid(), name, color: COLORS[(nb.sections.length + 1) % COLORS.length], pages: [], ...extra };
  nb.sections.push(sec);
  await saveMeta(nb);
  return sec;
}
export async function removeSection(nb, sec) {
  for (const p of sec.pages) await api.removePage(nb.id, p.id);
  nb.sections = nb.sections.filter(s => s !== sec);
  await saveMeta(nb);
}

/** Creates a page in a section. kind: 'notes' (default) or 'guide'. */
export async function addPage(nb, sec, { title = 'Untitled page', kind = 'notes', topics = [], images = [], aiBy } = {}) {
  const page = { id: uid(), title, kind, created: Date.now(), updated: Date.now(), images, topics, ...(aiBy ? { aiBy } : {}) };
  await api.savePage(nb.id, page);
  sec.pages.push({ id: page.id, title, kind });
  await saveMeta(nb);
  return page;
}
export const loadPage = (nbId, pageId) => api.loadPage(nbId, pageId);
export async function savePage(nb, page) {
  await api.savePage(nb.id, page);
  const meta = findPage(nb, page.id)?.meta;
  if (meta && meta.title !== page.title) { meta.title = page.title; await saveMeta(nb); }
}
export const savePageSync = (nbId, page) => api.savePageSync(nbId, JSON.stringify(page));
export async function removePage(nb, pageId) {
  const hit = findPage(nb, pageId);
  if (!hit) return;
  await api.removePage(nb.id, pageId);
  hit.sec.pages = hit.sec.pages.filter(p => p.id !== pageId);
  await saveMeta(nb);
}

export function findPage(nb, pageId) {
  for (const sec of nb?.sections || []) {
    const meta = sec.pages.find(p => p.id === pageId);
    if (meta) return { sec, meta };
  }
  return null;
}
export const pageCount = nb => nb.sections.reduce((n, s) => n + s.pages.filter(p => p.kind !== 'guide').length, 0);
