// All app data lives in one object that is saved as JSON.
// In Electron it goes to %APPDATA%/Study Hall/studyhall-data.json (via preload.js); in the
// tablet / browser version it goes to IndexedDB (web/bridge.js); with neither, localStorage.
import { uid } from './ui.js';

const KEY = 'studyhall-data';
const api = window.studyhall;
let data = null;
let timer = null;
let dirty = false;
const listeners = new Set();

export async function load() {
  let raw = null;
  try { raw = api ? await api.load() : localStorage.getItem(KEY); } catch (e) { console.error(e); }
  data = sanitize(raw ? JSON.parse(raw) : sampleData());
  if (!raw) flush();
}

// ---------- Validation ----------
// Everything loaded from disk or a backup file goes through sanitize(), so a
// tampered or malicious file can't inject HTML (IDs/images end up in attributes)
// or break the app with wrong types. Unknown fields are dropped.
const ID = /^\w{1,40}$/;
const IMG = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MODES = ['learn', 'write', 'test', 'flashcards'];
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = v => (Array.isArray(v) ? v : []);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, +v)) : min);
const oneOf = (v, options, fallback) => (options.includes(v) ? v : fallback);

function sanitize(d) {
  if (!isObj(d)) d = {};
  const folders = list(d.folders).filter(f => isObj(f) && ID.test(f.id))
    .map(f => ({ id: f.id, name: text(f.name, 80) || 'Folder', created: num(f.created) }));
  const folderIds = new Set(folders.map(f => f.id));
  const setIds = new Set();
  const sets = list(d.sets).filter(s => isObj(s) && ID.test(s.id) && !setIds.has(s.id) && setIds.add(s.id))
    .map(s => sanitizeSet(s, folderIds));
  return {
    version: 1,
    settings: { theme: oneOf(d.settings?.theme, ['light', 'dark'], 'light'), tourDone: d.settings?.tourDone === true, tourOnStartup: d.settings?.tourOnStartup !== false, backup: sanitizeBackup(d.settings?.backup), obsidianVault: typeof d.settings?.obsidianVault === 'string' && d.settings.obsidianVault.length < 1000 ? d.settings.obsidianVault : null },
    folders,
    sets,
    studyDays: list(d.studyDays).filter(x => typeof x === 'string' && DAY.test(x)).slice(-400),
  };
}

function sanitizeSet(s, folderIds) {
  const cardIds = new Set();
  const cards = list(s.cards).filter(c => isObj(c) && ID.test(c.id) && !cardIds.has(c.id) && cardIds.add(c.id)).map(c => {
    const card = { id: c.id, term: text(c.term, 20000), def: text(c.def, 20000), starred: c.starred === true };
    if (IMG.test(c.termImg)) card.termImg = c.termImg;
    if (IMG.test(c.defImg)) card.defImg = c.defImg;
    return card;
  });
  const progress = {};
  if (isObj(s.progress)) for (const id of Object.keys(s.progress)) {
    const p = s.progress[id];
    if (cardIds.has(id) && isObj(p)) progress[id] = { stage: num(p.stage, 0, 2), seen: num(p.seen), correct: num(p.correct), wrong: num(p.wrong) };
  }
  const sessions = list(s.sessions).filter(x => isObj(x) && MODES.includes(x.mode)).slice(-100).map(x => {
    const out = { date: num(x.date), mode: x.mode };
    for (const k of ['correct', 'total', 'score', 'round']) if (x[k] != null) out[k] = num(x[k], 0, 100000);
    return out;
  });
  const lo = isObj(s.learnOptions) ? s.learnOptions : {};
  const fo = isObj(s.flashOptions) ? s.flashOptions : {};
  const wo = isObj(s.writeOptions) ? s.writeOptions : {};
  const to = isObj(s.testOptions) ? s.testOptions : {};
  const answerWith = v => oneOf(v, ['term', 'definition', 'both'], 'term');
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  const out = {
    id: s.id,
    title: text(s.title, 120) || 'Untitled set',
    description: text(s.description, 5000),
    folderId: folderIds.has(s.folderId) ? s.folderId : null,
    notebookId: typeof s.notebookId === 'string' && ID.test(s.notebookId) ? s.notebookId : null, // the class notebook this set was made from
    ai: Array.isArray(s.ai) ? s.ai.filter(b => isObj(b) && typeof b.provider === 'string').slice(0, 4).map(b => ({ provider: text(b.provider, 20), model: text(b.model || '', 100) })) : [], // models that generated cards in this set
    created: num(s.created),
    updated: num(s.updated),
    cards, progress, sessions,
    learnOptions: {
      answerWith: answerWith(lo.answerWith),
      types: { mc: bool(lo.types?.mc, true), written: bool(lo.types?.written, true) },
      starredOnly: bool(lo.starredOnly, false),
      roundSize: oneOf(+lo.roundSize, [5, 7, 10, 15, 20], 7),
    },
    flashOptions: { shuffle: bool(fo.shuffle, false), starredOnly: bool(fo.starredOnly, false), front: oneOf(fo.front, ['term', 'def'], 'term'), track: bool(fo.track, false) },
    writeOptions: { answerWith: answerWith(wo.answerWith), starredOnly: bool(wo.starredOnly, false) },
    testOptions: {
      count: num(to.count ?? 20, 1, 2000),
      answerWith: answerWith(to.answerWith),
      types: { tf: bool(to.types?.tf, true), mc: bool(to.types?.mc, true), written: bool(to.types?.written, true) },
      starredOnly: bool(to.starredOnly, false),
    },
  };
  if (!out.learnOptions.types.mc && !out.learnOptions.types.written) out.learnOptions.types.written = true;
  if (s.lastStudied) out.lastStudied = num(s.lastStudied);
  return out;
}

