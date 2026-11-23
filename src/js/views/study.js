// Study tools for a class notebook: flashcards, practice tests and study guides,
// all written from the notes in that notebook.
import * as store from '../store.js';
import * as nbstore from '../notes/nbstore.js';
import { $, esc, uid, plural, modal, toast, busy } from '../ui.js';
import { sectionHtml, htmlToText } from '../notes/render.js';
import { fail, ensureAi } from '../notes/aiui.js';
import { setCard, notFound } from './common.js';
import { addBy } from '../notes/aicredit.js';

const api = nbstore.api;
const MAX_CHARS = 180000; // notes text sent to the model in one request

/** Plain text of the notes in a scope: 'all', 's:<sectionId>' or 'p:<pageId>'. Study guides are left out of 'all'. */
export async function gatherNotes(nb, scope) {
  let text = '', pages = 0;
  for (const sec of nb.sections) {
    for (const meta of sec.pages) {
      const wanted = scope === 'all' ? meta.kind !== 'guide' : scope === `s:${sec.id}` ? meta.kind !== 'guide' : scope === `p:${meta.id}`;
      if (!wanted) continue;
      const page = await nbstore.loadPage(nb.id, meta.id);
      const body = (page?.topics || []).map(t => `## ${t.heading}\n${htmlToText(t.html)}`).join('\n\n').trim();
      if (body.replace(/[#\s]/g, '').length < 20) continue;
      text += `# ${page.title} (${sec.name})\n${body}\n\n`;
      pages++;
    }
  }
  return { text: text.slice(0, MAX_CHARS), pages, truncated: text.length > MAX_CHARS };
}

const scopeOptions = (nb, selected) => `<option value="all">The whole class (${plural(nbstore.pageCount(nb), 'page')})</option>
  ${nb.sections.filter(s => s.pages.some(p => p.kind !== 'guide')).map(s => `<optgroup label="${esc(s.name)}">
    <option value="s:${s.id}" ${selected === `s:${s.id}` ? 'selected' : ''}>All of "${esc(s.name)}"</option>
    ${s.pages.filter(p => p.kind !== 'guide').map(p => `<option value="p:${p.id}" ${selected === `p:${p.id}` ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup>`).join('')}`;

const NO_NOTES = 'There are no notes there yet. Add photos to a page and turn them into notes first (Insert tab).';

/* ---------- flashcards ---------- */
export function studySetDialog(nb, scope = 'all') {
  const sets = store.setsForNotebook(nb.id);
  modal({
    title: 'Make flashcards from your notes',
    body: `
      <p class="muted small">The AI writes term-and-definition cards from your notes, including your own edits. Study them with <b>Flashcards</b>, <b>Learn</b>, <b>Write</b> and <b>Test</b>.</p>
      <label class="select-wrap">Use the notes from<select class="input" data-f="scope">${scopeOptions(nb, scope)}</select></label>
      <label class="select-wrap" style="margin-top:12px">How many cards<select class="input" data-f="count">${[10, 20, 30, 40].map(n => `<option ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="select-wrap" style="margin-top:12px">Put them in<select class="input" data-f="target"><option value="">A new set</option>
        ${sets.map(s => `<option value="${s.id}">Add to "${esc(s.title)}" (${s.cards.length})</option>`).join('')}</select></label>`,
    actions: [{ label: 'Cancel', kind: 'ghost' },
      { label: 'Write the cards', kind: 'primary', onClick: el => { makeSet(nb, $('[data-f="scope"]', el).value, +$('[data-f="count"]', el).value, $('[data-f="target"]', el).value); } }],
  });
}

export async function makeSet(nb, scope, count, targetId) {
  if (!(await ensureAi())) return null;
  let set = targetId ? store.getSet(targetId) : null;
  busy('Reading your notes…');
  try {
    const notes = await gatherNotes(nb, scope);
    if (!notes.pages) { busy(null); toast(NO_NOTES); return null; }
    busy(`Writing ${count} flashcards from ${plural(notes.pages, 'page')}…`);
    const res = await api.makeCards({ notes: notes.text, count, existing: set ? set.cards.map(c => c.term) : [] });
    const seen = new Set((set ? set.cards : []).map(c => c.term.trim().toLowerCase()));
    const cards = [];
    for (const c of res.cards || []) {
      const term = String(c.term || '').trim(), def = String(c.definition || '').trim();
      if (!term || !def || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      cards.push({ id: uid(), term, def, starred: false });
    }
    if (!cards.length) throw new Error('No new cards came back. Try again.');
    if (set) { set.cards.push(...cards); set.ai = addBy(set.ai, res.by); set.updated = Date.now(); store.save(); }
    else {
      const id = uid();
      const sec = scope.startsWith('s:') && nb.sections.find(s => `s:${s.id}` === scope);
      const page = scope.startsWith('p:') && nbstore.findPage(nb, scope.slice(2))?.meta;
      store.saveSet({ id, title: `${nb.name}${sec ? ` – ${sec.name}` : page ? ` – ${page.title}` : ''}`.slice(0, 120), description: `Made from your ${nb.name} notes`, folderId: null, notebookId: nb.id, ai: addBy([], res.by), cards });
      set = store.getSet(id);
    }
    busy(null);
    toast(`${plural(cards.length, 'card')} added`);
    location.hash = `#/set/${set.id}`;
    return set;
  } catch (e) { fail(e); return null; }
}

/* ---------- practice test ---------- */
export function openTest(nb) {
  const sets = store.setsForNotebook(nb.id).filter(s => s.cards.length);
  if (sets.length === 1) { location.hash = `#/set/${sets[0].id}/test`; return; }
  if (!sets.length) {
    modal({
      title: 'Practice test',
      body: '<p>Tests are built from a class\'s flashcards: multiple choice, true/false and written questions, graded for you.</p><p class="muted">This class has no flashcards yet. Make them from your notes first.</p>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Generate flashcards', kind: 'primary', onClick: () => { studySetDialog(nb); } }],
    });
    return;
  }
  modal({
    title: 'Practice test',
    body: `<p class="muted small">Pick the set to be tested on.</p><div class="pick-list">${sets.map(s =>
      `<a class="pick-item" href="#/set/${s.id}/test" data-close><b>${esc(s.title)}</b><span class="muted small">${plural(s.cards.length, 'term')}</span></a>`).join('')}</div>`,
    onMount: (el, close) => el.querySelectorAll('.pick-item').forEach(a => a.addEventListener('click', () => setTimeout(close, 0))),
  });
}

/* ---------- study guide ---------- */
export function studyGuideDialog(nb) {
  modal({
    title: 'Generate a study guide',
    body: `
      <p class="muted small">The AI analyses your notes and writes a guide for exam prep: the big picture, key concepts, terms, formulas, common mistakes, practice questions with answers, and a checklist of what to review. It is saved as a page you can edit and draw on.</p>
      <label class="select-wrap">Cover the notes from<select class="input" data-f="scope">${scopeOptions(nb, '')}</select></label>
      <label class="select-wrap" style="margin-top:12px">What is the exam on? (optional)
        <input class="input" data-f="focus" maxlength="300" placeholder='e.g. "Midterm on chapters 3 to 5, mostly problem solving"'></label>`,
    actions: [{ label: 'Cancel', kind: 'ghost' },
      { label: 'Write the study guide', kind: 'primary', onClick: el => { makeGuide(nb, $('[data-f="scope"]', el).value, $('[data-f="focus"]', el).value.trim()); } }],
  });
}

export async function makeGuide(nb, scope, focus) {
  if (!(await ensureAi())) return null;
  busy('Reading your notes…');
  try {
    const notes = await gatherNotes(nb, scope);
    if (!notes.pages) { busy(null); toast(NO_NOTES); return null; }
    busy(`Analysing ${plural(notes.pages, 'page')} of notes and writing your study guide…`);
    const res = await api.makeGuide({ notes: notes.text, className: nb.name, focus });
    const topics = (res.sections || []).map(sec => ({ id: uid(), heading: String(sec.heading || '').slice(0, 200), html: sectionHtml(sec), ink: [] }));
    if (!topics.length) throw new Error('The guide came back empty. Try again.');
    const sec = nb.sections.find(s => s.guides) || await nbstore.addSection(nb, 'Study guides', { guides: true });
    const page = await nbstore.addPage(nb, sec, { title: String(res.title || `Study guide: ${nb.name}`).slice(0, 150), kind: 'guide', topics, aiBy: addBy([], res.by) });
    busy(null);
    toast(notes.truncated ? 'Study guide ready (your notes were very long, so the last part was left out)' : 'Study guide ready');
    location.hash = `#/nb/${nb.id}/p/${page.id}`;
    return page;
  } catch (e) { fail(e); return null; }
}

/* ---------- Study tools page for one class ---------- */
export function studyView(root, nbId) {
  const nb = nbstore.get(nbId);
  if (!nb) return notFound(root, 'notebook');
  const sets = store.setsForNotebook(nb.id);
  const guides = nb.sections.flatMap(s => s.pages.filter(p => p.kind === 'guide'));
  const pages = nbstore.pageCount(nb);
  root.innerHTML = `
    <h1>🎓 Study tools</h1>
    <p class="muted">${esc(nb.name)} · ${plural(pages, 'page')} of notes. Everything here is written from those notes, so add your notes first.</p>
    <div class="tool-cards">
      <div class="tool-card"><div class="ico">🗂</div><h3>Flashcards</h3>
        <p class="muted small">Generate cards from your notes, type your own, or import a Quizlet set by link. Study with Flashcards, Learn and Write, and export any set back to Quizlet.</p>
        <button class="btn primary" data-act="cards">✨ Generate from notes</button>
        <div class="row gap"><a class="btn small" style="flex:1" href="#/new/nb/${nb.id}">✎ Type your own</a><a class="btn small" style="flex:1" href="#/new/nb/${nb.id}/quizlet">⤓ From Quizlet</a></div></div>
      <div class="tool-card"><div class="ico">📝</div><h3>Practice test</h3>
        <p class="muted small">Multiple choice, true/false and written questions from this class's flashcards, graded for you.</p>
        <button class="btn" data-act="test">Take a test</button></div>
      <div class="tool-card"><div class="ico">🧭</div><h3>Study guide</h3>
        <p class="muted small">An exam-prep guide: key concepts, terms, formulas, common mistakes, practice questions and a review checklist.</p>
        <button class="btn primary" data-act="guide">Generate study guide</button></div>
    </div>
    <div class="section"><div class="section-head"><h2>Flashcard sets for this class</h2></div>
      ${sets.length ? `<div class="grid">${sets.map(setCard).join('')}</div>` : '<p class="muted">None yet. Use the Flashcards card above.</p>'}</div>
    <div class="section"><div class="section-head"><h2>Study guides</h2></div>
      ${guides.length ? `<div class="grid">${guides.map(g => `<a class="folder-card" href="#/nb/${nb.id}/p/${g.id}"><span class="ico">🧭</span><span><b>${esc(g.title)}</b></span></a>`).join('')}</div>`
        : '<p class="muted">None yet. Press "Generate study guide" above.</p>'}</div>`;
  root.onclick = e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cards') studySetDialog(nb);
    else if (act === 'test') openTest(nb);
    else if (act === 'guide') studyGuideDialog(nb);
  };
  root._study = { nb, makeSet, makeGuide };
}
