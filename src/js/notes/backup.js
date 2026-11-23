// Automatic backups.
//  - Desktop (Windows, Mac): once a day, everything is saved as one file into a folder
//    the student picks. Picking the iCloud Drive folder puts the backups in iCloud, where
//    an iPad (Files app) or another computer can import them. The last 7 days are kept.
//  - iPad / Android / browser: apps can't write into iCloud Drive in the background, so
//    "Back up now" opens the share sheet (Save to Files → iCloud Drive), and a reminder
//    appears when the last backup is more than a week old.
import * as store from '../store.js';
import * as nbstore from './nbstore.js';
import { packEverything, exportEverything } from './transfer.js';
import { h, toast, busy } from '../ui.js';
import { isDesktop } from '../platform.js';

const files = window.studyhall?.files;
const DAY = 864e5;
const KEEP = 7;
export const canAuto = () => isDesktop && !!files;
const cfg = () => store.db().settings.backup;

export const describeFolder = (folder, icloud) => (folder && icloud && folder.startsWith(icloud) ? `iCloud Drive › ${folder.slice(icloud.length + 1) || ''}`.replace(/ › $/, '') : folder);

/** Desktop: asks for the backup folder (opening in iCloud Drive when it exists) and makes the first backup. */
export async function chooseFolder(suggest = 'icloud') {
  const folder = await files.pickFolder({ title: 'Choose where Study Hall saves its daily backups', suggest });
  if (!folder) return null;
  store.setBackup({ folder });
  await backupNow();
  return folder;
}

/** Desktop: writes today's backup to the chosen folder. quiet = no progress pop-up. */
export async function backupNow(quiet = false) {
  const { folder } = cfg();
  if (!canAuto() || !folder) return exportEverything();
  try {
    if (!(await files.remember(folder))) throw new Error('The backup folder can\'t be found. Is iCloud Drive (or the drive) connected?');
    const { text } = await packEverything(quiet ? null : busy);
    if (!quiet) busy('Saving the backup…');
    const file = await files.backup(folder, text, KEEP);
    busy(null);
    store.setBackup({ lastAt: Date.now(), lastFile: file });
    if (!quiet) toast('Backed up');
    return true;
  } catch (e) {
    busy(null);
    toast(`Backup failed: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
    return false;
  }
}

/** Runs at startup and then hourly: desktop backs up once a day; tablets get a weekly reminder. */
export function startAutoBackups() {
  const tick = async () => {
    const b = cfg();
    if (canAuto()) {
      if (b.folder && Date.now() - b.lastAt > DAY - 36e5) await backupNow(true);
    } else if (b.remind && nbstore.list().some(nb => nb.sections.some(s => s.pages.length)) && Date.now() - Math.max(b.lastAt, b.snoozeAt) > 7 * DAY) {
      remind();
    }
  };
  setTimeout(tick, 20000); // after the app (and the tour) has settled
  setInterval(tick, 36e5);
}

let card = null;
function remind() {
  if (card || document.querySelector('.tour-tip, .modal-backdrop')) return;
  const close = () => { card?.remove(); card = null; };
  const b = cfg();
  card = h('div', { class: 'backup-card', role: 'status' },
    h('b', { text: '☁ Time for a backup' }),
    h('p', { text: `${b.lastAt ? `Last backup: ${new Date(b.lastAt).toLocaleDateString()}.` : 'Your notes haven\'t been backed up yet.'} Your work is stored only on this device. Save a copy to iCloud Drive (or Google Drive) so it's safe if the device is lost.` }),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary small', text: 'Back up now', onclick: async () => { close(); await exportEverything(); } }),
      h('button', { class: 'btn ghost small', text: 'Later', onclick: () => { store.setBackup({ snoozeAt: Date.now() }); close(); } })));
  document.body.append(card);
}

export function statusText() {
  const b = cfg();
  if (!b.lastAt) return 'No backup yet.';
  const days = Math.floor((Date.now() - b.lastAt) / DAY);
  return `Last backup: ${days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`} (${new Date(b.lastAt).toLocaleString()}).`;
}
