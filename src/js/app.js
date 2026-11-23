// Entry point: loads data, draws the shell (app bar, ribbon, navigation) and
// routes #/hash URLs to views.
// A view is `(root, ...params) => cleanup | { cleanup, guard } | void`.
// `guard()` returns false to cancel leaving the page (e.g. unsaved edits).
import * as store from './store.js';
import * as nbstore from './notes/nbstore.js';
import { $, h, closeMenu } from './ui.js';
import { onAiChange } from './notes/aiui.js';
import { ensureWelcome } from './notes/sample.js';
import { renderNav, renderAppbar, refreshAi, context, newNotebook, newPage } from './views/nav.js';
import * as ribbon from './views/ribbon.js';
import { pageView } from './views/page.js';
import { studyView } from './views/study.js';
import { libraryView } from './views/home.js';
import { startTour } from './views/help.js';
import { folderView } from './views/folder.js';
import { setView } from './views/set.js';
import { editorView } from './views/editor.js';
import { flashcardsView } from './views/flashcards.js';
import { learnView } from './views/learn.js';
import { writeView } from './views/write.js';
import { testView } from './views/test.js';

const go = hash => { location.replace(hash); };

// "#/" opens the page you were last on, or the first page of the first notebook.
function homeView(root) {
  const { nb } = context('#/');
  if (!nb) {
    root.append(h('div', { class: 'empty' }, h('div', { class: 'big-ico', text: '📓' }), h('h2', { text: 'Create your first notebook' }),
      h('p', { text: 'Make one notebook per class. Add photos of your slides and notes, and Study Hall does the rest.' }),
      h('button', { class: 'btn primary big', text: '＋ New notebook', onclick: newNotebook })));
    return;
  }
  let last = null;
  try { last = JSON.parse(localStorage.getItem('studyhall-last') || '{}'); } catch { /* ignore */ }
  go(last?.nb === nb.id && nbstore.findPage(nb, last.page) ? `#/nb/${nb.id}/p/${last.page}` : `#/nb/${nb.id}`);
}
function notebookView(root, nbId) {
  const nb = nbstore.get(nbId);
  if (!nb) return go('#/');
  const first = nb.sections.find(s => s.pages.length) || nb.sections[0];
  if (first) return go(first.pages[0] ? `#/nb/${nb.id}/p/${first.pages[0].id}` : `#/nb/${nb.id}/s/${first.id}`);
  root.append(h('div', { class: 'empty' }, h('div', { class: 'big-ico', text: '📂' }), h('h2', { text: 'This notebook is empty' }),
    h('p', { text: 'Add a section (for example "Unit 1") from the left, then add pages to it.' })));
}
function sectionView(root, nbId, secId) {
  const nb = nbstore.get(nbId);
  const sec = nb?.sections.find(s => s.id === secId);
  if (!sec) return go(nb ? `#/nb/${nb.id}` : '#/');
  if (sec.pages.length) return go(`#/nb/${nb.id}/p/${sec.pages[0].id}`);
  root.append(h('div', { class: 'empty' }, h('div', { class: 'big-ico', text: '📄' }), h('h2', { text: `"${sec.name}" has no pages yet` }),
    h('p', { text: 'A page holds one lecture, chapter or topic: its photos and the notes written from them.' }),
    h('button', { class: 'btn primary big', text: '＋ Add page', onclick: () => newPage(nb, sec) })));
}

const routes = [
  [/^#?\/?$/, homeView],
  [/^#\/nb\/(\w+)$/, notebookView],
  [/^#\/nb\/(\w+)\/s\/(\w+)$/, sectionView],
  [/^#\/nb\/(\w+)\/p\/(\w+)$/, pageView],
  [/^#\/nb\/(\w+)\/study$/, studyView],
  [/^#\/library$/, libraryView],
  [/^#\/folder\/(\w+)$/, folderView],
  [/^#\/import$/, root => editorView(root, null, null, { open: 'quizlet' })],
  [/^#\/new\/nb\/(\w+)(?:\/(quizlet))?$/, (root, notebookId, open) => editorView(root, null, null, { notebookId, open })],
  [/^#\/new(?:\/(\w+))?$/, (root, folderId) => editorView(root, null, folderId)],
  [/^#\/set\/(\w+)$/, setView],
  [/^#\/set\/(\w+)\/edit$/, (root, id) => editorView(root, id)],
  [/^#\/set\/(\w+)\/flashcards$/, flashcardsView],
  [/^#\/set\/(\w+)\/learn$/, learnView],
  [/^#\/set\/(\w+)\/write$/, writeView],
  [/^#\/set\/(\w+)\/test$/, testView],
];

let current = '';
let cleanup = null;
let guard = null;
let ignoreNext = false;

export function route() {
  current = location.hash || '#/';
  closeMenu();
  cleanup?.();
  cleanup = guard = null;
  const main = $('#main');
  const root = document.createElement('div'); // fresh node so old listeners are discarded
  main.replaceChildren(root);
  main.scrollTop = 0;
  const match = routes.map(([re, view]) => [current.match(re), view]).find(([m]) => m);
  const [m, view] = match || [[], homeView];
  const result = view(root, ...m.slice(1));
  if (typeof result === 'function') cleanup = result;
  else if (result) ({ cleanup = null, guard = null } = result);
  renderNav(current);
  ribbon.setRoute(current);
}

function onHashChange() {
  if (ignoreNext) { ignoreNext = false; return; }
  if (guard && !guard()) { ignoreNext = true; location.hash = current; return; }
  route();
}

await store.load();
await nbstore.load();
document.body.dataset.theme = store.db().settings.theme;

// Nothing below may stop the app (or the tour) from starting, so each step is guarded.
const safely = (what, fn) => { try { return fn(); } catch (e) { console.error(`Start-up: ${what} failed`, e); } };

// Sets made by StudyDeck 1.3 notebooks: attach them to their notebook.
safely('linking old sets', () => {
  for (const nb of nbstore.list()) {
    const set = nb.legacySetId && store.getSet(nb.legacySetId);
    if (set && !set.notebookId) { set.notebookId = nb.id; store.save(); }
  }
});
if (nbstore.api && !nbstore.list().length) await ensureWelcome().catch(e => console.error('Start-up: welcome notebook failed', e));

store.onChange(() => { renderNav(current); ribbon.refresh(); });
nbstore.onChange(() => { renderNav(current); ribbon.refresh(); });
onAiChange(refreshAi);
nbstore.api?.onUsage(() => refreshAi()); // an AI request was sent: update the counter and any limit warning
window.addEventListener('hashchange', onHashChange);
safely('app bar', renderAppbar);
refreshAi().catch(() => {});
safely('first page', route);
// The guided tour plays every time the app opens until the user turns it off.
if (nbstore.api && store.db().settings.tourOnStartup) {
  const begin = () => startTour().catch(e => console.error('Tour failed to start', e));
  if (document.readyState === 'complete') setTimeout(begin, 200); else window.addEventListener('load', () => setTimeout(begin, 200), { once: true });
}
