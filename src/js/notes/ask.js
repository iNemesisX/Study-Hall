// Ask AI about the notes. Highlight text (or select a picture, or drag a box over
// any area) and a small chat button appears beside it, like Grammarly's. It opens
// a chat panel where the student can ask about that part and keep asking follow-ups.
// Answers can be inserted into the notes, marked as AI answers.
import { $, $$, h, esc, toast, menu } from '../ui.js';
import { sectionHtml, htmlToText } from './render.js';
import { byText, WARNING } from './aicredit.js';
import { fail, ensureAi } from './aiui.js';
import { touchFirst } from '../platform.js';

const api = window.studyhall?.notes;
const QUICK = [
  ['Explain in more detail', 'Explain this in more detail.'],
  ['Explain it simply', 'Explain this simply, as if I\'m new to the topic.'],
  ['How do I derive this?', 'How do I derive this? Show each step.'],
  ['Give me an example', 'Give me a worked example of this.'],
  ['Why does this matter?', 'Why does this matter, and how does it connect to the rest of the topic?'],
  ['Quiz me on this', 'Ask me 3 short questions to check I understand this, with the answers at the end.'],
];
const BLOCK = 'p, li, h3, td, th, .def, .formula, .callout, .example, details, .ai-answer';
// "Look it up": search for the topic yourself.
const LOOKUP = [
  ['Google', '🔎', q => `https://www.google.com/search?q=${encodeURIComponent(q)}`],
  ['Wikipedia', '📖', q => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`],
  ['YouTube', '▶', q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`],
  ['Khan Academy', '🎓', q => `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(q)}`],
];
const openLink = url => window.open(url, '_blank', 'noopener');
const CHECK = {
  agrees: w => ['ok', `✓ Checked against ${w}: it agrees.`],
  differs: (w, n) => ['bad', `⚠ Differs from ${w}${n ? `: ${n}` : '. Compare the sources below.'}`],
  not_covered: w => ['warn', `${w} doesn't cover this exactly, so check it yourself.`],
  none: () => ['warn', 'Not checked: no matching reference was found. Use Look it up to check.'],
};

