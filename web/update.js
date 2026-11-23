// Updates for the tablet and browser versions.
//  - iPad / browser: the web app's service worker fetches each new release from the
//    site; when one is ready, the app offers to reload into it.
//  - Android: the app's screens and logic (everything in dist-web) update live from the
//    release's StudyHall-web.zip through the Capgo updater, checked against the SHA-256
//    in update.json. Only changes to the native shell need a new APK; then the app
//    links to the download instead.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/* global __APP_VERSION__ */
const VERSION = __APP_VERSION__;
const FEED = 'https://github.com/iNemesisX/Study-Hall/releases/latest/download/update.json';
const ALLOWED = /^https:\/\/github\.com\/iNemesisX\/Study-Hall\/releases\/download\//;
const native = Capacitor.isNativePlatform();
const listeners = new Set();
let state = { status: 'idle', current: VERSION };
let bundle = null;
const set = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); };
const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function checkAndroid(manual) {
  set({ status: 'checking', manual });
  try {
    const res = await CapacitorHttp.get({ url: FEED, headers: { 'cache-control': 'no-cache' } });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const info = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (!newer(info.version, VERSION)) return set({ status: 'none', latest: info.version });
    const page = `https://github.com/iNemesisX/Study-Hall/releases/tag/v${info.version}`;
    const builtin = (await CapacitorUpdater.getBuiltinVersion()).version;
    const web = info.web || {};
    if (!ALLOWED.test(web.url || '') || !/^[0-9a-f]{64}$/.test(web.sha256 || '') || newer(web.minNative || '0', builtin)) {
      return set({ status: 'available', latest: info.version, page, download: info.android?.url && ALLOWED.test(info.android.url) ? info.android.url : page, note: 'This update needs the new Android app.' });
    }
    set({ status: 'downloading', latest: info.version, page });
    bundle = await CapacitorUpdater.download({ url: web.url, version: info.version, checksum: web.sha256 });
    await CapacitorUpdater.next({ id: bundle.id }); // used the next time the app starts, if not restarted now
    set({ status: 'ready', latest: info.version, notes: String(info.notes || '').slice(0, 2000) });
  } catch (e) { set({ status: 'error', error: String(e.message || e) }); }
}

let reg = null;
function startWeb() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) set({ status: 'ready', latest: null }); });
  navigator.serviceWorker.ready.then(r => { reg = r; }).catch(() => {});
  const poll = () => reg?.update().catch(() => {});
  setInterval(poll, 36e5);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
}

export function startUpdates() {
  if (native) {
    // Tell the updater this version started fine; otherwise it rolls back to the last good one.
    CapacitorUpdater.notifyAppReady().catch(() => {});
    setTimeout(() => checkAndroid(false), 15000);
    setInterval(() => checkAndroid(false), 6 * 36e5);
  } else startWeb();
}

export const updateApi = {
  state: async () => state,
  check: async () => {
    if (native) await checkAndroid(true);
    else if (reg) { set({ status: 'checking', manual: true }); await reg.update().catch(() => {}); if (state.status === 'checking') set({ status: 'none' }); }
    else set({ status: 'none' });
    return state;
  },
  install: async () => {
    if (native && bundle) { await CapacitorUpdater.set({ id: bundle.id }); return true; }
    location.reload();
    return true;
  },
  open: async () => { if (state.download || state.page) window.open(state.download || state.page, '_blank', 'noopener'); },
  onStatus: fn => { listeners.add(fn); },
};
