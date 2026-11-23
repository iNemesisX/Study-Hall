// Flashcards: flip, navigate, star, shuffle, and Quizlet's "Track progress"
// mode (sort cards into Know / Still learning). mountFlashcards is also used
// for the preview on the set page (full = false hides the options).
import * as store from '../store.js';
import { $, shuffle, ignoreKey, onKey } from '../ui.js';
import { LABEL, text, face, sizeClass, studyCards, modeHeader, needsCards } from '../cards.js';
import { notFound } from './common.js';

export function flashcardsView(root, id) {
  const set = store.getSet(id);
  if (!set) return notFound(root);
  root.innerHTML = modeHeader(set, 'Flashcards') + '<div id="fc"></div>';
  return mountFlashcards($('#fc', root), set, { full: true });
}

export function mountFlashcards(el, set, { full = false } = {}) {
  const opts = full ? set.flashOptions : { shuffle: false, starredOnly: false, front: 'term', track: false };
  let deck = [], i = 0, flipped = false, know = [], still = [], done = false;
  const back = () => (opts.front === 'term' ? 'def' : 'term');

  function build(cards) {
    const base = studyCards(set, opts.starredOnly);
    deck = cards ?? (opts.shuffle ? shuffle(base) : [...base]);
    i = 0; flipped = false; know = []; still = []; done = false;
    render();
  }

  const chip = (key, label) => `<button class="chip ${opts[key] ? 'on' : ''}" data-opt="${key}" aria-pressed="${!!opts[key]}">${label}</button>`;
  const sideHTML = (c, side) => `
    <span class="face-label">${LABEL[side]}</span>
    <button class="star ${c.starred ? 'on' : ''}" data-act="star" title="Star (S)" aria-label="Star">★</button>
    <div class="face-content ${sizeClass(text(c, side))}">${face(c, side)}</div>`;

  function render() {
    const toolbar = full ? `<div class="fc-toolbar">
        ${chip('shuffle', '🔀 Shuffle')}${chip('starredOnly', '★ Starred only')}${chip('track', '📊 Track progress')}
        <button class="chip" data-act="front">Front: ${LABEL[opts.front]}</button>
      </div>` : '';

    if (!deck.length) { el.innerHTML = toolbar + needsCards(set, opts.starredOnly); return; }

    if (done) {
      el.innerHTML = toolbar + `<div class="panel narrow" style="text-align:center">
          <div class="big-ico" style="font-size:44px">${still.length ? '💪' : '🎉'}</div>
          <h2>${still.length ? "Nice work! Keep going." : 'You know all of these!'}</h2>
          <p><b style="color:var(--ok)">Know: ${know.length}</b> &nbsp;·&nbsp; <b style="color:var(--bad)">Still learning: ${still.length}</b></p>
          <div class="row gap wrap" style="justify-content:center">
            ${still.length ? `<button class="btn primary" data-act="review">Keep reviewing ${still.length} ${still.length === 1 ? 'term' : 'terms'}</button>` : ''}
            <button class="btn" data-act="restart">Restart flashcards</button>
            <a class="btn ghost" href="#/set/${set.id}/learn">Try Learn mode</a>
          </div></div>`;
      return;
    }

    const c = deck[i];
    const track = full && opts.track;
    el.innerHTML = toolbar + `
      ${track ? `<div class="track-count"><span class="bad">${still.length} Still learning</span><span class="ok">Know ${know.length}</span></div>` : ''}
      <div class="fc-stage ${full ? 'full' : ''}">
        <div class="flash ${flipped ? 'flipped' : ''}" data-act="flip" tabindex="0" role="button" aria-label="Flip card">
          <div class="face">${sideHTML(c, opts.front)}</div>
          <div class="face back">${sideHTML(c, back())}</div>
        </div>
      </div>
      <div class="fc-nav">
        ${track ? `<button class="round bad" data-act="still" title="Still learning (←)">✕</button>`
                : `<button class="round" data-act="prev" title="Previous (←)" aria-label="Previous">←</button>`}
        <span class="fc-count">${i + 1} / ${deck.length}</span>
        ${track ? `<button class="round ok" data-act="know" title="Know (→)">✓</button>`
                : `<button class="round" data-act="next" title="Next (→)" aria-label="Next">→</button>`}
      </div>
      <div class="meter thin"><i style="width:${((i + 1) / deck.length) * 100}%"></i></div>
      <p class="hint">Space to flip · ${track ? '← still learning · → know' : '← → to move'} · S to star</p>`;
  }

  function flip() {
    flipped = !flipped;
    $('.flash', el)?.classList.toggle('flipped', flipped);
    if (full) { store.touch(set); store.save(); }
  }
  function go(d) {
    if (!deck.length || done) return;
    i = (i + d + deck.length) % deck.length;
    flipped = false;
    render();
  }
  function mark(known) {
    if (done || !deck.length) return;
    (known ? know : still).push(deck[i]);
    if (i === deck.length - 1) {
      done = true;
      store.logSession(set, { mode: 'flashcards', correct: know.length, total: deck.length });
    } else i++;
    flipped = false;
    render();
  }
  function star() {
    const c = deck[i];
    if (!c || done) return;
    store.toggleStar(set, c);
    el.querySelectorAll('[data-act="star"]').forEach(b => b.classList.toggle('on', c.starred));
  }

  el.onclick = e => {
    const t = e.target.closest('[data-act], [data-opt]');
    if (!t) return;
    if (t.dataset.opt) { opts[t.dataset.opt] = !opts[t.dataset.opt]; store.save(); return build(); }
    const act = t.dataset.act;
    if (act === 'flip') flip();
    else if (act === 'star') star();
    else if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'know') mark(true);
    else if (act === 'still') mark(false);
    else if (act === 'review') build(opts.shuffle ? shuffle(still) : still);
    else if (act === 'restart') build();
    else if (act === 'front') { opts.front = back(); store.save(); flipped = false; render(); }
  };

  const off = onKey(e => {
    if (ignoreKey(e) || !el.isConnected) return;
    const track = full && opts.track;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') track ? mark(true) : go(1);
    else if (e.key === 'ArrowLeft') track ? mark(false) : go(-1);
    else if (e.key.toLowerCase() === 's') star();
  });

  build();
  return off;
}
