// Pictures in notes, and the Clippings tray.
//
// A picture is a standalone object placed on a page: it can be dragged anywhere,
// resized from its corner, and drawn on (its ink moves with it). Pictures belong
// to a topic and are positioned relative to it, so they stay with their notes.
//   image picture:   { id, file, name, x, y, w, r, ink }            (r = height / width)
//   diagram picture: { id, kind: 'diagram', diagram, x, y, w, r, ink }
// A diagram is a clean redraw made by the AI: { width, height, svg, labels }, where
// labels are separate so each can be edited, moved, added or removed.
//
// Clippings are suggestions waiting to be placed: figures the AI found in the
// page's photos ({ id, src, box, label, section }), regions the user clipped by
// hand, and AI-drawn diagrams ({ id, kind: 'diagram', diagram, label, section }).
import * as nbstore from './nbstore.js';
import { $, $$, h, uid, plural, toast, busy } from '../ui.js';
import { Ink } from './ink.js';
import { toolSpec } from './inkbar.js';
import { htmlToText } from './render.js';
import { fail, ensureAi, getSettings, getUsage, checkBudget } from './aiui.js';

const api = nbstore.api;
const NS = 'http://www.w3.org/2000/svg';
const CLIP_TYPE = 'application/x-studyhall-clip';
const AUTO_DRAW_MAX = 2; // diagrams redrawn automatically after "turn photos into notes"

