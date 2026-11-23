// Write mode (classic Quizlet Write): type every answer from memory.
// A miss must be copied out correctly before moving on. Each round re-asks
// only the terms you missed, until you get them all.
import * as store from '../store.js';
import { $, esc, shuffle, plural, modal, ignoreKey, onKey } from '../ui.js';
import { grade } from '../grading.js';
import { LABEL, text, face, pickSides, studyCards, modeHeader, needsCards } from '../cards.js';
import { notFound } from './common.js';

export function writeView(root, id) {
  const set = store.getSet(id);
  if (!set) return notFound(root);
  const opts = set.writeOptions;

  let round = 1, queue = [], total = 0, correct = [], missed = [];
  let q = null, state = 'question'; // 'question' | 'feedback' | 'summary'
  let timer = null;

  function start(cards) {
    queue = shuffle(cards);
    total = queue.length;
    correct = []; missed = [];
    next();
  }

  function next() {
    clearTimeout(timer);
    if (!queue.length) {
      state = 'summary';
      store.logSession(set, { mode: 'write', correct: correct.length, total, round });
      return render();
    }
    q = { card: queue.shift(), ...pickSides(opts.answerWith) };
    state = 'question';
    render();
    $('#answer', root)?.focus();
  }

  function submit(given) {
    const g = grade(given, text(q.card, q.a));
    Object.assign(q, { given, result: g.result, note: g.note });
    if (g.result === 'wrong') missed.push(q.card); else correct.push(q.card);
    store.touch(set);
    store.save();
    state = 'feedback';
    render();
    if (g.result === 'correct') timer = setTimeout(next, 800);
    else $('#copy', root)?.focus();
  }

  function override() {
    missed = missed.filter(c => c !== q.card);
    correct.push(q.card);
    next();
  }

  function header() {
    return modeHeader(set, `Write${round > 1 ? ` <span class="muted small">· Round ${round}</span>` : ''}`,
      '<button class="btn small" data-act="options">⚙ Options</button>');
  }

  function render() {
    const cards = studyCards(set, opts.starredOnly);
    if (!cards.length) { root.innerHTML = header() + needsCards(set, opts.starredOnly); return; }

    if (state === 'summary') {
      const pct = total ? Math.round((correct.length / total) * 100) : 0;
      root.innerHTML = header() + `<div class="round-summary panel">
          <h2>${missed.length ? `Round ${round}: ${correct.length} / ${total} correct (${pct}%)` : `🎉 Round ${round}: all ${total} correct!`}</h2>
          ${missed.length ? `<p class="muted">Practice the ${plural(missed.length, 'term')} you missed:</p>
            <div class="summary-list">${missed.map(c => `<div class="summary-item"><span class="badge">❌</span>
              <span class="t">${face(c, 'term')}</span><span>${face(c, 'def')}</span></div>`).join('')}</div>` : ''}
          <div class="row gap wrap" style="margin-top:16px">
            ${missed.length ? `<button class="btn primary" data-act="missed">Continue with ${plural(missed.length, 'missed term')}</button>` : ''}
            <button class="btn ${missed.length ? '' : 'primary'}" data-act="restart">Start over</button>
            <a class="btn ghost" href="#/set/${set.id}">Back to set</a>
          </div></div>`;
      return;
    }

    const remaining = queue.length + (state === 'question' ? 1 : 0);
    const stats = `<div class="track-count" style="max-width:820px">
        <span class="muted">Remaining ${remaining}</span>
        <span><span class="ok">Correct ${correct.length}</span> · <span class="bad">Incorrect ${missed.length}</span></span></div>`;
    let body = `<div class="q-top"><span class="q-label">${LABEL[q.q]}</span></div>
      <div class="q-prompt lg">${face(q.card, q.q)}</div>`;

    if (state === 'question') {
      body += `<form class="write-row" data-form="answer">
          <input class="input" id="answer" autocomplete="off" spellcheck="false" placeholder="Type the ${LABEL[q.a].toLowerCase()}">
          <button class="btn primary">Answer</button></form>
        <div class="q-foot"><span></span><button type="button" class="link-btn" data-act="dunno">Don't know?</button></div>`;
    } else if (q.result === 'correct') {
      body += `<div class="feedback ok">✓ Correct!</div><div class="answer-box ok"><small>Your answer</small>${esc(q.given)}</div>`;
    } else if (q.result === 'almost') {
      body += `<div class="feedback warn">Almost! ${esc(q.note)} Counted as correct.</div>
        <div class="answer-box"><small>You said</small>${esc(q.given)}</div>
        <div class="answer-box ok"><small>Correct answer</small>${esc(text(q.card, q.a))}</div>
        <div class="continue-bar"><span class="muted small">Press Enter to continue</span><button class="btn primary" data-act="continue" id="copy">Continue</button></div>`;
    } else {
      body += `<div class="feedback bad">${q.given ? 'Incorrect' : 'Here’s the answer'}</div>
        ${q.given ? `<div class="answer-box bad"><small>You said</small>${esc(q.given)}</div>` : ''}
        <div class="answer-box ok"><small>Correct answer</small>${esc(text(q.card, q.a)) || face(q.card, q.a)}</div>
        <p class="q-instr" style="margin-top:18px">Type the correct answer to continue</p>
        <form class="write-row" data-form="copy">
          <input class="input" id="copy" autocomplete="off" spellcheck="false" placeholder="Copy the correct answer">
          <button class="btn primary">Continue</button></form>
        ${q.given ? '<div class="q-foot"><span></span><button type="button" class="link-btn" data-act="override">Override: I was right</button></div>' : ''}`;
    }
    root.innerHTML = header() + stats + `<div class="q-card">${body}</div>`;
  }

  function optionsDialog() {
    const sel = v => (v === opts.answerWith ? 'selected' : '');
    modal({
      title: 'Write options',
      body: `<label class="opt-row">Answer with <select class="input mini" id="o-aw">
          <option value="term" ${sel('term')}>Term</option><option value="definition" ${sel('definition')}>Definition</option><option value="both" ${sel('both')}>Both</option></select></label>
        <label class="opt-row">Study starred terms only <input type="checkbox" class="switch" id="o-star" ${opts.starredOnly ? 'checked' : ''}></label>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Save & restart', kind: 'primary', onClick: el => {
          opts.answerWith = $('#o-aw', el).value;
          opts.starredOnly = $('#o-star', el).checked;
          store.save();
          round = 1;
          start(studyCards(set, opts.starredOnly));
        } },
      ],
    });
  }

  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'dunno') submit('');
    else if (act === 'continue') next();
    else if (act === 'override') override();
    else if (act === 'missed') { round++; start(missed); }
    else if (act === 'restart') { round = 1; start(studyCards(set, opts.starredOnly)); }
    else if (act === 'options') optionsDialog();
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === 'answer') {
      const v = $('#answer', root).value;
      if (v.trim()) submit(v); else $('#answer', root).focus();
    } else if (form === 'copy') {
      const input = $('#copy', root);
      if (grade(input.value, text(q.card, q.a)).result !== 'wrong') next();
      else { input.select(); input.style.borderColor = 'var(--bad)'; }
    }
  });
  const off = onKey(e => {
    if (ignoreKey(e) || state !== 'summary' || e.key !== 'Enter') return;
    $('.round-summary .btn.primary', root)?.click();
  });

  start(studyCards(set, opts.starredOnly));
  return () => { off(); clearTimeout(timer); };
}
