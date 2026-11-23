// Desktop file access for automatic backups (to iCloud Drive or any folder) and
// exports (Word, PowerPoint, Obsidian vault, Notion, Evernote). The page never gets
// raw file-system access: it can only pick a folder through a system dialog, write
// files inside that folder, and open a small set of web addresses.
const { app, dialog, shell, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');

const BACKUP_RE = /^studyhall-backup-\d{4}-\d{2}-\d{2}\.json$/;
const OPEN_OK = [
  /^https:\/\/(drive|docs)\.google\.com\//, /^https:\/\/(www\.)?notion\.so\//, /^https:\/\/(www\.)?evernote\.com\//,
  /^https:\/\/help\.obsidian\.md\//, /^obsidian:\/\/open\?/, /^https:\/\/github\.com\/iNemesisX\//,
];
// Folders the user has chosen through a system dialog. Remembered across restarts
// (in the app's own data folder) so daily backups keep working; nothing else can be added.
const allowed = new Set();
const picked = new Set();
const pickedFile = () => path.join(app.getPath('userData'), 'picked-folders.json');
function loadPicked() {
  try { for (const f of JSON.parse(fs.readFileSync(pickedFile(), 'utf8'))) if (typeof f === 'string') picked.add(f); } catch { /* none yet */ }
}
function addPicked(f) {
  picked.add(f);
  allowed.add(f);
  try { fs.writeFileSync(pickedFile(), JSON.stringify([...picked].slice(-50))); } catch { /* best effort */ }
}

/** Where iCloud Drive lives on this computer, if it's set up. */
function icloudDrive() {
  const home = os.homedir();
  const candidates = process.platform === 'darwin'
    ? [path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')]
    : process.platform === 'win32' ? [path.join(home, 'iCloudDrive'), path.join(home, 'iCloud Drive')] : [];
  return candidates.find((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }) || null;
}

const inside = (root, rel) => {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Blocked: path outside the chosen folder');
  return target;
};
const check = (folder) => {
  const f = path.resolve(String(folder || ''));
  if (!allowed.has(f)) throw new Error('Choose the folder again');
  return f;
};

function register(guarded, ipcMain) {
  ipcMain.handle('files:icloud', guarded(() => icloudDrive()));
  // Lets the page re-use a folder it saved earlier (the backup folder) after a restart.
  loadPicked();
  // Re-opens a folder the user picked in an earlier session (the backup folder, the Obsidian vault).
  ipcMain.handle('files:remember', guarded((_e, folder) => {
    const f = path.resolve(String(folder || ''));
    if (!picked.has(f) || !fs.existsSync(f)) return false;
    allowed.add(f);
    return true;
  }));
  ipcMain.handle('files:pick-folder', guarded(async (e, { title, suggest } = {}) => {
    let defaultPath = app.getPath('documents');
    if (suggest === 'icloud' && icloudDrive()) {
      defaultPath = path.join(icloudDrive(), 'Study Hall Backups');
      await fsp.mkdir(defaultPath, { recursive: true }).catch(() => {});
    }
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: String(title || 'Choose a folder'), defaultPath, properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const f = path.resolve(res.filePaths[0]);
    addPicked(f);
    return f;
  }));
  // files: [{ path: 'relative/name.md', bytes | text }]
  ipcMain.handle('files:write', guarded(async (_e, folder, files) => {
    const root = check(folder);
    for (const file of files || []) {
      const target = inside(root, String(file.path || ''));
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, file.bytes ? Buffer.from(file.bytes) : String(file.text ?? ''));
    }
    return root;
  }));
  // One dated backup per day, keeping the newest `keep`.
  ipcMain.handle('files:backup', guarded(async (_e, folder, text, keep = 7) => {
    const root = check(folder);
    await fsp.mkdir(root, { recursive: true });
    const name = `studyhall-backup-${new Date().toLocaleDateString('en-CA')}.json`;
    const tmp = path.join(root, `${name}.tmp`);
    await fsp.writeFile(tmp, String(text));
    await fsp.rename(tmp, path.join(root, name));
    const old = (await fsp.readdir(root)).filter((n) => BACKUP_RE.test(n)).sort().reverse().slice(Math.max(1, keep));
    for (const n of old) await fsp.rm(path.join(root, n), { force: true });
    return path.join(root, name);
  }));
  ipcMain.handle('files:save-as', guarded(async (e, name, bytes) => {
    const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: path.join(app.getPath('documents'), path.basename(String(name))) });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, Buffer.from(bytes));
    return res.filePath;
  }));
  ipcMain.handle('files:show', guarded((_e, file) => {
    const f = path.resolve(String(file || ''));
    if (![...allowed].some((root) => f === root || f.startsWith(root + path.sep))) return false;
    shell.showItemInFolder(f);
    return true;
  }));
  ipcMain.handle('files:open-url', guarded((_e, url) => {
    if (!OPEN_OK.some((re) => re.test(String(url)))) throw new Error('Blocked address');
    return shell.openExternal(String(url));
  }));
}

// For the automated checks only: pretend the user picked this folder.
function testPick(folder) { if (process.env.STUDYHALL_MOCK) addPicked(path.resolve(folder)); }

module.exports = { register, icloudDrive, testPick };
