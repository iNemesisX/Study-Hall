// A notebook page: title, photos, AI-written notes split into topics, and
// text + ink annotation. The ribbon (ribbon.js) drives it through `ctrl`.
import * as nbstore from '../notes/nbstore.js';
import * as ribbon from './ribbon.js';
import { $, $$, esc, uid, h, plural, modal, confirmDialog, toast, busy } from '../ui.js';
import { sectionHtml } from '../notes/render.js';
import { Ink, InkHistory } from '../notes/ink.js';
import { prefs, toolSpec, inkBar } from '../notes/inkbar.js';
import { fail, errText, ensureAi, getSettings } from '../notes/aiui.js';
import { notFound } from './common.js';

const api = nbstore.api;
const MAX_EDGE = 2000; // px, long edge after downscale
const NS = 'http://www.w3.org/2000/svg';

export function pageView(root, nbId, pageId) {
  const nb = nbstore.get(nbId);
  if (!api || !nb || !nbstore.findPage(nb, pageId)) return notFound(root, 'page');
  root.className = 'pg-root';
  root.innerHTML = '<div class="empty"><p>Opening page…</p></div>';
  try { localStorage.setItem('studyhall-last', JSON.stringify({ nb: nbId, page: pageId })); } catch { /* ignore */ }

  let page = null, mode = 'text', disposed = false, dirty = false, timer = null;
  let pop = null, captureUi = null, scroller = null, paper = null;
  const urls = new Map();   // image file -> Promise<blob URL>
  const inks = new Map();   // topic id -> Ink
  const history = new InkHistory(() => save());
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { addFiles(e.target.files); e.target.value = ''; } });

  /* ----- saving ----- */
  function save() { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 500); }
  async function flush() {
    clearTimeout(timer);
    if (!page || !dirty) return;
    dirty = false;
    try { await nbstore.savePage(nb, page); } catch (e) { dirty = true; toast(errText(e)); }
  }
  const onUnload = () => { if (page && dirty) nbstore.savePageSync(nb.id, page); };
  window.addEventListener('beforeunload', onUnload);

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
  const onPaste = e => {
    if (!page || $('.modal-backdrop')) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  };
  document.addEventListener('paste', onPaste);
  root.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('dropping'); } });
  root.addEventListener('dragleave', e => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('dropping'); });
  root.addEventListener('drop', e => { root.classList.remove('dropping'); if (e.dataTransfer?.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

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
    paper?.style.setProperty('--pg-font', page.font ? `'${page.font}', 'Segoe UI', system-ui, sans-serif` : '');
    paper?.style.setProperty('--pg-size', page.size ? `${page.size}px` : '');
  };
  // Selected text gets the font; with nothing selected the whole page does.
  function setFont(name) {
    if (!/^[\w ]{1,40}$/.test(name)) return;
    if (selectedText()) exec('fontName', name);
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

  nbstore.loadPage(nbId, pageId).then(loaded => {
    if (disposed) return;
    if (!loaded) { root.className = ''; return notFound(root, 'page'); }
    page = loaded;
    page.images ||= []; page.topics ||= [];
    render();
    ribbon.setPage(ctrl);
  });

  /* ----- layout ----- */
  function render() {
    closePop();
    inks.clear();
    const keep = scroller?.scrollTop || 0;
    const fresh = page.images.filter(i => !i.processed).length;
    paper = h('article', { class: `pg-paper ${mode !== 'text' ? 'inking' : ''}`, 'data-tour': 'paper' },
      h('h1', {
        class: 'pg-title', contentEditable: 'plaintext-only', spellcheck: false, text: page.title === 'Untitled page' ? '' : page.title, 'data-ph': 'Page title',
        oninput: e => { page.title = e.target.textContent.trim().slice(0, 150) || 'Untitled page'; save(); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); ($('.pg-text', paper) || e.target).focus(); } },
      }),
      h('div', { class: 'pg-date', text: `${new Date(page.created || Date.now()).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${page.kind === 'guide' ? '  ·  Study guide' : ''}` }),
      page.images.length ? photoTray(fresh) : null,
      page.topics.map(topicNode),
      page.topics.length ? h('button', { class: 'btn pg-add', text: '＋ Add a heading', onclick: addTopic }) : startHere());
    applyPageFont();
    scroller = h('div', { class: 'pg-scroll' }, paper);
    root.replaceChildren(scroller, picker);
    page.topics.forEach(t => {
      const svg = $(`.pg-topic[data-id="${t.id}"] svg`, paper);
      inks.set(t.id, new Ink(svg, t.ink, { getTool: toolSpec(() => mode), onCommit: op => history.push(op), scroller }));
    });
    // A stylus touching the page while typing switches to the last pen and starts the stroke.
    paper.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'pen' || mode !== 'text' || !prefs.autoPen) return;
      const topic = e.target.closest?.('.pg-topic');
      if (!topic) return;
      e.preventDefault();
      ribbon.setTab('draw');
      setMode(prefs.tool);
      inks.get(topic.dataset.id)?.down(e);
    }, true);
    scroller.scrollTop = keep;
    ribbon.refresh();
  }

  // Shown on a page with no notes yet: the main things a new user can do.
  function startHere() {
    if (page.images.length) return null;
    return h('div', { class: 'pg-start', 'data-tour': 'start' },
      h('div', { class: 'big-ico', text: '📸' }),
      h('h2', { text: 'Turn photos into notes' }),
      h('p', { class: 'muted', text: 'Add pictures of slides, textbook pages, handouts or handwritten work. Study Hall reads them and writes organized notes on this page.' }),
      h('div', { class: 'row gap wrap', style: 'justify-content:center' },
        h('button', { class: 'btn primary', text: '🖼 Choose photos', onclick: () => picker.click() }),
        h('button', { class: 'btn', text: '📱 Use phone camera', onclick: phoneDialog }),
        h('button', { class: 'btn ghost', text: '✎ Just start typing', onclick: addTopic })),
      h('p', { class: 'muted small', text: 'You can also drag images onto this page or paste a screenshot with Ctrl+V.' }));
  }

  function photoTray(fresh) {
    return h('div', { class: `pg-photos ${fresh ? 'fresh' : ''}`, 'data-tour': 'photos' },
      h('div', { class: 'pg-photos-head' },
        h('b', { text: `📷 ${plural(page.images.length, 'photo')}` }),
        h('span', { class: 'muted small', text: fresh ? `${fresh} not in the notes yet` : 'All in the notes. Click a photo to view or mark it up.' }),
        h('span', { class: 'spacer' }),
        fresh ? h('button', { class: 'btn primary small', text: `✨ Turn ${plural(fresh, 'photo')} into notes`, onclick: () => generate(false) }) : null,
        h('button', { class: 'btn small', text: '＋ Add', title: 'Add more photos', onclick: () => picker.click() })),
      h('div', { class: 'pg-thumbs' }, page.images.map((img, i) =>
        h('figure', { class: `pg-thumb ${img.processed ? '' : 'new'}` },
          lazyImg(img, { onclick: () => openViewer(img) }),
          h('figcaption', {}, h('span', { text: `${i + 1}${img.processed ? '' : ' · new'}${img.ink?.length ? ' ✎' : ''}` }),
            h('button', { class: 'icon-btn', title: 'Remove photo', text: '✕', onclick: () => removeImage(img) }))))));
  }

  function topicNode(t) {
    t.ink ||= [];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pg-ink');
    // Topic HTML is produced by notes/render.js (escaped) and edited in place; the
    // page CSP blocks scripts and inline handlers, so stored markup cannot run code.
    const text = h('div', {
      class: 'pg-text', contentEditable: 'true', html: t.html,
      oninput: () => { t.html = text.innerHTML; save(); },
      onclick: e => { const c = e.target.closest('.pg-cmt'); if (c) openComment(c, text); },
    });
    return h('section', { class: 'pg-topic', 'data-id': t.id },
      h('h2', {
        contentEditable: 'plaintext-only', text: t.heading, 'data-ph': 'Heading',
        oninput: e => { t.heading = e.target.textContent.trim(); save(); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); text.focus(); } },
      }),
      text, svg,
      h('button', {
        class: 'icon-btn pg-topic-del', title: 'Delete this heading and its notes', text: '✕',
        onclick: async () => {
          if (!(await confirmDialog('Delete these notes?', `"${t.heading || 'This part'}" and its annotations will be deleted.`))) return;
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
    const imgs = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length || !page) return;
    let bad = 0;
    busy(`Adding ${plural(imgs.length, 'photo')}…`);
    for (const f of imgs) {
      try { page.images.push(await api.addImage(nb.id, f.name || 'Pasted image', await downscale(f))); } catch { bad++; }
    }
    busy(null);
    dirty = true; await flush();
    if (bad) toast(`${plural(bad, 'file')} could not be read (HEIC photos need converting to JPEG first)`);
    else toast('Photos added. Press "Turn into notes" when you\'re ready.');
    render();
  }
  async function removeImage(img) {
    if (!(await confirmDialog('Remove photo?', 'Notes already written from it are kept.', 'Remove'))) return;
    page.images = page.images.filter(i => i !== img);
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
        stage.append(h('div', { class: 'viewer-pic' }, pic, svg));
        $('.viewer', el).append(h('div', { class: 'viewer-bar' }, bar), stage);
      },
      actions: [{ label: 'Done', kind: 'primary' }],
      onClose: () => { if (!disposed) render(); },
    });
  }

  /* ----- photos -> notes ----- */
  async function generate(all) {
    if (!(await ensureAi())) return;
    const imgs = page.images.filter(i => all || !i.processed);
    if (!imgs.length) return toast('Add some photos first (Insert tab)');
    if (all && page.topics.length &&
      !(await confirmDialog('Rewrite the notes?', 'The current notes on this page, your edits and your annotations will be replaced.', 'Rewrite'))) return;
    if (all) page.topics = [];
    const batchSize = (await getSettings()).provider === 'ollama' ? 2 : 6; // local models handle fewer images at once
    let done = 0;
    try {
      for (let i = 0; i < imgs.length; i += batchSize) {
        const batch = imgs.slice(i, i + batchSize);
        busy(`Reading photos ${i + 1}–${i + batch.length} of ${imgs.length} and writing notes…`);
        const res = await api.generate({ id: nb.id, files: batch.map(b => b.file), notebookName: nb.name, pageTitle: page.title, existingHeadings: page.topics.map(t => t.heading).filter(Boolean) });
        if (disposed) return busy(null);
        for (const sec of res.sections || []) {
          const hit = page.topics.find(t => t.heading && t.heading.trim().toLowerCase() === String(sec.heading).trim().toLowerCase());
          if (hit) hit.html += sectionHtml(sec, false);
          else page.topics.push({ id: uid(), heading: String(sec.heading || '').slice(0, 200), html: sectionHtml(sec), ink: [] });
        }
        if (res.title && page.title === 'Untitled page') page.title = String(res.title).slice(0, 150);
        batch.forEach(b => { b.processed = true; });
        done += batch.length;
        dirty = true; await flush();
      }
      busy(null);
      toast('Notes ready. Edit, highlight or draw on them, then try the Study tab.');
    } catch (e) {
      fail(e);
      if (done) toast(`Stopped after ${done} of ${imgs.length} photos`);
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
    nb, get page() { return page; },
    getMode: () => mode, setMode, exec, setFont, setSize, addComment, addTopic, flush, history, exportPdf,
    choosePhotos: () => picker.click(), phoneCamera: phoneDialog, generate, addFiles,
    newPhotos: () => (page ? page.images.filter(i => !i.processed).length : 0),
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
    document.removeEventListener('keydown', onKeys);
    document.removeEventListener('mousedown', onDocDown);
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('selectionchange', onSelection);
    urls.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
  };
}