/* ---------- AI-drawn SVG is untrusted: keep only plain shapes ---------- */
const SVG_TAGS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SVG_ATTRS = new Set(['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'transform']);
export function safeSvg(markup) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${markup}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return '';
  const clean = (node) => {
    for (const child of [...node.children]) {
      if (!SVG_TAGS.has(child.localName)) { child.remove(); continue; }
      for (const a of [...child.attributes]) {
        if (!SVG_ATTRS.has(a.name) || /url\(|javascript:|expression|[<>]/i.test(a.value)) child.removeAttribute(a.name);
      }
      clean(child);
    }
  };
  clean(doc.documentElement);
  return [...doc.documentElement.childNodes].map((n) => new XMLSerializer().serializeToString(n)).join('');
}

/**
 * c: what the page provides —
 *   { nb, page(), paper(), scroller(), root, mode(), drawMode(), save(), flush(), history, imageUrl(img), lazyImg(img, props),
 *     downscale(file), render(), newTopic() }
 */
export function createPics(c) {
  const picInks = new Map();
  const bitmaps = new Map(); // file -> Promise<HTMLImageElement>
  let selected = null;       // picture id
  let dockOpen = false;
  let dockEl = null;

  const topics = () => c.page()?.topics || [];
  const clips = () => (c.page().clips ||= []);
  const allPics = () => topics().flatMap((t) => t.pics || []);
  const findPic = (id) => { for (const t of topics()) { const p = (t.pics || []).find((x) => x.id === id); if (p) return { topic: t, pic: p }; } return null; };
  const topicEl = (t) => $(`.pg-topic[data-id="${t.id}"]`, c.paper());

  function loadImg(file) {
    if (!bitmaps.has(file)) {
      bitmaps.set(file, c.imageUrl({ file }).then((url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); img.onerror = () => reject(new Error('Image missing'));
        img.src = url;
      })));
    }
    return bitmaps.get(file);
  }

  // Cuts a region ({ x, y, w, h } as fractions) out of a stored photo. Returns JPEG bytes and its size.
  async function crop(file, box, maxEdge = 1600) {
    const img = await loadImg(file);
    const sx = box.x * img.naturalWidth, sy = box.y * img.naturalHeight;
    const sw = Math.max(8, box.w * img.naturalWidth), sh = Math.max(8, box.h * img.naturalHeight);
    const k = Math.min(1, maxEdge / Math.max(sw, sh));
    const cv = h('canvas', { width: Math.round(sw * k), height: Math.round(sh * k) });
    cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: cv.width, height: cv.height };
  }

  /* ---------- where a new picture goes ---------- */
  function targetTopic(sectionName) {
    const list = topics();
    if (sectionName) {
      const hit = list.find((t) => t.heading && t.heading.trim().toLowerCase() === sectionName.trim().toLowerCase());
      if (hit) return hit;
    }
    const sel = getSelection();
    const focused = sel.rangeCount && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.('.pg-topic');
    const own = focused && c.paper()?.contains(focused) && list.find((t) => t.id === focused.dataset.id);
    if (own) return own;
    const sc = c.scroller();
    if (sc && list.length) { // the topic in the middle of the view
      const mid = sc.getBoundingClientRect().top + sc.clientHeight / 2;
      let best = list[0], bestD = Infinity;
      for (const t of list) {
        const r = topicEl(t)?.getBoundingClientRect();
        if (!r) continue;
        const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    }
    return list[list.length - 1] || c.newTopic();
  }
  // at: { topic, x, y } from a drop point (centre of the picture), or null for "below this topic's text".
  function place(pic, at, sectionName) {
    const topic = at?.topic || targetTopic(sectionName) || c.newTopic();
    const paperW = c.paper()?.clientWidth || 840;
    if (at) {
      pic.x = Math.round(Math.max(0, Math.min(paperW - pic.w, at.x - pic.w / 2)));
      pic.y = Math.round(Math.max(0, at.y - (pic.w * pic.r) / 2));
    } else { pic.x = 56; pic.y = null; } // null = placed under the text on the next layout
    (topic.pics ||= []).push(pic);
    selected = pic.id;
    return topic;
  }

  /* ---------- adding pictures ---------- */
  async function insertFiles(files, at) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    busy(`Adding ${plural(imgs.length, 'picture')}…`);
    let n = 0, bad = 0;
    for (const f of imgs) {
      try {
        const rec = await api.addImage(c.nb.id, f.name || 'Picture', await c.downscale(f));
        const img = await loadImg(rec.file);
        const pic = { id: uid(), file: rec.file, name: rec.name, w: Math.min(420, img.naturalWidth), r: img.naturalHeight / img.naturalWidth, ink: [] };
        place(pic, at ? { ...at, x: at.x + n * 24, y: at.y + n * 24 } : null);
        n++;
      } catch { bad++; }
    }
    busy(null);
    await c.flush(true);
    c.render();
    if (bad) toast(`${plural(bad, 'file')} could not be read`);
    else toast('Picture added. Drag it to move, drag its corner to resize, or use the Draw tab to write on it.');
  }

  async function placeClip(clip, at) {
    try {
      let pic;
      if (clip.kind === 'diagram') {
        const d = clip.diagram;
        pic = { id: uid(), kind: 'diagram', name: clip.label, diagram: JSON.parse(JSON.stringify(d)), w: 460, r: d.height / d.width, ink: [] };
      } else {
        const cut = await crop(clip.src, clip.box);
        const rec = await api.addImage(c.nb.id, clip.label || 'Clipping', cut.bytes);
        pic = { id: uid(), file: rec.file, name: clip.label || 'Clipping', w: Math.min(400, cut.width), r: cut.height / cut.width, ink: [] };
      }
      place(pic, at, clip.section);
      clip.used = true;
      await c.flush(true);
      c.render();
      const node = $(`.pg-pic[data-pic="${pic.id}"]`, c.paper());
      if (!at) node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return pic;
    } catch (e) { fail(e); return null; }
  }

  async function removePic(id) {
    const hit = findPic(id);
    if (!hit) return;
    hit.topic.pics = hit.topic.pics.filter((p) => p !== hit.pic);
    if (hit.pic.file) api.removeImage(c.nb.id, hit.pic.file).catch(() => {});
    if (selected === id) selected = null;
    await c.flush(true);
    c.render();
  }
  /** Deletes the stored files of every picture in these topics (used when notes are rewritten or a topic is deleted). */
  function dropTopicPics(list) {
    for (const t of list) for (const p of t.pics || []) if (p.file) api.removeImage(c.nb.id, p.file).catch(() => {});
  }

  /* ---------- drawing pictures on the page ---------- */
  function select(id) {
    selected = id;
    $$('.pg-pic', c.paper()).forEach((n) => n.classList.toggle('sel', n.dataset.pic === id));
  }

  function diagramNodes(pic, el) {
    const d = pic.diagram;
    const art = document.createElementNS(NS, 'svg');
    art.setAttribute('class', 'dg-art');
    art.setAttribute('viewBox', `0 0 ${d.width} ${d.height}`);
    art.innerHTML = `<rect width="${d.width}" height="${d.height}" fill="#fff"/>${safeSvg(d.svg)}<g class="dg-lines"></g>`;
    const lines = $('.dg-lines', art);
    const layer = h('div', { class: 'dg-labels' });
    const pct = (v, total) => `${(v / total) * 100}%`;
    const changed = () => { c.save(); };

    function draw() {
      lines.replaceChildren();
      layer.replaceChildren();
      d.labels.forEach((l) => {
        if (l.px != null) {
          const line = document.createElementNS(NS, 'line');
          for (const [k, v] of [['x1', l.x], ['y1', l.y], ['x2', l.px], ['y2', l.py], ['stroke', '#475569'], ['stroke-width', d.width / 400]]) line.setAttribute(k, v);
          const dot = document.createElementNS(NS, 'circle');
          for (const [k, v] of [['cx', l.px], ['cy', l.py], ['r', d.width / 180], ['fill', '#475569']]) dot.setAttribute(k, v);
          lines.append(line, dot);
          // Handle for moving where the label points (shown while the picture is selected).
          const tip = h('div', { class: 'dg-tip', title: 'Drag to move where this label points', style: `left:${pct(l.px, d.width)};top:${pct(l.py, d.height)}` });
          dragPoint(tip, (x, y) => { l.px = x; l.py = y; }, draw);
          layer.append(tip);
        }
        const tag = h('div', { class: 'dg-label', text: l.text, title: 'Drag to move. Double-click to edit.', style: `left:${pct(l.x, d.width)};top:${pct(l.y, d.height)}` });
        dragPoint(tag, (x, y) => { l.x = x; l.y = y; }, draw);
        tag.addEventListener('dblclick', (e) => {
          if (c.mode() !== 'text') return;
          e.stopPropagation();
          tag.contentEditable = 'plaintext-only';
          tag.classList.add('editing');
          tag.focus();
          getSelection().selectAllChildren(tag);
        });
        tag.addEventListener('keydown', (e) => { if (tag.isContentEditable && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); tag.blur(); } e.stopPropagation(); });
        tag.addEventListener('blur', () => {
          if (!tag.isContentEditable) return;
          const text = tag.textContent.trim().slice(0, 140);
          if (text) l.text = text; else d.labels.splice(d.labels.indexOf(l), 1); // emptied = removed
          changed(); draw();
        });
        layer.append(tag);
      });
    }
    // Drags a label or its pointer; positions are stored in the diagram's own units.
    function dragPoint(node, set, redraw) {
      node.addEventListener('pointerdown', (e) => {
        if (c.mode() !== 'text' || node.isContentEditable || e.button > 0) return;
        e.stopPropagation(); e.preventDefault();
        select(pic.id);
        try { node.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        let moved = false;
        const move = (ev) => {
          const r = el.getBoundingClientRect();
          set(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * d.width), Math.round(Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) * d.height));
          moved = true;
          node.style.left = `${((ev.clientX - r.left) / r.width) * 100}%`; node.style.top = `${((ev.clientY - r.top) / r.height) * 100}%`;
        };
        const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); if (moved) { changed(); redraw(); } };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
      });
    }
    draw();
    el._addLabel = () => { d.labels.push({ text: 'New label', x: Math.round(d.width / 2), y: Math.round(d.height * 0.08), px: Math.round(d.width / 2), py: Math.round(d.height / 2) }); changed(); draw(); };
    return [art, layer];
  }

  function picNode(pic, topic) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pg-ink pic-ink');
    svg.setAttribute('viewBox', `0 0 1000 ${Math.round(1000 * pic.r)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    pic.ink ||= [];
    const el = h('div', {
      class: `pg-pic ${pic.kind === 'diagram' ? 'diagram' : ''} ${selected === pic.id ? 'sel' : ''}`, 'data-pic': pic.id,
      style: `left:${pic.x}px;top:${pic.y ?? 0}px;width:${pic.w}px;aspect-ratio:1 / ${pic.r};--picw:${pic.w}`,
    });
    const body = pic.kind === 'diagram' ? diagramNodes(pic, el) : [c.lazyImg({ file: pic.file, name: pic.name }, { draggable: false })];
    const bar = h('div', { class: 'pic-bar' },
      pic.kind === 'diagram' ? h('button', { text: '＋ Label', title: 'Add a label', onclick: () => el._addLabel() }) : null,
      h('button', { text: '✒ Draw on it', title: 'Switch to the Draw tab and write on this picture', onclick: () => c.drawMode() }),
      h('button', { text: '🗑', title: 'Delete this picture (Delete key)', onclick: () => removePic(pic.id) }));
    for (const b of $$('button', bar)) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    const handle = h('div', { class: 'pic-handle', title: 'Drag to resize' });
    el.append(...body, svg, bar, handle);
    picInks.set(pic.id, new Ink(svg, pic.ink, { getTool: toolSpec(c.mode), onCommit: (op) => c.history.push(op), scroller: c.scroller() }));

    // Typing mode: drag to move, corner to resize. Drawing mode: the ink layer takes the pointer instead.
    el.addEventListener('pointerdown', (e) => {
      if (c.mode() !== 'text' || e.button > 0 || e.target.closest('.dg-label.editing')) return;
      e.preventDefault();
      select(pic.id);
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      const resizing = e.target === handle;
      const paperW = c.paper().clientWidth;
      const start = { x: e.clientX, y: e.clientY, px: pic.x, py: pic.y ?? 0, w: pic.w };
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        if (resizing) {
          pic.w = Math.round(Math.max(60, Math.min(paperW - pic.x, start.w + dx)));
          el.style.width = `${pic.w}px`; el.style.setProperty('--picw', pic.w);
        } else {
          pic.x = Math.round(Math.max(0, Math.min(paperW - pic.w, start.px + dx)));
          pic.y = Math.round(start.py + dy);
          el.style.left = `${pic.x}px`; el.style.top = `${pic.y}px`;
        }
      };
      const up = () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        if (!moved) return;
        if (!resizing) rehome(pic, topic, el);
        c.save();
        c.render();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    return el;
  }

  // After a move: the picture joins whichever topic it now sits over.
  function rehome(pic, from, el) {
    const r = el.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    const list = topics().map((t) => [t, topicEl(t)?.getBoundingClientRect()]).filter(([, b]) => b);
    let to = list.find(([, b]) => midY >= b.top && midY < b.bottom)?.[0];
    if (!to) to = midY < list[0][1].top ? list[0][0] : list[list.length - 1][0];
    const box = topicEl(to).getBoundingClientRect();
    if (to !== from) {
      from.pics = from.pics.filter((p) => p !== pic);
      (to.pics ||= []).push(pic);
      pic.x = Math.round(r.left - box.left);
    }
    pic.y = Math.round(Math.max(0, r.top - box.top));
  }

  /** Adds a topic's pictures to its element. Call for each topic while rendering. */
  function mount(topic, el) {
    for (const pic of topic.pics || []) el.append(picNode(pic, topic));
  }
  /** After the page is in the document: settle "below the text" pictures and make room for all of them. */
  function layout() {
    let changed = false;
    for (const t of topics()) {
      const el = topicEl(t);
      if (!el) continue;
      const text = $('.pg-text', el);
      let floor = text.offsetTop + text.offsetHeight + 8;
      for (const p of t.pics || []) if (p.y != null) floor = Math.max(floor, p.y + p.w * p.r + 10);
      let bottom = 0;
      for (const p of t.pics || []) {
        if (p.y == null) { p.y = Math.round(floor); floor += p.w * p.r + 10; changed = true; const n = $(`.pg-pic[data-pic="${p.id}"]`, el); if (n) n.style.top = `${p.y}px`; }
        bottom = Math.max(bottom, p.y + p.w * p.r);
      }
      el.style.minHeight = bottom ? `${Math.ceil(bottom + 16)}px` : '';
    }
    if (changed) c.save();
  }
  function reset() { picInks.clear(); }

  /* ---------- clippings ---------- */
  const unused = () => clips().filter((x) => !x.used).length;
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (ix * iy) / (a.w * a.h + b.w * b.h - ix * iy);
  };
  /** Turns the AI's figure list for a batch of photos into clippings. Returns the new ones. */
  function addFigures(figures, batch) {
    const added = [];
    for (const f of figures || []) {
      const src = batch[f.image - 1]?.file;
      if (!src) continue;
      const [y0, x0, y1, x1] = f.box_2d.map((v) => v / 1000);
      const pad = 0.025; // the model's boxes run tight; a small margin keeps labels from being cut off
      const box = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad) };
      box.w = Math.min(1, x1 + pad) - box.x; box.h = Math.min(1, y1 + pad) - box.y;
      if (clips().some((k) => k.src === src && overlap(k.box, box) > 0.6)) continue;
      const clip = { id: uid(), src, box, label: f.label, section: f.section || '' };
      clips().push(clip);
      added.push(clip);
    }
    if (added.length) dockOpen = true;
    return added;
  }
  function addManualClip(src, box) {
    clips().push({ id: uid(), src, box, label: 'Clipping', section: '' });
    dockOpen = true;
    c.save();
    renderDock();
  }
  function forgetPhoto(file) { c.page().clips = clips().filter((k) => k.src !== file); }

  /** Looks through this page's photos for figures (one AI request per batch). */
  async function scan() {
    const imgs = c.page().images;
    if (!imgs.length) return toast('Add photos to this page first');
    if (!(await ensureAi())) return;
    const size = (await getSettings()).provider === 'ollama' ? 2 : 6;
    if (!(await checkBudget(Math.ceil(imgs.length / size)))) return;
    let found = 0;
    try {
      for (let i = 0; i < imgs.length; i += size) {
        const batch = imgs.slice(i, i + size);
        busy(`Looking for diagrams in photos ${i + 1}–${i + batch.length} of ${imgs.length}…`);
        found += addFigures((await api.findFigures({ id: c.nb.id, files: batch.map((b) => b.file) })).figures, batch).length;
      }
      busy(null);
      toast(found ? `${plural(found, 'new diagram')} found` : 'No new diagrams found in these photos');
    } catch (e) { fail(e); }
    dockOpen = true;
    await c.flush(true);
    renderDock();
  }

  /** Asks the AI to redraw a clipped figure as a clean, editable diagram. Adds it to the tray. */
  async function redraw(clip, quiet) {
    if (!quiet && !(await ensureAi())) return null;
    try {
      if (!quiet) busy(`Drawing a clean version of "${clip.label}"…`);
      const cut = await crop(clip.src, clip.box, 1400);
      const topic = topics().find((t) => t.heading && clip.section && t.heading.trim().toLowerCase() === clip.section.trim().toLowerCase());
      const diagram = await api.drawDiagram({ bytes: cut.bytes, label: clip.label, context: topic ? htmlToText(topic.html).slice(0, 3000) : '' });
      const made = { id: uid(), kind: 'diagram', diagram, label: diagram.title || clip.label, section: clip.section, from: clip.id };
      const at = clips().indexOf(clip);
      clips().splice(at + 1, 0, made);
      clip.drawn = true;
      if (!quiet) { busy(null); toast('Clean diagram added to Clippings'); await c.flush(true); renderDock(); }
      return made;
    } catch (e) { if (!quiet) fail(e); return null; }
  }
  /** After notes are generated: redraw the first few figures, unless turned off or the daily allowance is running low. */
  async function autoDraw(newClips) {
    const settings = await getSettings();
    if (!settings.autoDraw || !newClips.length) return 0;
    const u = await getUsage();
    const todo = newClips.slice(0, AUTO_DRAW_MAX);
    if (u && u.limit && u.left < todo.length + 3) return 0; // keep what is left for notes
    let made = 0;
    for (let i = 0; i < todo.length; i++) {
      busy(`Drawing a clean version of diagram ${i + 1} of ${todo.length}…`);
      if (await redraw(todo[i], true)) made++;
    }
    return made;
  }

  function thumb(clip) {
    if (clip.kind === 'diagram') {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${clip.diagram.width} ${clip.diagram.height}`);
      svg.setAttribute('class', 'clip-thumb');
      svg.innerHTML = `<rect width="100%" height="100%" fill="#fff"/>${safeSvg(clip.diagram.svg)}`;
      return svg;
    }
    const cv = h('canvas', { class: 'clip-thumb', width: 220, height: 140 });
    loadImg(clip.src).then((img) => {
      const sw = clip.box.w * img.naturalWidth, sh = clip.box.h * img.naturalHeight;
      cv.height = Math.max(40, Math.round((220 * sh) / sw));
      cv.getContext('2d').drawImage(img, clip.box.x * img.naturalWidth, clip.box.y * img.naturalHeight, sw, sh, 0, 0, cv.width, cv.height);
    }).catch(() => {});
    return cv;
  }

  function renderDock() {
    if (!dockEl) return;
    const page = c.page();
    const list = clips();
    dockEl.hidden = !page.images.length && !list.length;
    dockEl.className = `clip-dock ${dockOpen ? 'open' : ''}`;
    if (!dockOpen) {
      dockEl.replaceChildren(h('button', { class: 'clip-pill', title: 'Diagrams and pictures found in your photos', onclick: () => { dockOpen = true; renderDock(); } },
        h('span', { text: '📎 Clippings' }), unused() ? h('span', { class: 'rb-badge', text: unused() }) : null));
      return;
    }
    dockEl.replaceChildren(
      h('div', { class: 'clip-head' }, h('b', { text: '📎 Clippings' }), h('span', { class: 'spacer' }),
        h('button', { class: 'icon-btn', title: 'Hide', text: '▾', onclick: () => { dockOpen = false; renderDock(); } })),
      h('p', { class: 'muted small clip-hint', text: list.length ? 'Diagrams from your photos. Drag one into your notes, or press Place.' : 'Diagrams found in your photos appear here, ready to drop into your notes.' }),
      h('div', { class: 'clip-list' }, list.map((clip) => {
        const card = h('div', { class: `clip ${clip.used ? 'used' : ''} ${clip.kind === 'diagram' ? 'drawn' : ''}`, draggable: true, 'data-clip': clip.id, title: 'Drag into your notes' },
          thumb(clip),
          h('div', { class: 'clip-name' }, h('span', { class: 'pill', text: clip.kind === 'diagram' ? '✨ Clean diagram' : 'From photo' }), h('span', { text: clip.label })),
          h('div', { class: 'clip-actions' },
            h('button', { class: 'btn small primary', text: clip.used ? 'Place again' : 'Place', title: clip.section ? `Put it under "${clip.section}"` : 'Put it in your notes', onclick: () => placeClip(clip) }),
            clip.kind !== 'diagram' ? h('button', { class: 'btn small', text: clip.drawn ? '✨ Redraw again' : '✨ Redraw', title: 'Have the AI draw a clean, editable version of this diagram (1 AI request)', onclick: () => redraw(clip) }) : null,
            h('button', { class: 'icon-btn', title: 'Remove from Clippings', text: '✕', onclick: () => { page.clips = list.filter((k) => k !== clip); c.save(); renderDock(); } })));
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData(CLIP_TYPE, clip.id); e.dataTransfer.effectAllowed = 'copy'; });
        return card;
      })),
      h('div', { class: 'clip-foot' },
        unused() > 1 ? h('button', { class: 'btn small', text: 'Place all', title: 'Put every unused clipping under its section', onclick: async () => { for (const k of list.filter((x) => !x.used)) await placeClip(k); } }) : null,
        page.images.length ? h('button', { class: 'btn small', text: '🔍 Scan photos', title: 'Look through this page\'s photos for diagrams (uses AI requests)', onclick: scan }) : null));
    if (c.ribbonRefresh) c.ribbonRefresh();
  }
  /** The tray element; the page adds it to its root on each render. */
  function dock() {
    dockEl = h('div', { class: 'clip-dock' });
    renderDock();
    return dockEl;
  }
  function toggleDock(open = !dockOpen) { dockOpen = open; renderDock(); if (dockEl && open) dockEl.hidden = false; }

  /** Lets clippings be dropped onto the notes. Call once per render with the paper element. */
  function bindPaper(paper) {
    paper.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes(CLIP_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    paper.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData(CLIP_TYPE);
      const clip = id && clips().find((k) => k.id === id);
      if (!clip) return;
      e.preventDefault(); e.stopPropagation();
      placeClip(clip, pointOn(e.clientX, e.clientY));
    });
    paper.addEventListener('pointerdown', (e) => { if (selected && !e.target.closest('.pg-pic')) select(null); });
  }
  /** Converts a screen point to { topic, x, y } on the notes, or null when the page has no topics. */
  function pointOn(clientX, clientY) {
    const list = topics().map((t) => [t, topicEl(t)?.getBoundingClientRect()]).filter(([, b]) => b);
    if (!list.length) return null;
    let hit = list.find(([, b]) => clientY >= b.top && clientY < b.bottom);
    if (!hit) hit = clientY < list[0][1].top ? list[0] : list[list.length - 1];
    return { topic: hit[0], x: clientX - hit[1].left, y: Math.max(0, clientY - hit[1].top) };
  }

  const onKey = (e) => {
    if (!selected || (e.key !== 'Delete' && e.key !== 'Backspace') || c.mode() !== 'text') return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || $('.modal-backdrop')) return;
    e.preventDefault();
    removePic(selected);
  };
  document.addEventListener('keydown', onKey);

  return {
    mount, layout, reset, dock, bindPaper, pointOn, insertFiles, placeClip, removePic, dropTopicPics, addFigures, addManualClip, forgetPhoto, autoDraw, redraw, scan, toggleDock,
    inkFor: (id) => picInks.get(id), count: () => allPics().length, unused, select,
    dispose: () => document.removeEventListener('keydown', onKey),
  };
}