export const db = () => data;
export const onChange = fn => listeners.add(fn);

/** Schedules a save. Call after any change to data. */
export function save() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
  listeners.forEach(fn => fn());
}

export function flush() {
  clearTimeout(timer);
  dirty = false;
  const json = JSON.stringify(data);
  if (api) api.save(json);
  else try { localStorage.setItem(KEY, json); } catch (e) { console.warn('Preview storage full', e); }
}

// Tablets suspend or close apps in the background without warning: save straight away.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) flush(); });
window.addEventListener('beforeunload', () => {
  if (!dirty) return;
  const json = JSON.stringify(data);
  if (api) api.saveSync(json); else try { localStorage.setItem(KEY, json); } catch {}
});

// ---------- Settings ----------
export function setTheme(theme) { data.settings.theme = theme; save(); }
export function setTourDone(done = true) { data.settings.tourDone = done; save(); }
/** Whether the guided tour plays each time the app opens (on by default). */
export function setTourOnStartup(on) { data.settings.tourOnStartup = !!on; save(); }
/** Automatic backups: { folder (desktop), lastAt, lastFile, remind (tablets: weekly reminder) } */
export function setObsidianVault(folder) { data.settings.obsidianVault = folder; save(); }
export function setBackup(patch) { data.settings.backup = sanitizeBackup({ ...data.settings.backup, ...patch }); save(); }
function sanitizeBackup(b) {
  b = b && typeof b === 'object' ? b : {};
  return {
    folder: typeof b.folder === 'string' && b.folder.length < 1000 ? b.folder : null,
    lastAt: Number.isFinite(b.lastAt) ? b.lastAt : 0,
    lastFile: typeof b.lastFile === 'string' && b.lastFile.length < 1200 ? b.lastFile : null,
    remind: b.remind !== false,
    snoozeAt: Number.isFinite(b.snoozeAt) ? b.snoozeAt : 0,
  };
}
export const setsForNotebook = id => data.sets.filter(s => s.notebookId === id);

// ---------- Folders ----------
export const getFolder = id => data.folders.find(f => f.id === id);
export const setsInFolder = id => data.sets.filter(s => s.folderId === id);

export function createFolder(name) {
  const f = { id: uid(), name, created: Date.now() };
  data.folders.push(f);
  save();
  return f;
}
export function renameFolder(id, name) { getFolder(id).name = name; save(); }
export function deleteFolder(id) {
  data.folders = data.folders.filter(f => f.id !== id);
  data.sets.forEach(s => { if (s.folderId === id) s.folderId = null; });
  save();
}

