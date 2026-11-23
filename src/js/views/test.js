// Test mode: pick question count and types, answer everything on one page,
// submit, then review a graded results page. Scores are saved to the set.
import * as store from '../store.js';
import { $, $$, esc, shuffle, toast } from '../ui.js';
import { grade } from '../grading.js';
import { LABEL, text, face, pickSides, distractors, studyCards, modeHeader, needsCards } from '../cards.js';
import { notFound } from './common.js';

const TYPES = [['tf', 'True / False'], ['mc', 'Multiple choice'], ['written', 'Written']];
const SECTION = { tf: 'True or false', mc: 'Multiple choice', written: 'Written' };

export function testView(root, id) {
  const set = store.getSet(id);
  if (!set) return notFound(root);
  const o = set.testOptions;
  let questions = [];
  let startedAt = 0;

  // ---------- Setup ----------
  function renderSetup() {
    const max = studyCards(set, o.starredOnly).length;
    if (!set.cards.length) { root.innerHTML = modeHeader(set, 'Test') + needsCards(set); return; }
    const sel = v => (v === o.answerWith ? 'selected' : '');
    root.innerHTML = modeHeader(set, 'Test') + `
      <div class="panel narrow">
        <h2>Set up your test</h2>
        <label class="opt-row">Questions <span class="row gap">
          <input type="number" class="input mini" id="t-count" min="1" max="${max}" value="${Math.max(1, Math.min(o.count, max))}" style="width:80px">
          <span class="muted small" id="t-max">of ${max}</span></span></label>
        <label class="opt-row">Answer with <select class="input mini" id="t-aw">
          <option value="term" ${sel('term')}>Term</option><option value="definition" ${sel('definition')}>Definition</option><option value="both" ${sel('both')}>Both</option></select></label>
        ${TYPES.map(([k, label]) => `<label class="opt-row">${label} <input type="checkbox" class="switch" data-type="${k}" ${o.types[k] ? 'checked' : ''}></label>`).join('')}
        <label class="opt-row">Starred terms only <input type="checkbox" class="switch" id="t-star" ${o.starredOnly ? 'checked' : ''}></label>
        <button class="btn primary big full" data-act="start" style="margin-top:16px">Start test</button>
      </div>`;
    $('#t-star', root).onchange = e => {
      const n = studyCards(set, e.target.checked).length;
      $('#t-max', root).textContent = `of ${n}`;
      $('#t-count', root).max = n;
    };
  }

  function start() {
    const starredOnly = $('#t-star', root).checked;
    const pool = studyCards(set, starredOnly);
    let types = TYPES.map(([k]) => k).filter(k => $(`[data-type="${k}"]`, root).checked);
    if (!types.length) return toast('Pick at least one question type');
    if (!pool.length) return toast('No starred terms — star some or turn off "Starred terms only"');
    const count = Math.max(1, Math.min(pool.length, Math.floor(+$('#t-count', root).value) || pool.length));
    Object.assign(o, { count, answerWith: $('#t-aw', root).value, starredOnly, types: Object.fromEntries(TYPES.map(([k]) => [k, types.includes(k)])) });
    store.save();

    if (set.cards.length < 2) types = ['written']; // choices need at least 2 cards
    const cards = shuffle(pool).slice(0, count);
    const per = Math.floor(count / types.length), extra = count % types.length;
    questions = [];
    let k = 0;
    types.forEach((type, ti) => {
      for (let j = 0; j < per + (ti < extra ? 1 : 0); j++) questions.push(makeQuestion(cards[k++], type));
    });
    startedAt = Date.now();
    renderTest();
  }

  function makeQuestion(card, type) {
    const q = { card, type, ...pickSides(o.answerWith), answer: null };
    if (type === 'tf') {
      const other = distractors(set.cards, card, q.a, 1)[0];
      q.truth = !other || Math.random() < 0.5;
      q.shown = q.truth ? card : other;
    } else if (type === 'mc') {
      q.options = shuffle([card, ...distractors(set.cards, card, q.a, 3)]);
    }
    return q;
  }

  // ---------- Taking the test ----------
  function questionBody(q, n, graded) {
    const mark = (cond, chosen) => (graded ? (cond ? 'ok' : chosen ? 'bad' : 'faded') : chosen ? 'selected' : '');
    let html = `<div class="q-top"><span class="q-label">${LABEL[q.q]}</span><span class="muted small">${n + 1} of ${questions.length}</span></div>`;
    if (q.type === 'tf') {
      html += `<div class="tf-pair">
          <div><div class="q-prompt md">${face(q.card, q.q)}</div></div>
          <div><span class="q-label">${LABEL[q.a]}</span><div class="q-prompt md">${face(q.shown, q.a)}</div></div>
        </div>
        <div class="choices two">${[true, false].map(v =>
          `<button class="choice ${mark(v === q.truth, q.answer === v)}" data-q="${n}" data-pick="${v}" ${graded ? 'disabled' : ''}><span>${v ? 'True' : 'False'}</span></button>`).join('')}</div>`;
    } else if (q.type === 'mc') {
      html += `<div class="q-prompt md">${face(q.card, q.q)}</div>
        <div class="choices">${q.options.map((opt, i) =>
          `<button class="choice ${mark(opt === q.card, q.answer === i)}" data-q="${n}" data-pick="${i}" ${graded ? 'disabled' : ''}><span class="key">${i + 1}</span><span>${face(opt, q.a)}</span></button>`).join('')}</div>`;
    } else {
      html += `<div class="q-prompt md">${face(q.card, q.q)}</div>`;
      html += graded
        ? `<div class="answer-box ${q.correct ? 'ok' : 'bad'}"><small>Your answer</small>${esc(q.answer || '—')}</div>`
        : `<input class="input" data-written="${n}" autocomplete="off" spellcheck="false" placeholder="Type the ${LABEL[q.a].toLowerCase()}" value="${esc(q.answer || '')}">`;
    }
    if (graded && !q.correct) {
      html += `<div class="answer-box ok"><small>Correct answer</small>${q.type === 'tf'
        ? `${q.truth ? 'True' : 'False'} — ${esc(text(q.card, q.a))}` : esc(text(q.card, q.a)) || face(q.card, q.a)}</div>`;
    }
    return html;
  }

  function listHTML(graded) {
    let last = null;
    return questions.map((q, n) => {
      const head = q.type !== last ? `<div class="test-section">${SECTION[q.type]}</div>` : '';
      last = q.type;
      return `${head}<div class="q-card test-q ${graded ? (q.correct ? 'ok' : 'bad') : ''}">${questionBody(q, n, graded)}</div>`;
    }).join('');
  }

  const answeredCount = () => questions.filter(q => q.answer !== null && q.answer !== '').length;

  function renderTest() {
    root.innerHTML = modeHeader(set, 'Test', `<span class="muted small" id="t-progress">${answeredCount()} / ${questions.length} answered</span>`) +
      `<div class="test">${listHTML(false)}
        <div class="q-card" style="text-align:center"><h3>All done? Ready to submit your test?</h3>
          <button class="btn primary big" data-act="submit">Submit test</button></div></div>`;
    $('#main').scrollTop = 0;
  }

  function submit() {
    const left = questions.length - answeredCount();
    if (left && !confirm(`You have ${left} unanswered ${left === 1 ? 'question' : 'questions'}. Submit anyway?`)) return;
    questions.forEach(q => {
      if (q.type === 'tf') q.correct = q.answer === q.truth;
      else if (q.type === 'mc') q.correct = q.answer !== null && q.options[q.answer] === q.card;
      else q.correct = grade(q.answer || '', text(q.card, q.a)).result !== 'wrong';
    });
    const correct = questions.filter(q => q.correct).length;
    const pct = Math.round((correct / questions.length) * 100);
    store.logSession(set, { mode: 'test', correct, total: questions.length, score: pct });
    const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const msg = pct >= 90 ? "Excellent! You're ready." : pct >= 70 ? 'Good job — almost there!' : pct >= 50 ? 'Keep practicing — you\'re getting there.' : 'Keep studying — try Learn mode.';
    root.innerHTML = modeHeader(set, 'Test results') + `
      <div class="results-head">
        <div class="score-ring" style="--pct:${pct}"><span>${pct}%</span></div>
        <div><h2>${msg}</h2>
          <p><b style="color:var(--ok)">${correct} correct</b> · <b style="color:var(--bad)">${questions.length - correct} incorrect</b> · <span class="muted">${mins} min</span></p>
          <div class="row gap wrap">
            <button class="btn primary" data-act="new">Take a new test</button>
            ${pct < 100 ? `<a class="btn" href="#/set/${set.id}/learn">Study with Learn</a>` : ''}
            <a class="btn ghost" href="#/set/${set.id}">Back to set</a>
          </div></div>
      </div>
      <div class="test">${listHTML(true)}</div>`;
    $('#main').scrollTop = 0;
  }

  // ---------- Events ----------
  root.addEventListener('click', e => {
    const pickBtn = e.target.closest('[data-pick]');
    if (pickBtn && !pickBtn.disabled) {
      const q = questions[+pickBtn.dataset.q];
      q.answer = q.type === 'tf' ? pickBtn.dataset.pick === 'true' : +pickBtn.dataset.pick;
      $$(`[data-q="${pickBtn.dataset.q}"]`, root).forEach(b => b.classList.toggle('selected', b === pickBtn));
      $('#t-progress', root).textContent = `${answeredCount()} / ${questions.length} answered`;
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') start();
    else if (act === 'submit') submit();
    else if (act === 'new') renderSetup();
  });
  root.addEventListener('input', e => {
    const n = e.target.dataset.written;
    if (n == null) return;
    questions[+n].answer = e.target.value;
    $('#t-progress', root).textContent = `${answeredCount()} / ${questions.length} answered`;
  });
  root.addEventListener('keydown', e => {
    // Enter in a written answer jumps to the next written box.
    if (e.key !== 'Enter' || e.target.dataset.written == null) return;
    const inputs = $$('[data-written]', root);
    inputs[inputs.indexOf(e.target) + 1]?.focus();
  });

  renderSetup();
}
