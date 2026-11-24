// A notebook page: title, photos, AI-written notes split into topics, and
// text + ink annotation. The ribbon (ribbon.js) drives it through `ctrl`.
import * as nbstore from '../notes/nbstore.js';
import * as ribbon from './ribbon.js';
import { $, $$, esc, uid, h, plural, modal, menu, confirmDialog, toast, busy } from '../ui.js';
import { sectionHtml } from '../notes/render.js';
import { Ink, InkHistory } from '../notes/ink.js';
import { prefs, toolSpec, inkBar } from '../notes/inkbar.js';
import { fail, errText, ensureAi, getSettings, checkBudget } from '../notes/aiui.js';
import { createPics } from '../notes/pics.js';
import { creditHtml, addBy } from '../notes/aicredit.js';
import { platform, fontStack, GENERIC_FONTS } from '../platform.js';
import { kindOf, extOf, docIcon, ACCEPT_DOCS, ACCEPT_AUDIO, prepareDoc, canRecord, startRecording, audioToChunks, formatTime, liveDictation, startLiveDictation } from '../notes/sources.js';
import { createAsk } from '../notes/ask.js';
import * as sync from '../cloud/sync.js';
import { notFound } from './common.js';

const api = nbstore.api;
const MAX_EDGE = 2000; // px, long edge after downscale
const NS = 'http://www.w3.org/2000/svg';

/** Runs async tasks, at most `limit` at a time, returning their results in order. */
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

