// Learn mode, modelled on Quizlet Learn:
// - Cards are studied in rounds (default 7 cards).
// - A new card gets a multiple-choice question; once right it is "familiar".
// - A familiar card gets a written question; once right it is "mastered".
// - A miss sends the card back to the start and re-asks it later in the same round.
// - A round ends when every card in it has been answered correctly once,
//   then a checkpoint screen shows progress. Progress is saved per card.
import * as store from '../store.js';
import { $, $$, esc, shuffle, plural, modal, confirmDialog, ignoreKey, onKey } from '../ui.js';
import { grade } from '../grading.js';
import { LABEL, text, face, pickSides, distractors, studyCards, modeHeader, masteryBar, needsCards } from '../cards.js';
import { notFound } from './common.js';

const PRAISE = ['Great job!', 'Nice work!', "You're on a roll!", 'Correct!', 'Awesome!', 'Way to go!'];
const pick = a => a[Math.floor(Math.random() * a.length)];

export function learnView(root, id) {
  const set = store.getSet(id);
  if (!set) return notFound(root);
  const opts = set.learnOptions;

  let round = 0;
  let roundCards = [];   // cards in this round
  let queue = [];        // cards still to ask this round
  let missed = new Set();// card ids missed at least once this round
  let q = null;          // current question
  let state = 'question';// 'question' | 'feedback' | 'checkpoint' | 'done'
  let timer = null;

  const pool = () => studyCards(set, opts.starredOnly);
  const stage = c => store.cardProgress(set, c.id).stage;

  function startRound() {
    const remaining = pool().filter(c => stage(c) < 2);
    if (!remaining.length) {
      state = 'done';
      if (pool().length) store.logSession(set, { mode: 'learn', total: pool().length });
      return render();
    }
    // Cards already in progress come first, then new cards in set order.
    const started = shuffle(remaining.filter(c => set.progress[c.id]?.seen));
    const fresh = remaining.filter(c => !set.progress[c.id]?.seen);
    roundCards = [...started, ...fresh].slice(0, opts.roundSize);
    queue = shuffle(roundCards);
    missed = new Set();
    round++;
    next();
  }

  function next() {
    clearTimeout(timer);
    if (!queue.length) { state = 'checkpoint'; return render(); }
    q = makeQuestion(queue.shift());
    state = 'question';
    render();
    $('#answer', root)?.focus();
  }

  function makeQuestion(card) {
    const sides = pickSides(opts.answerWith);
    const canMC = opts.types.mc && set.cards.length >= 2;
    const canWritten = opts.types.written || !canMC;
    const type = canMC && (stage(card) === 0 || !canWritten) ? 'mc' : 'written';
    const question = { card, type, ...sides };
    if (type === 'mc') question.options = shuffle([card, ...distractors(set.cards, card, sides.a, 3)]);
    return question;
  }

  function answer(result, given = '', picked = null) {
    if (state !== 'question') return;
    const p = store.cardProgress(set, q.card.id);
    q.before = { ...p };
    q.wasMissed = missed.has(q.card.id);
    q.result = result;
    q.given = given;
    q.picked = picked;
    p.seen++;
    if (result === 'wrong') {
      p.wrong++;
      p.stage = 0;
      missed.add(q.card.id);
      // Ask it again a couple of questions later in this round.
      queue.splice(Math.min(queue.length, 2 + Math.floor(Math.random() * 2)), 0, q.card);
    } else {
      p.correct++;
      p.stage = Math.min(2, p.stage + 1);
    }
    store.touch(set);
    store.save();
    state = 'feedback';
    render();
    if (result === 'correct') timer = setTimeout(next, 1100);
  }

  // "Override: I was right" for written answers marked wrong.
  function override() {
    const p = store.cardProgress(set, q.card.id);
    Object.assign(p, q.before, { seen: q.before.seen + 1, correct: q.before.correct + 1, stage: Math.min(2, q.before.stage + 1) });
    const idx = queue.indexOf(q.card);
    if (idx >= 0) queue.splice(idx, 1);
    if (!q.wasMissed) missed.delete(q.card.id);
    store.save();
    next();
  }

  // ---------- Rendering ----------
  function header() {
    return modeHeader(set, `Learn${round ? ` <span class="muted small">· Round ${round}</span>` : ''}`,
      '<button class="btn small" data-act="options">⚙ Options</button>');
  }

  function render() {
    if (!pool().length) { root.innerHTML = header() + needsCards(set, opts.starredOnly); return; }
    const progress = `<div class="learn-progress">${masteryBar(set, pool())}</div>`;
    if (state === 'done') return renderDone();
    if (state === 'checkpoint') return renderCheckpoint(progress);
    root.innerHTML = header() + progress + `<div class="q-card">${questionHTML()}</div>`;
  }

  function questionHTML() {
    const { card, type } = q;
    const fb = state === 'feedback';
    const correctText = text(card, q.a);
    let html = `
      <div class="q-top"><span class="q-label">${LABEL[q.q]}</span>
        ${type === 'written' ? '<span class="q-label">✏️ Written</span>' : ''}</div>
      <div class="q-prompt lg">${face(card, q.q)}</div>`;

    if (type === 'mc') {
      html += `<div class="q-instr">${fb ? feedbackLine() : `Choose the matching ${LABEL[q.a].toLowerCase()}`}</div>
        <div class="choices">${q.options.map((o, i) => {
          let cls = '';
          if (fb) cls = o === card ? 'ok' : i === q.picked ? 'bad' : 'faded';
          return `<button class="choice ${cls}" data-choice="${i}" ${fb ? 'disabled' : ''}><span class="key">${i + 1}</span><span>${face(o, q.a)}</span></button>`;
        }).join('')}</div>`;
      if (!fb) html += `<div class="q-foot"><span></span><button class="link-btn" data-act="dunno">Don't know?</button></div>`;
    } else if (!fb) {
      html += `<div class="q-instr">Type the ${LABEL[q.a].toLowerCase()}</div>
        <form class="write-row" data-form="write">
          <input class="input" id="answer" autocomplete="off" spellcheck="false" placeholder="Type the answer">
          <button class="btn primary">Answer</button>
        </form>
        <div class="q-foot"><span></span><button type="button" class="link-btn" data-act="dunno">Don't know?</button></div>`;
    } else {
      html += `<div class="q-instr">${feedbackLine()}</div>`;
      if (q.result === 'correct') html += `<div class="answer-box ok"><small>Your answer</small>${esc(q.given)}</div>`;
      else {
        if (q.given) html += `<div class="answer-box ${q.result === 'almost' ? '' : 'bad'}"><small>You said</small>${esc(q.given)}</div>`;
        else html += `<div class="answer-box"><small>You skipped this</small>—</div>`;
        html += `<div class="answer-box ok"><small>Correct answer</small>${esc(correctText) || face(card, q.a)}</div>`;
      }
    }

    if (fb && q.result !== 'correct') {
      html += `<div class="continue-bar"><span class="muted small">Press any key to continue</span>
        <div class="row gap">
          ${q.type === 'written' && q.result === 'wrong' && q.given ? '<button class="btn ghost" data-act="override">Override: I was right</button>' : ''}
          <button class="btn primary" data-act="continue">Continue</button>
        </div></div>`;
    }
    return html;
  }

  function feedbackLine() {
    if (q.result === 'correct') return `<span class="feedback ok">✓ ${pick(PRAISE)}</span>`;
    if (q.result === 'almost') return `<span class="feedback warn">Almost! ${esc(q.note || '')} We'll count it.</span>`;
    return `<span class="feedback bad">${q.given || q.picked != null ? "No worries, you're still learning!" : "Let's look at the answer."}</span>`;
  }

  function renderCheckpoint(progress) {
    const s = store.setStats(set, pool());
    root.innerHTML = header() + progress + `
      <div class="round-summary panel">
        <h2>🎯 Round ${round} complete — keep it up!</h2>
        <p class="muted">${s.mastered} of ${plural(s.total, 'term')} mastered.${missed.size ? ` You missed ${plural(missed.size, 'term')} this round, so they'll come back.` : ''}</p>
        <div class="summary-list">${roundCards.map(c => {
          const st = store.status(set, c);
          const badge = st === 'mastered' ? '✅' : missed.has(c.id) ? '🔁' : '🟡';
          return `<div class="summary-item"><span class="badge" title="${st}">${badge}</span><span class="t">${face(c, 'term')}</span><span>${face(c, 'def')}</span></div>`;
        }).join('')}</div>
        <div class="row gap"><span class="muted small">Press Enter to continue</span><span class="spacer"></span>
          <button class="btn primary big" data-act="next-round">Continue to round ${round + 1}</button></div>
      </div>`;
  }

  function renderDone() {
    root.innerHTML = header() + `
      <div class="panel narrow" style="text-align:center">
        <div style="font-size:52px">🎉</div>
        <h2>You've mastered all ${plural(pool().length, 'term')}!</h2>
        <p class="muted">Great studying. Test yourself to lock it in.</p>
        <div class="row gap wrap" style="justify-content:center;margin-top:16px">
          <a class="btn primary" href="#/set/${set.id}/test">📝 Take a practice test</a>
          <button class="btn" data-act="restart">Learn again from the start</button>
          <a class="btn ghost" href="#/set/${set.id}">Back to set</a>
        </div>
      </div>`;
  }

  // ---------- Options ----------
  function optionsDialog() {
    const sel = (v, cur) => (v === cur ? 'selected' : '');
    modal({
      title: 'Learn options',
      body: `
        <label class="opt-row">Answer with
          <select class="input mini" id="o-aw">
            <option value="term" ${sel('term', opts.answerWith)}>Term</option>
            <option value="definition" ${sel('definition', opts.answerWith)}>Definition</option>
            <option value="both" ${sel('both', opts.answerWith)}>Both</option>
          </select></label>
        <label class="opt-row">Multiple choice questions <input type="checkbox" class="switch" id="o-mc" ${opts.types.mc ? 'checked' : ''}></label>
        <label class="opt-row">Written questions <input type="checkbox" class="switch" id="o-w" ${opts.types.written ? 'checked' : ''}></label>
        <label class="opt-row">Study starred terms only <input type="checkbox" class="switch" id="o-star" ${opts.starredOnly ? 'checked' : ''}></label>
        <label class="opt-row">Terms per round
          <select class="input mini" id="o-round">${[5, 7, 10, 15, 20].map(n => `<option ${sel(n, opts.roundSize)}>${n}</option>`).join('')}</select></label>
        <div class="opt-row"><span>Start over</span><button class="btn danger-ghost small" id="o-reset">Reset Learn progress</button></div>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Save', kind: 'primary', onClick: el => {
          const mc = $('#o-mc', el).checked, w = $('#o-w', el).checked;
          if (!mc && !w) { $('#o-w', el).checked = true; return false; }
          Object.assign(opts, {
            answerWith: $('#o-aw', el).value,
            types: { mc, written: w },
            starredOnly: $('#o-star', el).checked,
            roundSize: +$('#o-round', el).value,
          });
          store.save();
          restart();
        } },
      ],
      onMount: (el, close) => {
        $('#o-reset', el).onclick = async () => {
          close();
          if (await confirmDialog('Reset Learn progress?', 'All terms go back to "Not studied".', 'Reset')) {
            store.resetProgress(set, pool());
            restart();
          }
        };
      },
    });
  }

  function restart() { clearTimeout(timer); round = 0; startRound(); }

  // ---------- Events ----------
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-choice], [data-act]');
    if (!t) return;
    if (t.dataset.choice != null) {
      const i = +t.dataset.choice;
      return answer(q.options[i] === q.card ? 'correct' : 'wrong', '', i);
    }
    const act = t.dataset.act;
    if (act === 'dunno') answer('wrong');
    else if (act === 'continue') next();
    else if (act === 'override') override();
    else if (act === 'next-round') startRound();
    else if (act === 'options') optionsDialog();
    else if (act === 'restart') { store.resetProgress(set, pool()); restart(); }
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    const given = $('#answer', root).value;
    if (!given.trim()) return $('#answer', root).focus();
    const g = grade(given, text(q.card, q.a));
    q.note = g.note;
    answer(g.result, given);
  });

  const off = onKey(e => {
    if (ignoreKey(e)) return;
    if (state === 'question' && q.type === 'mc' && /^[1-4]$/.test(e.key)) {
      $(`[data-choice="${+e.key - 1}"]`, root)?.click();
    } else if (state === 'feedback' && (e.key.length === 1 || e.key === 'Enter')) {
      if (e.target.closest('button')) return; // let the focused button handle it
      e.preventDefault();
      next();
    } else if (state === 'checkpoint' && e.key === 'Enter') {
      startRound();
    }
  });

  startRound();
  return () => { off(); clearTimeout(timer); };
}
