// Electron main process: creates the window and reads/writes the data file.
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
app.setName('Study Hall');
const path = require('path');
const fs = require('fs');
const { importQuizletSet } = require('./quizlet-import');

const dataFile = () => path.join(app.getPath('userData'), 'studyhall-data.json');
const APP_PAGE = path.join(__dirname, 'src', 'index.html');

function writeData(json) {
  if (typeof json !== 'string') throw new Error('Invalid data');
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', json, 'utf8');
  fs.renameSync(file + '.tmp', file); // atomic replace so a crash never leaves a half-written file
}

// Only the app's own page (loaded from file://) may use the data/import API.
function fromApp(e) {
  try { return new URL(e.senderFrame.url).protocol === 'file:'; } catch { return false; }
}
function guarded(handler) {
  return (e, ...args) => {
    if (!fromApp(e)) throw new Error('Blocked: request did not come from Study Hall');
    return handler(e, ...args);
  };
}

ipcMain.handle('data:load', guarded(() => {
  const file = dataFile();
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // Keep the unreadable file for recovery instead of overwriting it.
    fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
    return null;
  }
}));
ipcMain.handle('data:save', guarded((_e, json) => writeData(json)));
ipcMain.on('data:save-sync', (e, json) => {
  if (fromApp(e)) writeData(json);
  e.returnValue = true;
});
ipcMain.handle('data:path', guarded(() => dataFile()));
require('./notes/main').register(guarded); // Notebooks: photo-to-notes, phone capture, ink
ipcMain.handle('quizlet:import', guarded((e, setId) => importQuizletSet(BrowserWindow.fromWebContents(e.sender), setId)));

// Study Hall used to be called StudyDeck. On the first launch, bring the old
// app's sets, notebooks and AI settings across so nothing appears to be lost.
function migrateFromStudyDeck() {
  const dir = app.getPath('userData');
  if (fs.existsSync(dataFile()) || fs.existsSync(path.join(dir, 'notebooks'))) return;
  const old = process.env.STUDYHALL_OLD_DIR || path.join(app.getPath('appData'), 'StudyDeck');
  try {
    if (!fs.existsSync(old)) return;
    fs.mkdirSync(dir, { recursive: true });
    const copy = (from, to) => { if (fs.existsSync(path.join(old, from))) fs.cpSync(path.join(old, from), path.join(dir, to), { recursive: true }); };
    copy('studydeck-data.json', 'studyhall-data.json');
    copy('notebooks', 'notebooks');
    copy('notes-settings.json', 'notes-settings.json');
  } catch (e) { console.error('Could not bring StudyDeck data across:', e.message); }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 600,
    title: 'Study Hall',
    icon: path.join(__dirname, 'src', 'icon.png'),
    backgroundColor: '#f3f2f1',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // the Windows spellchecker can download dictionaries; keep the app fully offline
    },
  });
  win.loadFile(APP_PAGE);
  // The window only ever shows the app itself. In-app #hash routes don't trigger
  // will-navigate, so this only blocks real page loads (dropped files, injected links).
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('will-redirect', e => e.preventDefault());
  // Links that would open a new window go to the user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // No spellchecker: on Windows it can download dictionaries from the internet.
  session.defaultSession.setSpellCheckerEnabled(false);
  migrateFromStudyDeck();
  // One rolling backup per launch — only of a file that is valid JSON.
  const file = dataFile();
  try {
    if (fs.existsSync(file)) {
      JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.copyFileSync(file, file.replace(/\.json$/, '.backup.json'));
    }
  } catch { /* leave the previous backup untouched */ }
  // Older versions kept Quizlet cookies/cache on disk; the importer now uses an in-memory session.
  fs.rm(path.join(app.getPath('userData'), 'Partitions', 'quizlet'), { recursive: true, force: true }, () => {});
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