export function pageView(root, nbId, pageId) {
  const nb = nbstore.get(nbId);
  if (!api || !nb || !nbstore.findPage(nb, pageId)) return notFound(root, 'page');
  root.className = 'pg-root';
  root.innerHTML = '<div class="empty"><p>Opening page…</p></div>';
  try { localStorage.setItem('studyhall-last', JSON.stringify({ nb: nbId, page: pageId })); } catch { /* ignore */ }

  let page = null, mode = 'text', disposed = false, dirty = false, timer = null;
  const readonly = !sync.canEdit(nb); // a notebook someone shared with "Can view"
  let lastInput = 0, remotePending = null;
  let pop = null, captureUi = null, scroller = null, paper = null;
  const urls = new Map();   // image file -> Promise<blob URL>
  const inks = new Map();   // topic id -> Ink
  const history = new InkHistory(() => save());
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { addFiles(e.target.files); e.target.value = ''; } });
  const docPicker = h('input', { type: 'file', accept: ACCEPT_DOCS, multiple: true, hidden: true, onchange: e => { addFiles(e.target.files); e.target.value = ''; } });
  const audioPicker = h('input', { type: 'file', accept: ACCEPT_AUDIO, multiple: true, hidden: true, onchange: e => { addFiles(e.target.files); e.target.value = ''; } });
  // Tablets: take a photo with the device's own camera (the desktop app uses a phone via QR code instead).
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'data-camera': '', onchange: e => { addFiles(e.target.files); e.target.value = ''; } });
  const takePhoto = () => (platform.qr ? phoneDialog() : camera.click());

  /* ----- saving ----- */
  function save() { if (readonly) return; dirty = true; lastInput = Date.now(); clearTimeout(timer); timer = setTimeout(flush, 500); }
  async function flush(force) {
    clearTimeout(timer);
    if (force) dirty = true;
    if (!page || !dirty || readonly) return;
    dirty = false;
    try { await nbstore.savePage(nb, page); } catch (e) { dirty = true; toast(errText(e)); }
  }
  const onUnload = () => { if (page && dirty) nbstore.savePageSync(nb.id, page); };
  window.addEventListener('beforeunload', onUnload);
  // Tablets suspend or close apps in the background without warning: save straight away.
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);

  /* ----- page-wide listeners ----- */
  const onKeys = e => {
    if (!(e.ctrlKey || e.metaKey) || mode === 'text' || $('.modal-backdrop')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); history.redo(); }
  };
  document.addEventListener('keydown', onKeys);
  const onDocDown = e => { if (pop && !pop.contains(e.target)) closePop(); };
  document.addEventListener('mousedown', onDocDown);
  // An image dropped or pasted onto existing notes could be meant either way, so ask.
  function offerImages(files, x, y) {
    const others = [...files].filter(f => kindOf(f) === 'doc' || kindOf(f) === 'audio');
    if (others.length) addFiles(others);
    const imgs = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length || !page) return;
    if (!page.topics.length) return addFiles(imgs);
    const at = pics.pointOn(x, y);
    menu({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }) }, [
      { head: plural(imgs.length, 'image') },
      { label: 'Place in my notes as a picture', icon: '🖼', onClick: () => pics.insertFiles(imgs, at) },
      { label: 'Add as a photo to turn into notes', icon: '✨', onClick: () => addFiles(imgs) },
    ]);
  }
  const onPaste = e => {
    if (!page || $('.modal-backdrop')) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const r = (scroller || root).getBoundingClientRect();
    offerImages(files, r.left + r.width / 2 - 120, r.top + r.height / 3);
  };
  document.addEventListener('paste', onPaste);
  root.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('dropping'); } });
  root.addEventListener('dragleave', e => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('dropping'); });
  root.addEventListener('drop', e => { root.classList.remove('dropping'); if (e.dataTransfer?.files.length) { e.preventDefault(); offerImages(e.dataTransfer.files, e.clientX, e.clientY); } });

  const offCapture = api.onCapture(({ id, image }) => {
    if (disposed || !page || id !== nb.id) return;
    page.images.push(image);
    dirty = true; flush();
    captureUi?.(image);
    render();
  });

  function imageUrl(img) {
    if (!urls.has(img.file)) urls.set(img.file, api.readImage(nb.id, img.file).then(bytes => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))));
    return urls.get(img.file);
  }
  const lazyImg = (img, props = {}) => {
    const el = h('img', { alt: img.name, ...props });
    imageUrl(img).then(u => { el.src = u; }).catch(() => { el.alt = 'Image missing'; });
    return el;
  };

  /* ----- mode (typing vs drawing) ----- */
  function setMode(m) {
    if (readonly && m !== 'text') return toast('This notebook is view only');
    mode = m;
    paper?.classList.toggle('inking', mode !== 'text');
    ribbon.refresh();
  }
  const inText = fn => { if (mode !== 'text') setMode('text'); fn(); };

  /* ----- fonts ----- */
  // The ribbon's font boxes take focus, so remember the last text selection and put it back.
  let lastRange = null;
  const onSelection = () => {
    const sel = getSelection();
    const inNotes = sel.rangeCount && paper?.contains(sel.anchorNode) && sel.anchorNode.parentElement?.closest('.pg-text');
    lastRange = inNotes ? sel.getRangeAt(0).cloneRange() : null;
  };
  document.addEventListener('selectionchange', onSelection);
  function selectedText() {
    if (!lastRange || lastRange.collapsed || !paper?.contains(lastRange.commonAncestorContainer)) return false;
    const sel = getSelection();
    sel.removeAllRanges(); sel.addRange(lastRange);
    return true;
  }
  const applyPageFont = () => {
    paper?.style.setProperty('--pg-font', page.font ? fontStack(page.font) : '');
    paper?.style.setProperty('--pg-size', page.size ? `${page.size}px` : '');
  };
  // Selected text gets the font; with nothing selected the whole page does.
  function setFont(name) {
    if (!/^[\w ]{1,40}$/.test(name)) return;
    if (selectedText()) exec('fontName', GENERIC_FONTS.find(([label]) => label === name)?.[1] || name);
    else { page.font = name; applyPageFont(); save(); toast(`Page font: ${name}`); }
    ribbon.refresh();
  }
  function setSize(px) {
    if (!(px >= 8 && px <= 48)) return;
    if (selectedText()) {
      exec('fontSize', 7); // marks the selection; swap the browser's size keyword for the real size
      $$('[style*="xxx-large"]', paper).forEach(n => { n.style.fontSize = `${px}px`; });
      $$('font[size="7"]', paper).forEach(n => { n.removeAttribute('size'); n.style.fontSize = `${px}px`; });
      const text = lastRange.commonAncestorContainer.parentElement?.closest('.pg-text') || $('.pg-text', paper);
      text?.dispatchEvent(new Event('input'));
    } else { page.size = px; applyPageFont(); save(); toast(`Page text size: ${px}`); }
    ribbon.refresh();
  }
  const exec = (cmd, value) => inText(() => { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, value); });

  const picPicker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { pics.insertFiles(e.target.files, null); e.target.value = ''; } });
  const pics = createPics({
    nb, page: () => page, paper: () => paper, scroller: () => scroller, root, mode: () => mode, history,
    drawMode: () => { ribbon.setTab('draw'); setMode(prefs.tool); },
    save, flush, imageUrl, lazyImg, downscale, render: () => render(), ribbonRefresh: () => ribbon.refresh(), ask: el => ask.askAboutPicture(el),
    newTopic: () => { const t = { id: uid(), heading: '', html: '<p><br></p>', ink: [], pics: [] }; page.topics.push(t); return t; },
  });

  const ask = createAsk({ nb, page: () => page, paper: () => paper, root, mode: () => mode, save, flush, readonly: () => readonly });

  // Someone else changed this page (shared notebooks): show it, unless the student is typing right now.
  const applyRemote = () => {
    if (!remotePending || disposed) return;
    if (dirty || Date.now() - lastInput < 2500 || paper?.contains(document.activeElement) && Date.now() - lastInput < 8000) { setTimeout(applyRemote, 1500); return; }
    const { next, by } = remotePending;
    remotePending = null;
    page = next;
    page.images ||= []; page.topics ||= []; page.docs ||= []; page.audio ||= [];
    render();
    toast(`Updated by ${by || 'a collaborator'}`);
  };
  const offRemote = sync.onRemotePage((n, p, by) => {
    if (disposed || n.id !== nb.id || p.id !== page?.id) return;
    remotePending = { next: p, by };
    applyRemote();
  });

  nbstore.loadPage(nbId, pageId).then(loaded => {
    if (disposed) return;
    if (!loaded) { root.className = ''; return notFound(root, 'page'); }
    page = loaded;
    page.images ||= []; page.topics ||= []; page.docs ||= []; page.audio ||= [];
    render();
    ribbon.setPage(ctrl);
  });

  /* ----- layout ----- */
  function render() {
    closePop();
    inks.clear();
    pics.reset();
    const keep = scroller?.scrollTop || 0;
    const fresh = unprocessed().length;
    paper = h('article', { class: `pg-paper ${mode !== 'text' ? 'inking' : ''} ${readonly ? 'readonly' : ''}`, 'data-tour': 'paper' },
      readonly ? h('div', { class: 'pg-readonly', text: `👁 View only. Shared by ${nb.cloud?.owner || 'the owner'}; you can read, study and export, but not change it.` }) : null,
      h('h1', {
        class: 'pg-title', contentEditable: readonly ? 'false' : 'plaintext-only', spellcheck: false, text: page.title === 'Untitled page' ? '' : page.title, 'data-ph': 'Page title',
        oninput: e => { page.title = e.target.textContent.trim().slice(0, 150) || 'Untitled page'; save(); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); ($('.pg-text', paper) || e.target).focus(); } },
      }),
      h('div', { class: 'pg-date', text: `${new Date(page.created || Date.now()).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${page.kind === 'guide' ? '  ·  Study guide' : ''}` }),
      hasSources() ? sourcesTray(fresh) : null,
      page.topics.map(topicNode),
      readonly ? null : page.topics.length ? h('button', { class: 'btn pg-add', text: '＋ Add a heading', onclick: addTopic }) : startHere(),
      aiNotice()); // a small line at the end of the page
    applyPageFont();
    scroller = h('div', { class: 'pg-scroll', onscroll: () => ask.hideBubble() }, paper);
    root.replaceChildren(scroller, picker, camera, picPicker, docPicker, audioPicker, pics.dock());
    page.topics.forEach(t => pics.mount(t, $(`.pg-topic[data-id="${t.id}"]`, paper)));
    pics.layout();
    pics.bindPaper(paper);
    page.topics.forEach(t => {
      const svg = $(`.pg-topic[data-id="${t.id}"] svg`, paper);
      inks.set(t.id, new Ink(svg, t.ink, { getTool: toolSpec(() => mode), onCommit: op => history.push(op), scroller }));
    });
    // A stylus touching the page while typing switches to the last pen and starts the stroke.
    paper.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'pen' || mode !== 'text' || !prefs.autoPen) return;
      const topic = e.target.closest?.('.pg-topic');
      const pic = e.target.closest?.('.pg-pic');
      if (!topic) return;
      e.preventDefault();
      ribbon.setTab('draw');
      setMode(prefs.tool);
      (pic ? pics.inkFor(pic.dataset.pic) : inks.get(topic.dataset.id))?.down(e);
    }, true);
    scroller.scrollTop = keep;
    ribbon.refresh();
  }

  // Which AI wrote this page, and that it can be wrong. Pages from before 2.4 that hold AI notes get a generic notice.
  function aiNotice() {
    let by = page.aiBy;
    if (!by?.length && page.topics.length && (page.kind === 'guide' || page.images.some(i => i.processed))) by = [{ provider: 'unknown' }];
    if (!by?.length) return null;
    return h('div', { html: creditHtml(by, page.kind === 'guide' ? 'This study guide was written' : 'Notes on this page were written', 'pg-credit') }).firstElementChild;
  }

  // Shown on a page with no notes yet: the main things a new user can do.
  function startHere() {
    if (hasSources()) return null;
    return h('div', { class: 'pg-start', 'data-tour': 'start' },
      h('div', { class: 'big-ico', text: '📸' }),
      h('h2', { text: 'Turn photos, documents or recordings into notes' }),
      h('p', { class: 'muted', text: 'Add pictures of slides or handwritten work, a PDF, Word or PowerPoint file, or record the lecture. Study Hall reads them and writes organized notes on this page.' }),
      h('div', { class: 'row gap wrap', style: 'justify-content:center' },
        h('button', { class: 'btn primary', text: '🖼 Choose photos', onclick: () => picker.click() }),
        h('button', { class: 'btn', text: platform.qr ? '📱 Use phone camera' : '📷 Take a photo', onclick: takePhoto }),
        h('button', { class: 'btn', text: '📄 Upload a document', onclick: () => docPicker.click() }),
        canRecord() ? h('button', { class: 'btn', text: '🎙 Record a lecture', onclick: () => recordDialog() }) : null,
        h('button', { class: 'btn', text: '🎧 Audio file', onclick: () => audioPicker.click() }),
        h('button', { class: 'btn ghost', text: '✎ Just start typing', onclick: addTopic })),
      h('p', { class: 'muted small', text: 'You can also drag files onto this page or paste a screenshot with Ctrl+V.' }));
  }
  const hasSources = () => page.images.length + page.docs.length + page.audio.length > 0;
  const unprocessed = () => [...page.images, ...page.docs, ...page.audio].filter(x => !x.processed);

  // Everything the notes are made from: photos, documents and recordings.
  function sourcesTray(fresh) {
    const counts = [page.images.length && plural(page.images.length, 'photo'), page.docs.length && plural(page.docs.length, 'document'), page.audio.length && plural(page.audio.length, 'recording')].filter(Boolean).join(' · ');
    const addMenu = e => menu(e.currentTarget, [
      { label: 'Photos', icon: '🖼', onClick: () => picker.click() },
      { label: platform.qr ? 'Phone camera' : 'Take a photo', icon: platform.qr ? '📱' : '📷', onClick: takePhoto },
      { label: 'Document (PDF, Word, PowerPoint, text)', icon: '📄', onClick: () => docPicker.click() },
      canRecord() ? { label: 'Record a lecture or voice note', icon: '🎙', onClick: () => recordDialog() } : null,
      { label: 'Audio file', icon: '🎧', onClick: () => audioPicker.click() },
    ].filter(Boolean));
    return h('div', { class: `pg-photos ${fresh ? 'fresh' : ''}`, 'data-tour': 'photos' },
      h('div', { class: 'pg-photos-head' },
        h('b', { text: `📎 ${counts}` }),
        h('span', { class: 'muted small', text: fresh ? `${fresh} not in the notes yet` : 'All in the notes. Click a photo to view or mark it up.' }),
        h('span', { class: 'spacer' }),
        fresh ? h('button', { class: 'btn primary small', text: '✨ Turn into notes', title: `Turn ${plural(fresh, 'new source')} into notes`, onclick: () => generate(false) }) : null,
        h('button', { class: 'btn small', text: '＋ Add', title: 'Add photos, documents or recordings', onclick: addMenu })),
      page.images.length ? h('div', { class: 'pg-thumbs' }, page.images.map((img, i) =>
        h('figure', { class: `pg-thumb ${img.processed ? '' : 'new'}` },
          lazyImg(img, { onclick: () => openViewer(img) }),
          h('figcaption', {}, h('span', { text: `${i + 1}${img.processed ? '' : ' · new'}${img.ink?.length ? ' ✎' : ''}` }),
            h('button', { class: 'icon-btn', title: 'Remove photo', text: '✕', onclick: () => removeImage(img) }))))) : null,
      page.docs.length || page.audio.length ? h('div', { class: 'pg-files' },
        page.docs.map(d => h('div', { class: `pg-file ${d.processed ? '' : 'new'}` },
          h('span', { class: 'pg-file-ico', text: docIcon(d.ext) }),
          h('span', { class: 'pg-file-name', text: d.name, title: d.name }),
          h('span', { class: 'muted small', text: `${d.ext.toUpperCase()} · ${sizeText(d.size)}${d.processed ? '' : ' · new'}` }),
          h('button', { class: 'icon-btn', title: 'Remove document', text: '✕', onclick: () => removeSource(d, 'docs') }))),
        page.audio.map(a => h('div', { class: `pg-file audio ${a.processed ? '' : 'new'}` },
          h('span', { class: 'pg-file-ico', text: a.recorded ? '🎙' : '🎧' }),
          h('span', { class: 'pg-file-name', text: a.name, title: a.name }),
          h('span', { class: 'muted small', text: `${a.seconds ? formatTime(a.seconds) : a.ext.toUpperCase()}${a.processed ? '' : ' · new'}` }),
          audioPlayer(a),
          a.transcript ? h('button', { class: 'btn small ghost', text: 'Transcript', onclick: () => showTranscript(a) }) : null,
          h('button', { class: 'icon-btn', title: 'Remove recording', text: '✕', onclick: () => removeSource(a, 'audio') })))) : null);
  }
  const sizeText = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1e3))} KB`);
  const AUDIO_MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
  function audioPlayer(a) {
    const el = h('audio', { controls: true, preload: 'none', class: 'pg-audio' });
    const box = h('span', { class: 'pg-audio-box' }, el);
    imageUrlTyped(a.file, AUDIO_MIME[a.ext] || 'audio/webm').then(u => { el.src = u; })
      .catch(() => { box.replaceChildren(h('span', { class: 'muted small', text: nb.cloud ? 'Recording kept on the device that made it. Its transcript is here.' : 'Recording missing' })); });
    return box;
  }
  function imageUrlTyped(file, type) {
    if (!urls.has(file)) urls.set(file, api.readImage(nb.id, file).then(bytes => URL.createObjectURL(new Blob([bytes], { type }))));
    return urls.get(file);
  }
  function showTranscript(a) {
    modal({ title: `Transcript: ${a.name}`, wide: true, body: `<div class="transcript">${esc(a.transcript).replace(/\n/g, '<br>')}</div><p class="muted small">Written by AI from the recording, so some words may be misheard.</p>`,
      actions: [{ label: 'Copy', kind: 'ghost', onClick: async () => { try { await navigator.clipboard.writeText(a.transcript); toast('Copied'); } catch { toast('Copy failed'); } return false; } }, { label: 'Close', kind: 'primary' }] });
  }
  async function removeSource(item, list) {
    if (!(await confirmDialog(list === 'docs' ? 'Remove document?' : 'Remove recording?', 'Notes already written from it are kept.', 'Remove'))) return;
    page[list] = page[list].filter(x => x !== item);
    await api.removeImage(nb.id, item.file);
    dirty = true; await flush();
    render();
  }

  /* ----- recording ----- */
  // Records a lecture or voice note into this page's sources.
  async function recordDialog() {
    let rec;
    try { rec = await startRecording(); } catch (e) { return toast(errText(e)); }
    let closeIt, tick, saving = false;
    const finish = async () => {
      if (saving) return false;
      saving = true;
      clearInterval(tick);
      const out = await rec.stop();
      closeIt?.();
      if (out.seconds < 1 || !out.bytes.length) return toast('Nothing was recorded');
      busy('Saving the recording…');
      try {
        const name = `Recording ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
        const item = await api.addFile(nb.id, name, out.ext, out.bytes);
        page.audio.push({ ...item, seconds: Math.round(out.seconds), recorded: true });
        dirty = true; await flush();
        busy(null);
        render();
        toast('Recording saved. Press "Turn into notes" to write notes from it.');
      } catch (e) { busy(null); toast(errText(e)); }
      return false;
    };
    closeIt = modal({
      title: '🎙 Recording',
      body: '<div class="rec"><div class="rec-dot"></div><div class="rec-time">0:00</div><div class="rec-meter"><i></i></div></div><p class="muted small">Keep the device near the speaker. Recordings stay on this device until you turn them into notes. Long lectures are fine; each 8 minutes uses one AI request to write out.</p>',
      actions: [{ label: 'Cancel', kind: 'ghost', onClick: () => { saving = true; clearInterval(tick); rec.cancel(); } }, { label: '■ Stop and save', kind: 'primary', onClick: finish }],
      onClose: () => { if (!saving) { clearInterval(tick); rec.cancel(); } },
      onMount: el => {
        tick = setInterval(() => {
          $('.rec-time', el).textContent = formatTime(rec.seconds());
          $('.rec-meter i', el).style.width = `${Math.min(100, Math.round(rec.level() * 160))}%`;
        }, 120);
      },
    });
  }

  /* ----- dictation: speak and the words are typed where the cursor is ----- */
  let dictating = null;
  async function dictate() {
    if (dictating) return dictating.stop();
    inText(() => {});
    let range = lastRange && paper?.contains(lastRange.commonAncestorContainer) ? lastRange.cloneRange() : null;
    if (!range) {
      if (!page.topics.length) await addTopic();
      const text = $$('.pg-text', paper).pop();
      range = document.createRange(); range.selectNodeContents(text); range.collapse(false);
    }
    const typeAt = words => {
      if (!words) return;
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const before = range.startContainer.textContent?.slice(0, range.startOffset) || '';
      document.execCommand('insertText', false, `${before && !/\s$/.test(before) ? ' ' : ''}${words}`);
      range = sel.getRangeAt(0).cloneRange();
      range.startContainer.parentElement?.closest('.pg-text')?.dispatchEvent(new Event('input'));
    };
    if (liveDictation()) {
      const live = startLiveDictation({ onText: typeAt, onEnd: err => { dictating = null; ribbon.refresh(); if (err && err !== 'no-speech' && err !== 'aborted') toast(err === 'not-allowed' ? 'Allow the microphone to dictate' : 'Dictation stopped'); } });
      dictating = { stop: () => { live.stop(); dictating = null; ribbon.refresh(); } };
      ribbon.refresh();
      return toast('Listening… speak, and press Dictate again to stop');
    }
    // Elsewhere: record, then have the AI write out what was said (1 request per 8 minutes).
    let rec;
    try { rec = await startRecording(); } catch (e) { return toast(errText(e)); }
    dictating = {
      stop: async () => {
        dictating = null; ribbon.refresh();
        const out = await rec.stop();
        if (out.seconds < 1) return;
        busy('Writing out what you said…');
        try {
          const { chunks } = await audioToChunks(out.bytes);
          let text = '';
          for (let i = 0; i < chunks.length; i++) text += `${(await api.transcribe({ bytes: chunks[i], mediaType: 'audio/wav', mode: 'dictation', part: i + 1, of: chunks.length })).text} `;
          busy(null);
          typeAt(text.trim());
          toast('Dictation added');
        } catch (e) { fail(e); }
      },
    };
    ribbon.refresh();
    toast('Recording… press Dictate again when you\'re done');
  }

  function topicNode(t) {
    t.ink ||= [];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pg-ink');
    // Topic HTML is produced by notes/render.js (escaped) and edited in place; the
    // page CSP blocks scripts and inline handlers, so stored markup cannot run code.
    const text = h('div', {
      class: 'pg-text', contentEditable: readonly ? 'false' : 'true', html: t.html,
      oninput: () => { t.html = text.innerHTML; save(); },
      onclick: e => { const c = e.target.closest('.pg-cmt'); if (c) openComment(c, text); },
    });
    return h('section', { class: 'pg-topic', 'data-id': t.id },
      h('h2', {
        contentEditable: readonly ? 'false' : 'plaintext-only', text: t.heading, 'data-ph': 'Heading',
        oninput: e => { t.heading = e.target.textContent.trim(); save(); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); text.focus(); } },
      }),
      text, svg,
      h('button', {
        class: 'icon-btn pg-topic-del', title: 'Delete this heading and its notes', text: '✕',
        onclick: async () => {
          if (!(await confirmDialog('Delete these notes?', `"${t.heading || 'This part'}" and its annotations will be deleted.`))) return;
          pics.dropTopicPics([t]);
          page.topics = page.topics.filter(x => x !== t);
          dirty = true; await flush(); render();
        },
      }));
  }

  async function addTopic() {
    page.topics.push({ id: uid(), heading: '', html: '<p><br></p>', ink: [] });
    dirty = true; await flush();
    if (mode !== 'text') mode = 'text';
    render();
    const last = $$('.pg-topic', root).pop();
    last?.scrollIntoView({ block: 'center' });
    (page.topics.length === 1 ? $('.pg-text', last) : $('h2', last))?.focus();
  }

  /* ----- photos ----- */
  async function downscale(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const c = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function addFiles(files) {
    if (!page) return;
    if (readonly) return toast('This notebook is view only');
    files = [...files];
    const imgs = files.filter(f => kindOf(f) === 'image');
    const others = files.filter(f => kindOf(f) === 'doc' || kindOf(f) === 'audio');
    const skipped = files.length - imgs.length - others.length;
    if (!imgs.length && !others.length) return skipped && toast('Study Hall can read photos, PDF, Word, PowerPoint, text files and audio');
    let bad = 0;
    busy(`Adding ${plural(imgs.length + others.length, 'file')}…`);
    for (const f of imgs) {
      try { page.images.push(await api.addImage(nb.id, f.name || 'Pasted image', await downscale(f))); } catch { bad++; }
    }
    for (const f of others) {
      try {
        const kind = kindOf(f);
        const item = await api.addFile(nb.id, f.name || (kind === 'audio' ? 'Recording' : 'Document'), extOf(f) || (kind === 'audio' ? 'm4a' : 'pdf'), new Uint8Array(await f.arrayBuffer()));
        (kind === 'audio' ? page.audio : page.docs).push(item);
      } catch (e) { bad++; if (/too large/.test(errText(e))) toast(errText(e)); }
    }
    busy(null);
    dirty = true; await flush();
    if (bad) toast(`${plural(bad, 'file')} could not be added (HEIC photos need converting to JPEG first)`);
    else toast('Added. Press "Turn into notes" when you\'re ready.');
    render();
  }
  async function removeImage(img) {
    if (!(await confirmDialog('Remove photo?', 'Notes already written from it are kept.', 'Remove'))) return;
    page.images = page.images.filter(i => i !== img);
    pics.forgetPhoto(img.file);
    await api.removeImage(nb.id, img.file);
    dirty = true; await flush();
    render();
  }

  // QR code -> phone opens a capture page served by this computer -> photos land on this page.
  function phoneDialog() {
    let count = 0;
    modal({
      title: 'Use your phone as the camera',
      body: '<div class="qr"><p class="muted">Starting…</p></div>',
      onMount: async el => {
        const box = $('.qr', el);
        let links;
        try { links = await api.captureStart(nb.id); } catch (e) { box.innerHTML = `<p>${esc(errText(e))}</p>`; return; }
        if (!el.isConnected) return api.captureStop();
        if (!links.length) { box.innerHTML = '<p>No network connection found. Connect this computer to Wi-Fi and try again.</p>'; return; }
        const show = link => {
          box.innerHTML = `
            <img class="qr-img" alt="QR code" src="${esc(link.qr)}">
            <ol><li>Connect your phone to the <b>same Wi-Fi</b> as this computer.</li>
              <li>Scan the code with your phone's camera and open the link.</li>
              <li>Tap <b>Take photo</b>. Each picture appears on this page.</li></ol>
            <p class="qr-count" data-count>${count ? `${plural(count, 'photo')} received` : 'Waiting for photos…'}</p>
            <p class="muted small">If Windows asks, allow Study Hall on private networks. The link works only while this window is open.</p>
            ${links.length > 1 ? `<label class="select-wrap">Not connecting? Try another network<select class="input" data-net>${links.map((l, i) =>
              `<option value="${i}" ${l === link ? 'selected' : ''}>${esc(l.name)} · ${esc(new URL(l.url).hostname)}</option>`).join('')}</select></label>` : ''}
            <code class="small qr-url">${esc(link.url)}</code>`;
          const net = $('[data-net]', box);
          if (net) net.onchange = () => show(links[+net.value]);
        };
        show(links[0]);
        captureUi = () => { count++; const c = $('[data-count]', box); if (c) { c.textContent = `${plural(count, 'photo')} received`; c.classList.add('got'); } };
      },
      actions: [{ label: 'Done', kind: 'primary' }],
      onClose: () => { captureUi = null; api.captureStop(); },
    });
  }

  function openViewer(img) {
    img.ink ||= [];
    let vmode = prefs.tool;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pg-ink on');
    const vhist = new InkHistory(() => save());
    modal({
      title: img.name || 'Photo', wide: true,
      body: '<div class="viewer"></div>',
      onMount: el => {
        $('.modal', el).classList.add('xwide');
        const stage = h('div', { class: 'viewer-stage' });
        const pic = lazyImg(img, {
          onload: () => {
            svg.setAttribute('viewBox', `0 0 ${pic.naturalWidth} ${pic.naturalHeight}`);
            new Ink(svg, img.ink, { getTool: toolSpec(() => vmode), onCommit: op => vhist.push(op), scroller: stage });
          },
        });
        const bar = inkBar({ getMode: () => vmode, setMode: m => { vmode = m; bar.redraw(); }, history: vhist });
        // Clip mode: drag a rectangle over part of the photo to send it to Clippings.
        const marquee = h('div', { class: 'clip-marquee' });
        const cutter = h('div', { class: 'clip-cutter', hidden: true }, marquee);
        const clipBtn = h('button', { class: 'btn small', text: '✂ Clip a picture', title: 'Drag a box around a diagram to save it to Clippings', onclick: () => { cutter.hidden = !cutter.hidden; clipBtn.classList.toggle('primary', !cutter.hidden); } });
        cutter.addEventListener('pointerdown', e => {
          const r = cutter.getBoundingClientRect();
          const x0 = e.clientX, y0 = e.clientY;
          try { cutter.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
          const box = ev => ({ x: Math.max(r.left, Math.min(x0, ev.clientX)), y: Math.max(r.top, Math.min(y0, ev.clientY)), x2: Math.min(r.right, Math.max(x0, ev.clientX)), y2: Math.min(r.bottom, Math.max(y0, ev.clientY)) });
          const move = ev => { const b = box(ev); marquee.style.cssText = `display:block;left:${b.x - r.left}px;top:${b.y - r.top}px;width:${b.x2 - b.x}px;height:${b.y2 - b.y}px`; };
          const up = ev => {
            cutter.removeEventListener('pointermove', move); cutter.removeEventListener('pointerup', up);
            const b = box(ev);
            marquee.style.display = 'none';
            if (b.x2 - b.x < 16 || b.y2 - b.y < 16) return;
            pics.addManualClip(img.file, { x: (b.x - r.left) / r.width, y: (b.y - r.top) / r.height, w: (b.x2 - b.x) / r.width, h: (b.y2 - b.y) / r.height });
            toast('Saved to Clippings. Close this window and drag it into your notes.');
          };
          cutter.addEventListener('pointermove', move); cutter.addEventListener('pointerup', up);
        });
        stage.append(h('div', { class: 'viewer-pic' }, pic, svg, cutter));
        $('.viewer', el).append(h('div', { class: 'viewer-bar' }, h('div', { class: 'row gap' }, bar, h('span', { class: 'rb-sep' }), clipBtn)), stage);
      },
      actions: [{ label: 'Done', kind: 'primary' }],
      onClose: () => { if (!disposed) render(); },
    });
  }

  /* ----- photos, documents and recordings -> notes ----- */
  async function generate(all) {
    if (readonly) return toast('This notebook is view only');
    if (!(await ensureAi())) return;
    const pick = list => list.filter(x => all || !x.processed);
    const imgs = pick(page.images), docs = pick(page.docs), recs = pick(page.audio);
    const total = imgs.length + docs.length + recs.length;
    if (!total) return toast('Add photos, a document or a recording first (Insert tab)');
    if (all && page.topics.length &&
      !(await confirmDialog('Rewrite the notes?', 'The current notes on this page, your edits and your annotations will be replaced.', 'Rewrite'))) return;
    const settings = await getSettings();
    const provider = settings.provider;
    const batchSize = provider === 'ollama' ? 2 : 4; // local models handle fewer images at once
    const parallel = provider === 'ollama' ? 1 : 3;  // cloud AIs: several requests at once is much faster
    // Rough request count: transcription (1 per 8 minutes, unless already written out), then one per batch / document / recording.
    const transcribeCost = recs.filter(r => !r.transcript).reduce((n, r) => n + Math.max(1, Math.ceil((r.seconds || 480) / 480)), 0);
    if (!(await checkBudget(Math.ceil(imgs.length / batchSize) + docs.length + recs.length + transcribeCost))) return;
    if (all) { pics.dropTopicPics(page.topics); page.topics = []; page.clips = []; page.aiBy = []; }
    let done = 0;
    const found = []; // diagrams the AI spotted in the photos
    const merge = async (res, batch = []) => {
      if (disposed) return;
      found.push(...pics.addFigures(res.figures, batch));
      for (const sec of res.sections || []) {
        const hit = page.topics.find(t => t.heading && t.heading.trim().toLowerCase() === String(sec.heading).trim().toLowerCase());
        if (hit) hit.html += sectionHtml(sec, false);
        else page.topics.push({ id: uid(), heading: String(sec.heading || '').slice(0, 200), html: sectionHtml(sec), ink: [] });
      }
      if (res.title && page.title === 'Untitled page') page.title = String(res.title).slice(0, 150);
      page.aiBy = addBy(page.aiBy, res.by);
      dirty = true; await flush();
    };
    const base = () => ({ id: nb.id, notebookName: nb.name, pageTitle: page.title, existingHeadings: page.topics.map(t => t.heading).filter(Boolean) });
    try {
      // 1. Recordings: written out first (Gemini), then turned into notes.
      for (const r of recs) {
        if (!r.transcript) {
          busy(`Listening to "${r.name}"…`);
          const { chunks, seconds } = await audioToChunks(await api.readImage(nb.id, r.file));
          r.seconds ||= Math.round(seconds);
          let doneParts = 0;
          busy(`Writing out "${r.name}"${chunks.length > 1 ? `: 0 of ${chunks.length} parts` : ''}…`);
          const texts = await pool(chunks.map((c, i) => async () => {
            const t = (await api.transcribe({ bytes: c, mediaType: 'audio/wav', mode: 'lecture', part: i + 1, of: chunks.length })).text;
            if (chunks.length > 1) busy(`Writing out "${r.name}": ${++doneParts} of ${chunks.length} parts…`);
            return t;
          }), parallel);
          if (disposed) return busy(null);
          r.transcript = texts.join('\n\n').trim();
          dirty = true; await flush();
        }
        busy(`Writing notes from "${r.name}"…`);
        if (r.transcript) await merge(await api.generate({ ...base(), transcripts: [{ name: r.name, text: r.transcript }] }));
        r.processed = true; done++;
      }
      // 2. Documents and photos: up to 3 requests at a time (1 for Ollama), merged in order.
      const jobs = [];
      for (const d of docs) {
        jobs.push({ items: [d], batch: [], run: async () => {
          const prepared = await prepareDoc(d, d.ext === 'pdf' && provider !== 'ollama' ? null : await api.readImage(nb.id, d.file), provider);
          if (prepared.truncated) toast(`Only the first 20 pages of "${d.name}" were read with Ollama`);
          return api.generate(prepared.pageImages ? { ...base(), imageBytes: prepared.pageImages } : { ...base(), docs: [prepared] });
        } });
      }
      for (let i = 0; i < imgs.length; i += batchSize) {
        const batch = imgs.slice(i, i + batchSize);
        jobs.push({ items: batch, batch, run: () => api.generate({ ...base(), files: batch.map(b => b.file) }) });
      }
      if (jobs.length) {
        busy(`Reading ${plural(docs.length + imgs.length, docs.length ? 'source' : 'photo')} and writing notes…`);
        const results = jobs.map(() => null);
        let next = 0, finished = 0;
        // Results are merged in the order the sources were added, as soon as each is ready.
        const mergeReady = async () => {
          while (next < jobs.length && results[next]) {
            const { res, job } = results[next++];
            await merge(res, job.batch);
            job.items.forEach(x => { x.processed = true; });
            done += job.items.length;
            dirty = true; await flush();
          }
        };
        await pool(jobs.map((job, i) => async () => {
          const res = await job.run();
          results[i] = { res, job };
          finished++;
          if (jobs.length > 1) busy(`Writing notes: ${finished} of ${jobs.length} parts done…`);
          await mergeReady();
        }), parallel);
        await mergeReady();
      }
      if (disposed) return busy(null);
      const drawn = await pics.autoDraw(found);
      if (found.length) { dirty = true; await flush(); }
      busy(null);
      toast(found.length ? `Notes ready. ${plural(found.length, 'diagram')} found${drawn ? `, ${drawn} redrawn clean` : ''}: see Clippings at the bottom right.` : 'Notes ready. Highlight anything and press ✨ Ask to have it explained.');
    } catch (e) {
      fail(e);
      if (done) toast(`Stopped after ${done} of ${total} sources`);
      dirty = true; await flush();
    }
    if (!disposed) render();
  }

  /* ----- comments ----- */
  function closePop() { pop?.remove(); pop = null; }
  function addComment() {
    inText(() => {
      const sel = getSelection();
      const text = sel.rangeCount && !sel.isCollapsed && sel.anchorNode.parentElement?.closest('.pg-text');
      if (!text || !text.contains(sel.focusNode)) return toast('Select some text in the notes first');
      const span = h('span', { class: 'pg-cmt' });
      try { sel.getRangeAt(0).surroundContents(span); } catch { return toast('Select text inside a single paragraph to comment on it'); }
      sel.removeAllRanges();
      openComment(span, text, true);
    });
  }
  function openComment(span, text, isNew) {
    closePop();
    const sync = () => text.dispatchEvent(new Event('input'));
    const unwrap = () => { span.replaceWith(...span.childNodes); text.normalize(); sync(); };
    const ta = h('textarea', { class: 'input', placeholder: 'Write a comment…', value: span.dataset.note || '', rows: 3 });
    pop = h('div', { class: 'pg-pop' }, ta,
      h('div', { class: 'row gap', style: 'justify-content:flex-end' },
        h('button', { class: 'btn small ghost', text: isNew ? 'Cancel' : 'Delete', onclick: () => { unwrap(); closePop(); } }),
        h('button', {
          class: 'btn small primary', text: 'Save',
          onclick: () => {
            const v = ta.value.trim();
            if (!v) unwrap(); else { span.dataset.note = v; span.title = v; sync(); }
            closePop();
          },
        })));
    document.body.append(pop);
    const r = span.getBoundingClientRect();
    pop.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 310))}px`;
    pop.style.top = `${Math.min(r.bottom + 8, innerHeight - 180)}px`;
    ta.focus();
    if (isNew) sync();
  }

  async function exportPdf() {
    await flush();
    try { const file = await api.exportPdf(page.title); if (file) toast('PDF saved'); } catch (e) { fail(e); }
  }

  // What the ribbon (and the automated check) can ask this page to do.
  const ctrl = {
    nb, readonly, get page() { return page; },
    getMode: () => mode, setMode, exec, setFont, setSize, addComment, addTopic, flush, history, exportPdf,
    choosePhotos: () => picker.click(), phoneCamera: takePhoto, generate, addFiles, pics, choosePicture: () => picPicker.click(),
    chooseDocument: () => docPicker.click(), chooseAudio: () => audioPicker.click(), record: () => recordDialog(), canRecord,
    dictate, isDictating: () => !!dictating, ask,
    askSelection: () => { if (mode !== 'text') setMode('text'); selectedText(); ask.askAboutSelection(); },
    askArea: () => { if (mode !== 'text') setMode('text'); ask.startArea(); },
    newPhotos: () => (page ? unprocessed().length : 0),
    inkCount: () => (page ? page.topics.reduce((n, t) => n + (t.ink?.length || 0), 0) : 0),
  };
  root._pg = ctrl;

  return () => {
    disposed = true;
    ribbon.setPage(null);
    if (page && dirty) { clearTimeout(timer); dirty = false; nbstore.savePage(nb, page).catch(() => {}); }
    api.captureStop();
    offCapture();
    closePop();
    window.removeEventListener('beforeunload', onUnload);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('keydown', onKeys);
    document.removeEventListener('mousedown', onDocDown);
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('selectionchange', onSelection);
    pics.dispose();
    ask.dispose();
    offRemote();
    dictating?.stop();
    urls.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
  };
}
