// Helpers for showing card sides and building questions. Card fields:
// { id, term, def, termImg?, defImg?, starred }. "side" is 'term' or 'def'.
import { esc, shuffle } from './ui.js';
import { norm } from './grading.js';
import * as store from './store.js';

export const LABEL = { term: 'Term', def: 'Definition' };
export const text = (card, side) => (side === 'term' ? card.term : card.def) || '';
export const image = (card, side) => (side === 'term' ? card.termImg : card.defImg);

/** HTML for one side of a card: optional image plus text. */
export function face(card, side) {
  const img = image(card, side);
  const t = text(card, side);
  return `${img ? `<img class="face-img" src="${esc(img)}" alt="">` : ''}${t ? `<span>${esc(t)}</span>` : ''}`;
}

/** Font size class for a block of text so long definitions still fit. */
export function sizeClass(s = '') {
  const n = s.length;
  return n < 25 ? 'xl' : n < 90 ? 'lg' : n < 220 ? 'md' : 'sm';
}

/** answerWith: 'term' | 'definition' | 'both' → which side is the question (q) and which is the answer (a). */
export function pickSides(answerWith) {
  const a = answerWith === 'both' ? (Math.random() < 0.5 ? 'term' : 'def') : answerWith === 'definition' ? 'def' : 'term';
  return { q: a === 'term' ? 'def' : 'term', a };
}

/** Up to n other cards whose answer text differs from this card's — used for wrong choices. */
export function distractors(cards, card, side, n) {
  const seen = new Set([norm(text(card, side))]);
  const out = [];
  for (const c of shuffle(cards)) {
    if (c.id === card.id) continue;
    const key = norm(text(c, side)) || c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

export const studyCards = (set, starredOnly) => (starredOnly ? set.cards.filter(c => c.starred) : set.cards);

export function modeHeader(set, title, right = '') {
  return `<div class="mode-head">
    <a class="back" href="#/set/${set.id}">← ${esc(set.title)}</a>
    <h2>${title}</h2>
    <div class="mode-head-right">${right}</div>
  </div>`;
}

/** Green/yellow/grey bar of mastered / still learning / not studied. */
export function masteryBar(set, cards) {
  const s = store.setStats(set, cards);
  const w = n => (s.total ? (n / s.total) * 100 : 0);
  return `<div class="mastery-bar" role="img" aria-label="${s.mastered} mastered, ${s.learning} still learning, ${s.new} not studied">
      <i style="width:${w(s.mastered)}%;background:var(--ok)"></i><i style="width:${w(s.learning)}%;background:var(--warn)"></i>
    </div>
    <div class="legend">
      <span style="--c:var(--muted)">Not studied ${s.new}</span>
      <span style="--c:var(--warn)">Still learning ${s.learning}</span>
      <span style="--c:var(--ok)">Mastered ${s.mastered}</span>
    </div>`;
}

export function needsCards(set, starredOnly) {
  if (!set.cards.length) return `<div class="empty"><div class="big-ico">🗂</div><h2>This set has no cards yet</h2><a class="btn primary" href="#/set/${set.id}/edit">Add cards</a></div>`;
  if (starredOnly) return `<div class="empty"><div class="big-ico">★</div><h2>No starred terms</h2><p>Star terms with ★, or turn off "Starred only" in options.</p></div>`;
  return '';
}