// ---------- Sets ----------
export const getSet = id => data.sets.find(s => s.id === id);

export function recentSets(n = 6) {
  return [...data.sets].sort((a, b) => (b.lastStudied || b.updated) - (a.lastStudied || a.updated)).slice(0, n);
}

/** Inserts a new set or replaces an existing one with the edited draft. */
export function saveSet(draft) {
  const now = Date.now();
  const existing = getSet(draft.id);
  if (existing) {
    Object.assign(existing, draft, { updated: now });
    const ids = new Set(existing.cards.map(c => c.id));
    for (const id of Object.keys(existing.progress)) if (!ids.has(id)) delete existing.progress[id];
  } else {
    data.sets.push(sanitizeSet({ ...draft, created: now, updated: now }, new Set(data.folders.map(f => f.id))));
  }
  save();
}

export function deleteSet(id) { data.sets = data.sets.filter(s => s.id !== id); save(); }

// ---------- Progress ----------
// Each card's Learn progress: stage 0 = new/missed, 1 = familiar, 2 = mastered.
export function cardProgress(set, cardId) {
  return (set.progress[cardId] ??= { stage: 0, seen: 0, correct: 0, wrong: 0 });
}

/** 'new' (never answered), 'learning', or 'mastered'. */
export function status(set, card) {
  const p = set.progress[card.id];
  if (!p || !p.seen) return 'new';
  return p.stage >= 2 ? 'mastered' : 'learning';
}

export function setStats(set, cards = set.cards) {
  const out = { new: 0, learning: 0, mastered: 0, total: cards.length };
  cards.forEach(c => out[status(set, c)]++);
  return out;
}

export function resetProgress(set, cards = set.cards) {
  cards.forEach(c => delete set.progress[c.id]);
  save();
}

export function toggleStar(set, card) { card.starred = !card.starred; save(); }

const dayKey = d => d.toLocaleDateString('en-CA'); // YYYY-MM-DD

/** Marks the set as studied now and records today for the streak. */
export function touch(set) {
  set.lastStudied = Date.now();
  const today = dayKey(new Date());
  if (data.studyDays.at(-1) !== today) {
    data.studyDays.push(today);
    if (data.studyDays.length > 400) data.studyDays.shift();
  }
}

export function logSession(set, entry) {
  set.sessions.push({ date: Date.now(), ...entry });
  if (set.sessions.length > 100) set.sessions.shift();
  touch(set);
  save();
}

export function streak() {
  const days = new Set(data.studyDays);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Backup ----------
export const exportJSON = () => JSON.stringify(data, null, 2);

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!isObj(parsed) || !Array.isArray(parsed.sets)) throw new Error('This file is not a Study Hall backup.');
  data = sanitize(parsed);
  flush();
  listeners.forEach(fn => fn());
}

/** Adds the sets and folders from a backup that aren't here yet (matched by id). Returns how many sets were added. */
export function mergeJSON(text) {
  const parsed = JSON.parse(text);
  if (!isObj(parsed) || !Array.isArray(parsed.sets)) throw new Error('This file is not a Study Hall backup.');
  const incoming = sanitize(parsed);
  const folderIds = new Set(data.folders.map(f => f.id));
  for (const f of incoming.folders) if (!folderIds.has(f.id)) data.folders.push(f);
  const setIds = new Set(data.sets.map(s => s.id));
  const added = incoming.sets.filter(s => !setIds.has(s.id));
  data.sets.push(...added);
  flush();
  listeners.forEach(fn => fn());
  return added.length;
}

export const dataPath = () => api?.dataPath() ?? Promise.resolve(null);

// ---------- First run ----------
// Starts empty; the Welcome notebook and its sample set are added by notes/sample.js.
function sampleData() {
  return { version: 1, settings: { theme: 'light', tourDone: false, tourOnStartup: true, backup: sanitizeBackup() }, folders: [], studyDays: [], sets: [] };
}
