// "A new version is ready" card, and Help → Check for updates. The work is done by
// updater.js (Windows, Mac) and web/update.js (Android, iPad, browser).
import { h, toast } from './ui.js';
import { platform } from './platform.js';

const up = window.studyhall?.update;
let card = null, dismissed = null;

function show(s) {
  if (s.status === 'none' && s.manual) toast(`You have the latest version${s.current ? ` (${s.current})` : ''}`);
  if (s.status === 'error' && s.manual) toast('Couldn\'t check for updates. Check your internet connection.');
  if (s.status === 'downloading' && s.manual) toast('Downloading the update…');
  if (!['ready', 'available'].includes(s.status) || dismissed === `${s.status}${s.latest}`) return;
  card?.remove();
  const ready = s.status === 'ready';
  const restartWord = platform.kind === 'web' ? 'Reload' : 'Restart';
  card = h('div', { class: 'update-card', role: 'status' },
    h('b', { text: ready ? `✨ Study Hall ${s.latest || 'update'} is ready` : `Study Hall ${s.latest} is available` }),
    h('p', { text: ready ? `${restartWord} to start using it. Your work is saved first.` : (s.note || (platform.os === 'mac' ? 'Download it and drag it into Applications to replace this version. Your notes are kept.' : 'Download it to update. Your notes are kept.')) }),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary small', text: ready ? `${restartWord} now` : 'Download', onclick: async () => {
        if (ready) { try { await window.studyhallFlush?.(); } catch { /* best effort */ } up.install(); } else up.open();
        card?.remove(); card = null;
      } }),
      h('button', { class: 'btn ghost small', text: 'Later', onclick: () => { dismissed = `${s.status}${s.latest}`; card?.remove(); card = null; } })));
  document.body.append(card);
}

export function startUpdateUi() {
  if (!up) return;
  up.onStatus(show);
  up.state().then(s => { if (['ready', 'available'].includes(s.status)) show(s); }).catch(() => {});
}
export async function checkForUpdates() {
  if (!up) return toast('Updates aren\'t available in this version');
  const s = await up.check();
  show({ ...s, manual: true });
}
export const versionText = async () => (window.studyhall?.version ? `Version ${await window.studyhall.version()}` : '');
