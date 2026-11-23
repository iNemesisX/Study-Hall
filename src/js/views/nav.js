// Left navigation: notebook picker, then sections and pages side by side.
import * as store from '../store.js';
import * as nbstore from '../notes/nbstore.js';
import { $, h, menu, confirmDialog, promptDialog, toast } from '../ui.js';
import { getSettings, getUsage, PROVIDERS, aiSettingsDialog } from '../notes/aiui.js';
import { faqDialog } from './help.js';

/** Which notebook / section / page a #/hash route refers to. */
export function context(hash) {
  let m, nb = null, sec = null, pageId = null, view = 'other';
  if ((m = hash.match(/^#\/nb\/(\w+)(?:\/(p|s)\/(\w+)|\/(study))?/))) {
    nb = nbstore.get(m[1]) || null;
    if (m[2] === 'p') { pageId = m[3]; sec = nbstore.findPage(nb, pageId)?.sec || null; view = 'page'; }
    else if (m[2] === 's') { sec = nb?.sections.find(s => s.id === m[3]) || null; view = 'section'; }
    else if (m[4]) view = 'study';
  } else if ((m = hash.match(/^#\/set\/(\w+)/))) {
    nb = nbstore.get(store.getSet(m[1])?.notebookId) || null;
    view = 'set';
  } else if (hash.startsWith('#/library')) view = 'library';
  if (!nb && view !== 'library') {
    try { nb = nbstore.get(JSON.parse(localStorage.getItem('studyhall-last') || '{}').nb) || null; } catch { /* ignore */ }
    nb ||= nbstore.list()[0] || null;
  }
  return { nb, sec, pageId, view };
}

export async function newNotebook() {
  if (!nbstore.api) return toast('Notebooks need the desktop app');
  const name = await promptDialog('New notebook', 'Name it after a class, e.g. "Biology 101"', '', 'Create');
  if (!name) return;
  const nb = await nbstore.createNotebook(name);
  const sec = await nbstore.addSection(nb, 'Lecture notes');
  const page = await nbstore.addPage(nb, sec);
  location.hash = `#/nb/${nb.id}/p/${page.id}`;
}
async function newSection(nb) {
  const name = await promptDialog('New section', 'Section name, e.g. "Unit 2" or "Chapter 5"', '', 'Create');
  if (!name) return;
  const sec = await nbstore.addSection(nb, name);
  const page = await nbstore.addPage(nb, sec);
  location.hash = `#/nb/${nb.id}/p/${page.id}`;
}
export async function newPage(nb, sec) {
  const page = await nbstore.addPage(nb, sec);
  location.hash = `#/nb/${nb.id}/p/${page.id}`;
}

function notebookMenu(anchor, current) {
  menu(anchor, [
    { head: 'Notebooks' },
    ...nbstore.list().map(n => ({ label: n.name, icon: `<i class="nbchip" style="background:${n.color}"></i>`, on: n === current, onClick: () => { location.hash = `#/nb/${n.id}`; } })),
    'sep',
    { label: 'New notebook', icon: '＋', onClick: newNotebook },
    { label: 'All flashcard sets', icon: '📚', onClick: () => { location.hash = '#/library'; } },
    ...(current ? ['sep',
      { label: `Rename "${current.name}"`, icon: '✎', onClick: async () => {
        const name = await promptDialog('Rename notebook', 'Notebook name', current.name);
        if (name) { current.name = name; await nbstore.saveNotebook(current); }
      } },
      { label: `Delete "${current.name}"`, icon: '🗑', kind: 'danger', onClick: async () => {
        if (!(await confirmDialog('Delete notebook?', `"${current.name}" with all its pages, photos and annotations will be deleted. Flashcard sets made from it are kept.`))) return;
        await nbstore.removeNotebook(current.id);
        try { localStorage.removeItem('studyhall-last'); } catch { /* ignore */ }
        location.hash = '#/';
      } }] : []),
  ]);
}
function sectionMenu(anchor, nb, sec) {
  menu(anchor, [
    { label: 'Rename section', icon: '✎', onClick: async () => {
      const name = await promptDialog('Rename section', 'Section name', sec.name);
      if (name) { sec.name = name; await nbstore.saveNotebook(nb); }
    } },
    { label: 'Delete section', icon: '🗑', kind: 'danger', onClick: async () => {
      if (!(await confirmDialog('Delete section?', `"${sec.name}" and its ${sec.pages.length} page(s) will be deleted.`))) return;
      await nbstore.removeSection(nb, sec);
      location.hash = `#/nb/${nb.id}`;
    } },
  ]);
}
function pageMenu(anchor, nb, sec, meta) {
  const others = nb.sections.filter(s => s !== sec);
  menu(anchor, [
    ...others.map(s => ({ label: `Move to "${s.name}"`, icon: '→', onClick: async () => {
      sec.pages = sec.pages.filter(p => p !== meta); s.pages.push(meta);
      await nbstore.saveNotebook(nb);
    } })),
    ...(others.length ? ['sep'] : []),
    { label: 'Delete page', icon: '🗑', kind: 'danger', onClick: async () => {
      if (!(await confirmDialog('Delete page?', `"${meta.title}" with its photos, notes and annotations will be deleted.`))) return;
      const here = location.hash.endsWith(`/p/${meta.id}`);
      await nbstore.removePage(nb, meta.id);
      if (here) location.hash = `#/nb/${nb.id}/s/${sec.id}`;
    } },
  ]);
}

export function renderNav(hash) {
  const el = $('#nav');
  const { nb, sec, pageId, view } = context(hash);
  const stop = fn => e => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget); };
  if (!nb) {
    el.replaceChildren(h('div', { class: 'nav-none' }, h('p', { class: 'muted', text: 'No notebooks yet.' }),
      h('button', { class: 'btn primary', text: '＋ New notebook', onclick: newNotebook })));
    return;
  }
  const current = sec || (view === 'page' ? null : nb.sections[0]) || null;
  el.replaceChildren(
    h('button', { class: 'nb-picker', 'data-tour': 'notebooks', title: 'Switch notebook, or create a new one', onclick: e => notebookMenu(e.currentTarget, nb) },
      h('i', { class: 'nbchip', style: `background:${nb.color}` }), h('b', { text: nb.name }), h('span', { class: 'muted', text: '▾' })),
    h('a', { class: `nav-study ${view === 'study' || view === 'set' ? 'on' : ''}`, href: `#/nb/${nb.id}/study`, 'data-tour': 'studyhub' },
      h('span', { text: '🎓' }), h('span', { text: 'Study tools' }), h('span', { class: 'muted small', text: `${store.setsForNotebook(nb.id).length || ''}` })),
    h('div', { class: 'nav-cols' },
      h('div', { class: 'nav-col secs', 'data-tour': 'sections' },
        h('div', { class: 'nav-col-list' }, nb.sections.map(s =>
          h('a', { class: `sec-item ${s === current && (view === 'page' || view === 'section') ? 'on' : ''}`, href: `#/nb/${nb.id}/s/${s.id}`, style: `--c:${s.color}`, title: s.name },
            h('span', { class: 'sec-name', text: s.name }),
            h('button', { class: 'dots', title: 'Rename or delete', text: '⋯', onclick: stop(a => sectionMenu(a, nb, s)) })))),
        h('button', { class: 'nav-add', text: '＋ Add section', onclick: () => newSection(nb) })),
      h('div', { class: 'nav-col pages', 'data-tour': 'pages' },
        h('div', { class: 'nav-col-list' }, current ? current.pages.map(p =>
          h('a', { class: `page-item ${p.id === pageId ? 'on' : ''}`, href: `#/nb/${nb.id}/p/${p.id}`, title: p.title, 'data-page': p.id },
            h('span', { class: 'page-name', text: `${p.kind === 'guide' ? '🧭 ' : ''}${p.title}` }),
            h('button', { class: 'dots', title: 'Move or delete', text: '⋯', onclick: stop(a => pageMenu(a, nb, current, p)) }))) : null,
          current && !current.pages.length ? h('p', { class: 'nav-empty', text: 'No pages in this section yet.' }) : null),
        current ? h('button', { class: 'nav-add', text: '＋ Add page', 'data-tour': 'add-page', onclick: () => newPage(nb, current) }) : null)));
}

let aiLabel = { text: 'AI…', ready: true, level: 'ok' };
export async function refreshAi() {
  const s = await getSettings();
  const u = s.ready ? await getUsage() : null;
  const used = u && u.limit ? ` · ${u.count}/${u.limit} today` : '';
  aiLabel = s.ready ? { text: `AI: ${PROVIDERS[s.provider].short}${used}`, ready: true, level: u?.level || 'ok' } : { text: 'Set up free AI', ready: false, level: 'ok' };
  renderAppbar();
  usageBanner(u);
}

// A bar under the ribbon when today's AI allowance is nearly or fully used.
function usageBanner(u) {
  const bar = $('#usagebar');
  if (!bar) return;
  const key = u && `${u.provider}:${u.level}:${new Date().toDateString()}`;
  let dismissed = null;
  try { dismissed = localStorage.getItem('studyhall-usage-dismissed'); } catch { /* ignore */ }
  if (!u || !['warn', 'high', 'max'].includes(u.level) || dismissed === key) { bar.hidden = true; return; }
  const name = PROVIDERS[u.provider].name, about = u.source === 'estimate' ? 'about ' : '';
  const reset = `It resets in about ${Math.max(1, Math.ceil(u.hoursToReset))} hour${Math.ceil(u.hoursToReset) > 1 ? 's' : ''}${u.provider === 'gemini' ? ' (midnight Pacific time)' : ''}.`;
  const msg = u.level === 'max' ? `Today's ${name} limit is used up (${u.count} of ${about}${u.limit} requests). ${reset}`
    : `${u.level === 'high' ? 'Almost out: you' : 'You'}'ve used ${u.count} of ${about}${u.limit} ${name} requests for today. ${u.left} left. ${reset}`;
  bar.className = u.level;
  bar.hidden = false;
  bar.replaceChildren(
    h('span', { class: 'usage-ico', text: u.level === 'max' ? '⛔' : '⚠' }),
    h('span', { class: 'usage-msg', text: msg }),
    h('span', { class: 'muted small', text: u.level === 'max' ? 'Typing, drawing and studying still work.' : 'Each "turn into notes", flashcard set, study guide or diagram uses requests.' }),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn small', text: 'Switch AI', title: 'Use another model or AI option', onclick: () => aiSettingsDialog() }),
    h('button', { class: 'btn small ghost', text: 'Dismiss', onclick: () => { try { localStorage.setItem('studyhall-usage-dismissed', key); } catch { /* ignore */ } bar.hidden = true; } }));
}
export function renderAppbar() {
  const theme = store.db().settings.theme;
  $('#appbar').replaceChildren(
    h('a', { class: 'logo', href: '#/' }, h('img', { src: 'icon.png', alt: '' }), h('span', { text: 'Study Hall' })),
    h('span', { class: 'spacer' }),
    h('button', { class: `ai-chip ${aiLabel.ready ? '' : 'todo'} ${aiLabel.level}`, 'data-tour': 'ai', title: 'Choose which AI writes your notes', text: aiLabel.text, onclick: () => aiSettingsDialog() }),
    h('button', { class: 'bar-btn', title: 'Help and FAQ', text: '?', 'data-tour': 'help-btn', onclick: () => faqDialog() }),
    h('button', { class: 'bar-btn', title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', text: theme === 'dark' ? '☀' : '☾',
      onclick: () => { const t = theme === 'dark' ? 'light' : 'dark'; store.setTheme(t); document.body.dataset.theme = t; renderAppbar(); } }));
}
