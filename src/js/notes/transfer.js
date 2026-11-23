// "Export everything" / "Import": one file holding every notebook (pages, photos,
// pictures, ink) and every flashcard set. Used for backups on tablets, where there
// is no folder to copy, and to move work between devices (PC, Mac, iPad, Android).
import * as store from '../store.js';
import * as nbstore from './nbstore.js';
import { busy, toast, plural } from '../ui.js';

const api = nbstore.api;
const KIND = 'studyhall-export';

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Saves (or shares, on tablets) a file. Falls back to a browser download. */
export async function saveFile(name, mime, text) {
  if (window.studyhall?.saveFile) return window.studyhall.saveFile(name, mime, text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/** Every notebook (with its photos, documents and recordings) and every flashcard set, as one JSON text. */
export async function packEverything(progress = busy) {
  const notebooks = [];
  const list = nbstore.list();
  for (const [n, nb] of list.entries()) {
    progress?.(`Packing notebook ${n + 1} of ${list.length}: ${nb.name}…`);
    const pages = [];
    const images = {};
    for (const sec of nb.sections) {
      for (const meta of sec.pages) {
        const page = await nbstore.loadPage(nb.id, meta.id);
        if (!page) continue;
        pages.push(page);
        const files = [...(page.images || []), ...(page.docs || []), ...(page.audio || []), ...(page.topics || []).flatMap(t => t.pics || [])].map(x => x.file).filter(Boolean);
        for (const f of files) {
          if (images[f]) continue;
          try { images[f] = toB64(new Uint8Array(await api.readImage(nb.id, f))); } catch { /* missing file: skip */ }
        }
      }
    }
    notebooks.push({ notebook: nb, pages, images });
  }
  return { text: JSON.stringify({ kind: KIND, version: 1, exported: new Date().toISOString(), flashcards: store.exportJSON(), notebooks }), notebooks: notebooks.length };
}

export async function exportEverything() {
  try {
    const { text, notebooks } = await packEverything();
    busy('Saving the file…');
    busy(null);
    const ok = await saveFile(`studyhall-everything-${new Date().toLocaleDateString('en-CA')}.json`, 'application/json', text);
    if (ok) { store.setBackup({ lastAt: Date.now() }); toast(`Exported ${plural(notebooks, 'notebook')} and ${plural(store.db().sets.length, 'flashcard set')}`); }
    return ok;
  } catch (e) { busy(null); toast(`Export failed: ${e.message}`); return false; }
}

/** Adds notebooks and sets from an export file. Ones already on this device (same id) are left as they are. */
export async function importEverything(file) {
  try {
    busy('Reading the file…');
    const data = JSON.parse(await file.text());
    if (data?.kind !== KIND) {
      if (Array.isArray(data?.sets)) { const n = store.mergeJSON(JSON.stringify(data)); busy(null); toast(`Added ${plural(n, 'flashcard set')}`); return; }
      throw new Error('This isn\'t a Study Hall export file.');
    }
    let added = 0, skipped = 0;
    for (const entry of data.notebooks || []) {
      const nb = entry.notebook;
      if (!nb?.id || !Array.isArray(nb.sections)) continue;
      if (nbstore.get(nb.id)) { skipped++; continue; }
      busy(`Adding notebook: ${nb.name}…`);
      for (const [name, b64] of Object.entries(entry.images || {})) await api.putImage(nb.id, name, fromB64(b64));
      for (const page of entry.pages || []) await api.savePage(nb.id, page);
      await api.saveNotebook(nb);
      added++;
    }
    const sets = data.flashcards ? store.mergeJSON(data.flashcards) : 0;
    await nbstore.load();
    busy(null);
    toast(`Added ${plural(added, 'notebook')} and ${plural(sets, 'flashcard set')}${skipped ? `. ${plural(skipped, 'notebook')} already here were left unchanged` : ''}.`);
    location.hash = '#/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (e) { busy(null); toast(`Import failed: ${e.message}`); }
}
