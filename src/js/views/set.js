// Set page: mode buttons, flashcard preview, progress, recent activity, term list.
import * as store from '../store.js';
import { $, esc, plural, timeAgo, modal, confirmDialog, toast } from '../ui.js';
import { face, masteryBar } from '../cards.js';
import { mountFlashcards } from './flashcards.js';
import { notFound } from './common.js';
import * as nbstore from '../notes/nbstore.js';
import { creditHtml } from '../notes/aicredit.js';

const MODES = [['flashcards', '🃏', 'Flashcards'], ['learn', '🎯', 'Learn'], ['write', '✏️', 'Write'], ['test', '📝', 'Test']];
const GROUPS = [
  ['learning', 'Still learning', 'var(--warn)', 'You\'ve started learning these terms. Keep up the good work!'],
  ['new', 'Not studied', 'var(--muted)', 'You haven\'t studied these terms yet.'],
  ['mastered', 'Mastered', 'var(--ok)', 'You know these terms well.'],
];

export function setView(root, id) {
  const set = store.getSet(id);
  if (!set) return notFound(root);
  const folder = set.folderId && store.getFolder(set.folderId);
  const notebook = nbstore.get(set.notebookId);
  let filter = 'all';

  root.innerHTML = `
    <div class="set-head">
      ${notebook ? `<a class="crumb" href="#/nb/${notebook.id}/study">← ${esc(notebook.name)} · Study tools</a>` : `<a class="crumb" href="#/library">← All flashcard sets</a>`}
      ${folder ? `<a class="crumb" href="#/folder/${folder.id}">📁 ${esc(folder.name)}</a>` : ''}
      <h1>${esc(set.title)}</h1>
      ${set.description ? `<p class="muted">${esc(set.description)}</p>` : ''}
      ${set.ai?.length ? creditHtml(set.ai, 'Cards in this set were generated', 'set-credit') : ''}
      <div class="row gap wrap" style="margin-top:12px">
        <a class="btn" href="#/set/${id}/edit">✎ Edit</a>
        <button class="btn" data-act="move">📁 Move</button>
        ${set.cards.length ? '<button class="btn" data-act="export">⤴ Export to Quizlet</button>' : ''}
        <button class="btn danger-ghost" data-act="delete">🗑 Delete</button>
      </div>
    </div>
    <div class="modes">${MODES.map(([m, ico, label]) =>
      `<a class="mode-btn" href="#/set/${id}/${m}"><span class="ico">${ico}</span>${label}</a>`).join('')}</div>
    <div id="fc"></div>
    <div id="progress"></div>
    <div id="terms"></div>`;

  const offFc = set.cards.length ? mountFlashcards($('#fc', root), set) : null;
  if (!set.cards.length) $('#fc', root).innerHTML = `<div class="empty"><h2>No cards yet</h2><a class="btn primary" href="#/set/${id}/edit">Add cards</a></div>`;

  function renderProgress() {
    if (!set.cards.length) return;
    const recent = [...set.sessions].reverse().slice(0, 6);
    const label = s => ({ learn: '🎯 Learn – completed', write: '✏️ Write', test: '📝 Test', flashcards: '🃏 Flashcards' }[s.mode] || esc(s.mode));
    const result = s => s.mode === 'test' ? `${Number(s.score) || 0}%`
      : s.mode === 'learn' ? plural(s.total, 'term')
      : s.total ? `${Number(s.correct) || 0}/${Number(s.total)}` : '';
    $('#progress', root).innerHTML = `
      <div class="section">
        <div class="section-head"><h2>Your progress</h2>
          ${Object.keys(set.progress).length ? '<button class="btn ghost small" data-act="reset">Reset progress</button>' : ''}</div>
        <div class="panel">${masteryBar(set, set.cards)}
          ${recent.length ? `<h3 style="margin-top:20px">Recent activity</h3><div class="activity">${recent.map(s =>
            `<div class="activity-row"><span>${label(s)}</span><span class="muted small">${timeAgo(s.date)}</span><span class="score">${result(s)}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  function renderTerms() {
    if (!set.cards.length) return;
    const starred = set.cards.filter(c => c.starred).length;
    const cards = filter === 'starred' ? set.cards.filter(c => c.starred) : set.cards;
    const row = c => `<div class="term-row">
        <div class="t">${face(c, 'term')}</div><div>${face(c, 'def')}</div>
        <button class="star ${c.starred ? 'on' : ''}" data-star="${c.id}" title="Star" aria-label="Star ${esc(c.term)}">★</button>
      </div>`;
    const anyStudied = set.cards.some(c => store.status(set, c) !== 'new');
    const body = !cards.length
      ? '<div class="empty">No starred terms yet. Click ★ on a term to star it.</div>'
      : anyStudied
        ? GROUPS.map(([key, title, color, blurb]) => {
            const g = cards.filter(c => store.status(set, c) === key);
            return g.length ? `<div class="group-title"><span class="dot" style="background:${color}"></span>${title} (${g.length})</div>
              <p class="muted small" style="margin:0 0 8px">${blurb}</p>${g.map(row).join('')}` : '';
          }).join('')
        : cards.map(row).join('');
    $('#terms', root).innerHTML = `
      <div class="terms-head"><h2 style="margin:0">Terms in this set (${set.cards.length})</h2>
        <div class="seg" role="group" aria-label="Filter terms">
          <button data-filter="all" class="${filter === 'all' ? 'on' : ''}">All</button>
          <button data-filter="starred" class="${filter === 'starred' ? 'on' : ''}">★ Starred (${starred})</button>
        </div></div>${body}`;
  }

  renderProgress();
  renderTerms();

  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-act], [data-star], [data-filter]');
    if (!t || t.closest('#fc')) return;
    if (t.dataset.star) {
      store.toggleStar(set, set.cards.find(c => c.id === t.dataset.star));
      renderTerms();
    } else if (t.dataset.filter) {
      filter = t.dataset.filter;
      renderTerms();
    } else if (t.dataset.act === 'delete') {
      if (await confirmDialog('Delete set?', `"${set.title}" and all its progress will be deleted. This can't be undone.`)) {
        store.deleteSet(id);
        location.hash = notebook ? `#/nb/${notebook.id}/study` : folder ? `#/folder/${folder.id}` : '#/library';
      }
    } else if (t.dataset.act === 'reset') {
      if (await confirmDialog('Reset progress?', 'All terms go back to "Not studied". Test history is kept.', 'Reset')) {
        store.resetProgress(set);
        renderProgress();
        renderTerms();
      }
    } else if (t.dataset.act === 'move') {
      moveDialog(set, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
    } else if (t.dataset.act === 'export') {
      exportDialog(set);
    }
  });

  return offFc;
}

