// Tiny key-value store on IndexedDB: where the tablet / browser version keeps
// flashcards, notebooks, pages and photos.
const DB = 'studyhall', STORE = 'kv';
let opening = null;

function open() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage write was cancelled. The device may be out of space.'));
  });
}
const range = (prefix) => IDBKeyRange.bound(prefix, `${prefix}￿`);

export const get = (key) => run('readonly', (s) => s.get(key));
export const set = (key, value) => run('readwrite', (s) => { s.put(value, key); });
export const del = (key) => run('readwrite', (s) => { s.delete(key); });
export const keys = (prefix) => run('readonly', (s) => s.getAllKeys(range(prefix)));
export const values = (prefix) => run('readonly', (s) => s.getAll(range(prefix)));
export const delPrefix = (prefix) => run('readwrite', (s) => { s.delete(range(prefix)); });
