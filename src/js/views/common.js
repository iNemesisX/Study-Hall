// Pieces shared between pages.
import * as store from '../store.js';
import { esc, plural } from '../ui.js';

export function setCard(set) {
  const st = store.setStats(set);
  const pct = st.total ? Math.round((st.mastered / st.total) * 100) : 0;
  const folder = set.folderId && store.getFolder(set.folderId);
  return `<a class="set-card" href="#/set/${set.id}">
      <h3 title="${esc(set.title)}">${esc(set.title)}</h3>
      <div class="set-meta"><span class="pill">${plural(set.cards.length, 'term')}</span>
        ${folder ? `<span class="muted">📁 ${esc(folder.name)}</span>` : ''}</div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="muted small">${pct}% mastered</div>
    </a>`;
}

export function notFound(root, what = 'set') {
  root.innerHTML = `<div class="empty"><div class="big-ico">🔍</div><h2>That ${what} doesn't exist</h2>
    <p>It may have been deleted.</p><a class="btn primary" href="#/">Go home</a></div>`;
}