// ---------- Export to Quizlet ----------
// Quizlet has no public API for creating sets, but its "Import" box on the
// create-set page accepts pasted text. We build that text in Quizlet's format
// (the separators match Quizlet's own import options) and copy it.
const SEPS = {
  between: { tab: ['\t', 'Tab'], comma: [',', 'Comma'] },
  rows: { newline: ['\n', 'New line'], semicolon: [';', 'Semicolon'] },
};

/** Builds the Quizlet import text. Exported for tests. */
export function quizletText(cards, between = 'tab', rows = 'newline') {
  const b = SEPS.between[between][0], r = SEPS.rows[rows][0];
  let changed = 0;
  const clean = s => {
    // A separator inside a term would split the card on import, so swap it for a look-alike.
    let out = String(s || '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
    if (r === '\n') out = out.replace(/\s*\n+\s*/g, ' / ');
    if (b === ',') out = out.replace(/,/g, '‚'); // U+201A low quote, looks like a comma
    if (r === ';') out = out.replace(/;/g, '；'); // full-width semicolon
    out = out.trim();
    if (out !== String(s || '').trim()) changed++;
    return out;
  };
  const text = cards.map(c => clean(c.term) + b + clean(c.def)).join(r);
  return { text, changed, images: cards.filter(c => c.termImg || c.defImg).length };
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

function exportDialog(set) {
  const starred = set.cards.filter(c => c.starred).length;
  const opt = (group, cur) => Object.entries(SEPS[group]).map(([k, [, label]]) =>
    `<label><input type="radio" name="${group}" value="${k}" ${k === cur ? 'checked' : ''}> ${label}</label>`).join('');
  modal({
    title: 'Export to Quizlet',
    wide: true,
    body: `
      <ol class="small" style="margin:0 0 12px;padding-left:20px;line-height:1.6">
        <li>Click <b>Copy &amp; open Quizlet</b>. Your browser opens Quizlet's "Create a new flashcard set" page.</li>
        <li>Sign in if asked, give the set a title, then click <b>+ Import</b>.</li>
        <li>Paste (Ctrl+V) into the box and set Quizlet's separators to match the ones below.</li>
        <li>Click <b>Import</b>, then <b>Create</b>.</li>
      </ol>
      <div class="radio-row" style="margin:0"><b>Between term and definition:</b> ${opt('between', 'tab')}</div>
      <div class="radio-row" style="margin:4px 0"><b>Between cards:</b> ${opt('rows', 'newline')}</div>
      ${starred ? `<div class="radio-row" style="margin:4px 0 10px"><label><input type="checkbox" id="exp-starred"> Starred terms only (${starred})</label></div>` : ''}
      <textarea class="input" id="exp-text" rows="10" readonly style="font-family:monospace;white-space:pre"></textarea>
      <p class="muted small" id="exp-note" style="margin:8px 0 0"></p>`,
    actions: [
      { label: 'Close', kind: 'ghost' },
      { label: 'Copy text', onClick: async el => { toast(await copyText($('#exp-text', el).value) ? 'Copied' : 'Copy failed. Select the text and press Ctrl+C.'); return false; } },
      { label: 'Copy & open Quizlet', kind: 'primary', onClick: async el => {
        if (!(await copyText($('#exp-text', el).value))) { toast('Copy failed. Select the text and press Ctrl+C.'); return false; }
        window.open('https://quizlet.com/create-set', '_blank'); // main.js opens http(s) links in the default browser
        toast('Copied. Paste it into Quizlet\'s Import box.');
        return false;
      } },
    ],
    onMount: el => {
      const update = () => {
        const between = $('input[name="between"]:checked', el).value;
        const rows = $('input[name="rows"]:checked', el).value;
        const cards = $('#exp-starred', el)?.checked ? set.cards.filter(c => c.starred) : set.cards;
        const r = quizletText(cards, between, rows);
        $('#exp-text', el).value = r.text;
        const notes = [`${plural(cards.length, 'card')}.`];
        if (r.changed) notes.push(`${plural(r.changed, 'term')} contained a separator character, which was replaced so the cards don't split.`);
        if (r.images) notes.push(`${plural(r.images, 'card')} have images. Quizlet's text import can't carry images, so add them in Quizlet after importing.`);
        $('#exp-note', el).textContent = notes.join(' ');
      };
      el.addEventListener('change', update);
      update();
    },
  });
}

function moveDialog(set, done) {
  const { folders } = store.db();
  modal({
    title: 'Move to folder',
    body: `<select class="input" id="move-folder">
        <option value="">No folder</option>
        ${folders.map(f => `<option value="${f.id}" ${f.id === set.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
      </select>`,
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Move', kind: 'primary', onClick: el => { set.folderId = $('#move-folder', el).value || null; store.save(); done(); } },
    ],
  });
}
