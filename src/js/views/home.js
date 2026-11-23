// "All flashcard sets": every set, grouped by the class notebook it belongs to.
// Sets typed by hand or imported from Quizlet live here too.
import * as store from '../store.js';
import * as nbstore from '../notes/nbstore.js';
import { esc, plural } from '../ui.js';
import { setCard } from './common.js';

export function libraryView(root) {
  const { sets, folders } = store.db();
  const mastered = sets.reduce((n, s) => n + store.setStats(s).mastered, 0);
  const total = sets.reduce((n, s) => n + s.cards.length, 0);
  const days = store.streak();
  const groups = nbstore.list().map(nb => [nb, store.setsForNotebook(nb.id)]).filter(([, list]) => list.length);
  const loose = sets.filter(s => !s.notebookId || !nbstore.get(s.notebookId));

  root.innerHTML = `
    <div class="editor-head"><div><h1>📚 All flashcard sets</h1>
      <span class="muted">Sets made from your notes, typed by hand or imported from Quizlet. Open a set to study it or export it back to Quizlet.</span></div>
      <div class="row gap wrap"><a class="btn" href="#/import">⤓ Import from Quizlet</a><a class="btn primary" href="#/new">＋ Create a set</a></div></div>
    <div class="stats">
      <div class="stat warn"><b>${days ? '🔥 ' : ''}${plural(days, 'day')}</b><span class="muted">Study streak</span></div>
      <div class="stat"><b>${sets.length}</b><span class="muted">${sets.length === 1 ? 'Set' : 'Sets'}</span></div>
      <div class="stat ok"><b>${mastered} / ${total}</b><span class="muted">Terms mastered</span></div>
    </div>
    ${groups.map(([nb, list]) => `<div class="section"><div class="section-head"><h2><i class="nbchip" style="background:${nb.color}"></i> ${esc(nb.name)}</h2>
      <a class="btn small" href="#/nb/${nb.id}/study">🎓 Study tools</a></div><div class="grid">${list.map(setCard).join('')}</div></div>`).join('')}
    ${loose.length ? `<div class="section"><div class="section-head"><h2>Not in a notebook</h2></div><div class="grid">${loose.map(setCard).join('')}</div></div>` : ''}
    ${folders.length ? `<div class="section"><div class="section-head"><h2>Folders</h2></div><div class="grid">${folders.map(f =>
      `<a class="folder-card" href="#/folder/${f.id}"><span class="ico">📁</span><span><b>${esc(f.name)}</b><br><span class="muted small">${plural(store.setsInFolder(f.id).length, 'set')}</span></span></a>`).join('')}</div></div>` : ''}
    ${!sets.length ? '<div class="empty"><div class="big-ico">🗂</div><h2>No flashcard sets yet</h2><p>Open a notebook and use <b>Study → Flashcards</b> to make a set from your notes.</p></div>' : ''}`;
}
