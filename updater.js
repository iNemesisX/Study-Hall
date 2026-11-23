// Updates for the desktop app.
// Every release publishes update.json next to the installers. The app reads it at
// startup and every 6 hours:
//   - Windows: the new installer is downloaded in the background, its SHA-256 is checked
//     against update.json, and it runs silently when the student chooses "Restart now"
//     (or the next time they quit). The installer reopens Study Hall afterwards.
//   - Mac: apps that aren't signed with a paid Apple Developer ID can't replace
//     themselves, so the app says a new version is available and opens the download.
const { app, net, shell, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'https://github.com/iNemesisX/Study-Hall';
const FEED = process.env.STUDYHALL_UPDATE_FEED || `${REPO}/releases/latest/download/update.json`;
const ALLOWED = process.env.STUDYHALL_UPDATE_FEED ? /^https?:\/\// : new RegExp(`^${REPO.replace(/[.]/g, '\\.')}/releases/download/`);
const EVERY = 6 * 36e5;

let state = { status: 'idle', current: app.getVersion() }; // idle | checking | none | downloading | ready | available | error
let installer = null;

const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};
function set(patch) {
  state = { ...state, ...patch };
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', state);
}

async function check(manual = false) {
  if (['checking', 'downloading', 'ready'].includes(state.status)) return state;
  if (!app.isPackaged && !process.env.STUDYHALL_UPDATE_FEED) { set({ status: 'none', note: 'Updates are checked in the installed app.' }); return state; }
  set({ status: 'checking', manual });
  try {
    const res = await net.fetch(FEED, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    if (!newer(info.version, app.getVersion())) { set({ status: 'none', latest: info.version }); return state; }
    const base = { latest: info.version, notes: String(info.notes || '').slice(0, 2000), page: `${REPO}/releases/tag/v${info.version}` };
    if (process.platform === 'win32' && info.windows?.url && /^[0-9a-f]{64}$/.test(info.windows.sha256 || '')) return download(info, base);
    set({ status: 'available', ...base, download: process.platform === 'darwin' && ALLOWED.test(info.mac?.url || '') ? info.mac.url : base.page });
  } catch (e) {
    set({ status: 'error', error: String(e.message || e) });
  }
  return state;
}

async function download(info, base) {
  if (!ALLOWED.test(info.windows.url)) throw new Error('Update address not allowed');
  const file = path.join(app.getPath('temp'), `StudyHall-Update-${info.version}.exe`);
  set({ status: 'downloading', ...base, progress: 0 });
  const res = await net.fetch(info.windows.url);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0, lastSent = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    got += chunk.length;
    if (total && Date.now() - lastSent > 500) { lastSent = Date.now(); set({ progress: got / total }); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  if (hash.digest('hex') !== info.windows.sha256) { fs.rmSync(file, { force: true }); throw new Error('The downloaded update didn\'t match its checksum, so it was discarded.'); }
  installer = file;
  set({ status: 'ready', ...base, progress: 1 });
  return state;
}

// Runs the downloaded installer silently, then the installer starts Study Hall again.
function runInstaller() {
  if (!installer || !fs.existsSync(installer)) return false;
  spawn(installer, ['/S', '/UPDATE'], { detached: true, stdio: 'ignore' }).unref();
  installer = null;
  return true;
}
function install() {
  if (!runInstaller()) return false;
  app.quit();
  return true;
}

function register(guarded, ipcMain) {
  ipcMain.handle('update:state', guarded(() => state));
  ipcMain.handle('update:check', guarded(() => check(true)));
  ipcMain.handle('update:install', guarded(() => install()));
  ipcMain.handle('update:open', guarded(() => (state.download || state.page ? shell.openExternal(state.download || state.page) : false)));
  // If an update is ready when the student quits, it's installed then.
  app.on('will-quit', () => { if (state.status === 'ready' && process.platform === 'win32') runInstaller(); });
  app.whenReady().then(() => {
    setTimeout(() => check(), 15000);
    setInterval(() => check(), EVERY);
  });
}

module.exports = { register, check, newer };