/** c: { nb, page(), paper(), scroller(), root, mode(), save(), flush() } */
export function createAsk(c) {
  let bubble = null;      // the little chat button
  let panel = null;       // the chat panel
  let thread = [];        // [{ q, blocks, by }]
  let ctx = null;         // what's being asked about: { kind: 'text'|'area'|'page', text, image?, topicId, after? , label }
  let areaTool = null;    // overlay while dragging a box

  const paper = () => c.paper();
  const topicOf = node => node?.closest?.('.pg-topic');

  /* ---------- the chat button ---------- */
  function hideBubble() { bubble?.remove(); bubble = null; }
  function showBubble(rect, onOpen, label = 'Ask AI about this') {
    hideBubble();
    bubble = h('button', {
      class: 'ask-bubble', title: label, 'aria-label': label,
      onmousedown: e => e.preventDefault(), // keep the text selection
      onclick: e => { e.stopPropagation(); hideBubble(); onOpen(); },
    }, h('span', { class: 'ask-bubble-ico', text: '✨' }), h('span', { class: 'ask-bubble-txt', text: 'Ask' }));
    document.body.append(bubble);
    const below = touchFirst(); // on tablets the system's own copy/paste bar sits above the selection
    const x = Math.min(innerWidth - 90, Math.max(8, rect.right + 6));
    const y = below ? Math.min(innerHeight - 50, rect.bottom + 10) : Math.max(8, rect.top - 40);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  // Text selection inside the notes -> chat button.
  let selTimer = null;
  const onSelection = () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      if (panel?.contains(document.activeElement) || areaTool) return;
      const sel = getSelection();
      const node = sel.rangeCount && sel.anchorNode;
      const text = sel.toString().trim();
      const inNotes = node && paper()?.contains(node) && (node.nodeType === 1 ? node : node.parentElement)?.closest('.pg-text, .pg-topic h2');
      if (c.mode() !== 'text' || !inNotes || text.length < 2) { if (!bubble?.matches(':hover')) hideBubble(); return; }
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const last = rects[rects.length - 1] || range.getBoundingClientRect();
      const saved = range.cloneRange();
      showBubble(last, () => open({ kind: 'text', text, topicId: topicOf(inNotes)?.dataset.id, after: saved, label: text }));
    }, 180);
  };
  document.addEventListener('selectionchange', onSelection);
  const onScroll = () => hideBubble();
  const onKey = e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); askAboutSelection(); }
    if (e.key === 'Escape' && areaTool) stopArea();
  };
  document.addEventListener('keydown', onKey);

  /** Home tab "Ask AI": the selected text if there is some, otherwise the whole page. */
  function askAboutSelection() {
    const sel = getSelection();
    const text = sel.toString().trim();
    const node = sel.rangeCount && sel.anchorNode;
    const inNotes = node && paper()?.contains(node) && (node.nodeType === 1 ? node : node.parentElement)?.closest('.pg-text');
    if (text.length > 1 && inNotes) return open({ kind: 'text', text, topicId: topicOf(inNotes)?.dataset.id, after: sel.getRangeAt(0).cloneRange(), label: text });
    open({ kind: 'page', label: 'This whole page' });
  }

  /* ---------- asking about an area: drag a box ---------- */
  function startArea() {
    if (areaTool) return;
    hideBubble();
    const box = h('div', { class: 'ask-box' });
    areaTool = h('div', { class: 'ask-area' }, h('div', { class: 'ask-area-hint', text: 'Drag a box around what you want to ask about · Esc to cancel' }), box);
    c.root.append(areaTool);
    const host = c.root.getBoundingClientRect();
    let start = null;
    areaTool.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { areaTool.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      start = { x: e.clientX, y: e.clientY };
    });
    areaTool.addEventListener('pointermove', e => {
      if (!start) return;
      const r = { left: Math.min(start.x, e.clientX), top: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) };
      box.style.cssText = `display:block;left:${r.left - host.left}px;top:${r.top - host.top}px;width:${r.width}px;height:${r.height}px`;
    });
    areaTool.addEventListener('pointerup', e => {
      if (!start) return;
      const rect = { left: Math.min(start.x, e.clientX), top: Math.min(start.y, e.clientY), right: Math.max(start.x, e.clientX), bottom: Math.max(start.y, e.clientY) };
      start = null;
      stopArea();
      if (rect.right - rect.left < 12 || rect.bottom - rect.top < 12) return;
      askAboutRect(rect, 'the selected area');
    });
  }
  function stopArea() { areaTool?.remove(); areaTool = null; }

  /** Collects the text under a screen rectangle and draws its pictures and handwriting into an image. */
  async function askAboutRect(rect, label) {
    const hits = el => { const r = el.getBoundingClientRect(); return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom; };
    const blocks = $$(`.pg-text :is(${BLOCK}), .pg-topic > h2`, paper()).filter(el => hits(el) && !el.parentElement.closest(BLOCK));
    const text = blocks.map(el => htmlToText(el.outerHTML) || el.textContent.trim()).filter(Boolean).join('\n');
    const image = await capture(rect);
    const mid = document.elementsFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2).find(el => el.closest?.('.pg-topic'));
    open({ kind: 'area', text, image, topicId: topicOf(mid)?.dataset.id, label, rect });
  }
  /** For a picture's own chat button. */
  function askAboutPicture(el) { askAboutRect(el.getBoundingClientRect(), el.closest('.pg-pic')?.classList.contains('diagram') ? 'this diagram' : 'this picture'); }

  async function capture(rect) {
    const scale = 2;
    const W = Math.round(rect.right - rect.left), H = Math.round(rect.bottom - rect.top);
    const canvas = h('canvas', { width: W * scale, height: H * scale });
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    let drew = false;
    const place = el => { const r = el.getBoundingClientRect(); return [r.left - rect.left, r.top - rect.top, r.width, r.height, r]; };
    const svgImage = (svg, w, hgt) => new Promise(resolve => {
      const copy = svg.cloneNode(true);
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', w); copy.setAttribute('height', hgt);
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    });
    for (const pic of $$('.pg-pic', paper())) {
      const [x, y, w, hgt, r] = place(pic);
      if (r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom) continue;
      const img = $('img', pic);
      if (img?.complete && img.naturalWidth) { g.drawImage(img, x, y, w, hgt); drew = true; }
      const art = $('.dg-art', pic);
      if (art) {
        const im = await svgImage(art, w, hgt);
        if (im) { g.drawImage(im, x, y, w, hgt); drew = true; }
        g.font = `600 ${Math.max(10, w * 0.027)}px sans-serif`; g.fillStyle = '#1f2937'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const l of $$('.dg-label', pic)) { const [lx, ly, lw, lh] = place(l); g.fillText(l.textContent, lx + lw / 2, ly + lh / 2); }
      }
    }
    for (const svg of $$('svg.pg-ink', paper())) {
      if (!svg.querySelector('path')) continue;
      const [x, y, w, hgt, r] = place(svg);
      if (r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom) continue;
      const im = await svgImage(svg, w, hgt);
      if (im) { g.drawImage(im, x, y, w, hgt); drew = true; }
    }
    if (!drew) return null;
    return new Uint8Array(await (await new Promise(res => canvas.toBlob(res, 'image/png'))).arrayBuffer());
  }

  /* ---------- the chat panel ---------- */
  function open(context) {
    hideBubble();
    ctx = context;
    thread = [];
    if (!panel) {
      panel = h('aside', { class: 'ask-panel', role: 'dialog', 'aria-label': 'Ask AI' });
      c.root.append(panel);
    }
    c.root.classList.add('asking');
    draw();
    setTimeout(() => $('textarea', panel)?.focus(), 50);
  }
  const lookupQuery = () => (ctx?.text ? ctx.text.replace(/\s+/g, ' ').slice(0, 120) : (c.page()?.title || ''));
  function lookUp(anchor, q = lookupQuery()) {
    menu(anchor, [{ head: `Look up "${q.length > 40 ? `${q.slice(0, 40)}…` : q}"` }, ...LOOKUP.map(([name, icon, url]) => ({ label: name, icon, onClick: () => openLink(url(q)) }))]);
  }
  function close() { panel?.remove(); panel = null; c.root.classList.remove('asking'); thread = []; ctx = null; }

  function draw() {
    if (!panel) return;
    const quote = ctx.kind === 'page' ? h('div', { class: 'ask-ctx' }, h('b', { text: 'Asking about' }), h('span', { text: 'This whole page' }))
      : h('div', { class: 'ask-ctx' }, h('b', { text: 'Asking about' }),
        ctx.image ? h('img', { class: 'ask-ctx-img', alt: '', src: URL.createObjectURL(new Blob([ctx.image], { type: 'image/png' })) }) : null,
        ctx.text ? h('blockquote', { text: ctx.text.length > 280 ? `${ctx.text.slice(0, 280)}…` : ctx.text }) : null,
        !ctx.text && !ctx.image ? h('span', { class: 'muted', text: 'Nothing was found in that area. Try a bigger box.' }) : null);
    const input = h('textarea', {
      class: 'input', rows: 2, placeholder: thread.length ? 'Ask a follow-up question…' : 'Ask anything about this…',
      onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } },
    });
    const list = h('div', { class: 'ask-thread' }, thread.map(turn => [
      h('div', { class: 'ask-q', text: turn.q }),
      turn.pending ? h('div', { class: 'ask-a pending' }, h('div', { class: 'spinner small' }), h('span', { text: 'Thinking…' }))
        : turn.error ? h('div', { class: 'ask-a error', text: turn.error })
          : h('div', { class: 'ask-a' },
            h('div', { class: 'ask-a-body', html: sectionHtml({ heading: '', summary: '', blocks: turn.blocks }, false) }),
            checkLine(turn),
            h('div', { class: 'ask-a-foot' },
              h('span', { class: 'ask-credit', title: WARNING, text: `✨ ${byText([turn.by])} · AI answers can be wrong` }),
              h('span', { class: 'spacer' }),
              c.readonly?.() ? null : h('button', { class: 'btn small', text: turn.inserted ? '✓ Inserted' : '↧ Insert into notes', disabled: turn.inserted, onclick: () => insert(turn) }),
              h('button', { class: 'btn small ghost', text: 'Copy', onclick: () => copy(turn) }))),
    ]));
    panel.replaceChildren(
      h('div', { class: 'ask-head' }, h('b', { text: '✨ Ask AI' }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', text: '🔎 Look it up', title: 'Search Google, Wikipedia, YouTube or Khan Academy yourself', onclick: e => lookUp(e.currentTarget) }),
        h('button', { class: 'btn small ghost', text: '⬚ Select an area', title: 'Drag a box around a diagram, drawing or part of the page to ask about it', onclick: () => { close(); startArea(); } }),
        h('button', { class: 'icon-btn', title: 'Close', text: '✕', onclick: close })),
      quote, list,
      !thread.some(t => t.pending) ? h('div', { class: 'ask-chips' }, QUICK.map(([label, q]) => h('button', { class: 'chip-btn', text: label, onclick: () => send(q) }))) : null,
      h('div', { class: 'ask-input' }, input, h('button', { class: 'btn primary', text: 'Ask', onclick: () => send(input.value) })),
      h('p', { class: 'muted small ask-note', text: 'Uses your notes on this page for context. Each question uses one AI request.' }));
    list.scrollTop = list.scrollHeight;
  }

  async function send(q) {
    q = String(q || '').trim();
    if (!q || thread.some(t => t.pending)) return;
    if (!(await ensureAi())) return;
    const turn = { q, pending: true };
    thread.push(turn);
    draw();
    const page = c.page();
    try {
      const res = await api.ask({
        question: q, selection: ctx.text || '', imageBytes: ctx.image || undefined,
        notebookName: c.nb.name, pageTitle: page.title,
        context: page.topics.map(t => `## ${t.heading}\n${htmlToText(t.html)}`).join('\n\n'),
        history: thread.filter(t => t !== turn && t.blocks).map(t => ({ q: t.q, a: htmlToText(sectionHtml({ heading: '', summary: '', blocks: t.blocks }, false)) })),
      });
      Object.assign(turn, { pending: false, blocks: res.blocks, by: res.by, check: res.check, sources: res.sources || [], checkedWith: res.checkedWith, notice: res.notice });
    } catch (e) {
      turn.pending = false;
      const msg = String(e?.message || e);
      if (msg.includes('NO_KEY')) { thread.pop(); draw(); return fail(e); }
      turn.error = msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    }
    draw();
  }

  // How the answer was checked, and its sources.
  function checkLine(turn) {
    if (!turn.check) return null;
    const who = turn.checkedWith === 'web' ? 'a web search' : 'Wikipedia';
    const [kind, text] = (CHECK[turn.check.status] || CHECK.none)(who, turn.check.note);
    return h('div', { class: `ask-check ${kind}` },
      h('div', { text }),
      turn.notice ? h('div', { class: 'muted small', text: turn.notice }) : null,
      turn.sources?.length ? h('div', { class: 'ask-sources' }, h('span', { class: 'muted small', text: 'Sources: ' }),
        turn.sources.map((src, i) => h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer', text: `[${i + 1}] ${src.title}`, onclick: e => { e.preventDefault(); openLink(src.url); } }))) : null,
      h('button', { class: 'link-btn small', text: '🔎 Look it up yourself', onclick: e => lookUp(e.currentTarget, `${lookupQuery()} ${turn.q}`.slice(0, 160)) }));
  }

  // Puts an answer into the notes: after the selected passage, or at the end of its part of the page.
  function insert(turn) {
    const page = c.page();
    const sources = turn.sources?.length ? `<p class="ai-sources">${turn.checkedWith === 'web' ? 'Checked with a web search' : 'Checked against Wikipedia'}: ${turn.sources.map(src => `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)}</a>`).join(', ')}</p>` : '';
    const html = `<div class="ai-answer"><div class="ai-answer-tag" contenteditable="false">✨ AI answer to "${esc(turn.q)}" · ${esc(byText([turn.by]))} · can be wrong</div>${sectionHtml({ heading: '', summary: '', blocks: turn.blocks }, false)}${sources}</div><p><br></p>`;
    let text = null;
    const anchor = ctx.after?.endContainer;
    let blockEl = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest(BLOCK);
    if (blockEl && !paper().contains(blockEl)) blockEl = null;
    if (blockEl) {
      while (blockEl.parentElement && !blockEl.parentElement.classList.contains('pg-text')) blockEl = blockEl.parentElement;
      blockEl.insertAdjacentHTML('afterend', html);
      text = blockEl.closest('.pg-text');
    } else {
      const topic = $(`.pg-topic[data-id="${ctx.topicId}"]`, paper()) || $$('.pg-topic', paper()).pop();
      if (!topic) return toast('Add some notes to the page first');
      text = $('.pg-text', topic);
      text.insertAdjacentHTML('beforeend', html);
    }
    text.dispatchEvent(new Event('input'));
    turn.inserted = true;
    draw();
    text.querySelector('.ai-answer:last-of-type')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast('Answer added to your notes');
  }
  async function copy(turn) {
    const text = htmlToText(sectionHtml({ heading: '', summary: '', blocks: turn.blocks }, false));
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); }
  }

  return {
    askAboutSelection, startArea, askAboutPicture, open, close,
    isOpen: () => !!panel, thread: () => thread, hideBubble, onScroll,
    dispose() { document.removeEventListener('selectionchange', onSelection); document.removeEventListener('keydown', onKey); hideBubble(); stopArea(); close(); },
  };
}
