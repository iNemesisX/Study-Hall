// Exporting notes to other apps. Everything is built on the device:
//   Word (.docx)        -> Word, Google Docs (upload to Drive), Notion (Import › Word keeps pictures)
//   PowerPoint (.pptx)  -> PowerPoint, Google Slides (upload to Drive), Keynote
//   Evernote (.enex)    -> Evernote (File › Import)
//   Markdown            -> Obsidian (written straight into the vault on desktop; a .zip on tablets)
// Text, headings, lists, tables, highlights, formulas (as LaTeX), Q&A, pictures and
// diagrams are included. Pen ink is only in the PDF export.
import * as nbstore from './nbstore.js';
import { safeSvg } from './pics.js';
import { loadScript } from './sources.js';
import { saveFile } from './transfer.js';
import { isDesktop } from '../platform.js';

const api = nbstore.api;
const files = window.studyhall?.files;
const IMG_EDGE = 1400; // px: keeps exports small (Notion's free plan imports files up to 5 MB)

/* ---------- gathering ---------- */
/** [{ section, meta, page }] for one page or a whole notebook. */
export async function gather(nb, pageId) {
  const out = [];
  for (const sec of nb.sections) {
    for (const meta of sec.pages) {
      if (pageId && meta.id !== pageId) continue;
      const page = await nbstore.loadPage(nb.id, meta.id);
      if (page) out.push({ section: sec.name, meta, page });
    }
  }
  return out;
}

/* ---------- notes HTML -> simple blocks ---------- */
// Runs: { text, b, i, u, s, code, math, hl }   Blocks: h3 | p | list | table | math | qa | answer
const rgbHex = c => {
  const m = String(c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m || m[4] === '0') return /^#[0-9a-f]{6}$/i.test(c) ? c.slice(1).toUpperCase() : null;
  return [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
};
function runsOf(node, fmt = {}, out = []) {
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { if (c.nodeValue) out.push({ ...fmt, text: c.nodeValue.replace(/\s+/g, ' ') }); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName;
    if (c.classList.contains('math')) { out.push({ ...fmt, text: c.dataset.tex || c.textContent, math: true }); continue; }
    if (c.classList.contains('ai-answer-tag') || c.classList.contains('formula-label') && false) continue;
    if (tag === 'BR') { out.push({ ...fmt, text: '\n' }); continue; }
    const f = { ...fmt };
    if (tag === 'B' || tag === 'STRONG') f.b = true;
    if (tag === 'I' || tag === 'EM') f.i = true;
    if (tag === 'U') f.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') f.s = true;
    if (tag === 'CODE') f.code = true;
    const st = c.style;
    if (st?.fontWeight === 'bold' || +st?.fontWeight >= 600) f.b = true;
    if (st?.fontStyle === 'italic') f.i = true;
    if (st?.textDecorationLine?.includes('underline') || st?.textDecoration?.includes('underline')) f.u = true;
    if (st?.textDecorationLine?.includes('line-through') || st?.textDecoration?.includes('line-through')) f.s = true;
    const bg = rgbHex(st?.backgroundColor);
    if (bg && bg !== 'FFFFFF') f.hl = bg;
    runsOf(c, f, out);
  }
  return out;
}
const trimRuns = runs => {
  const r = runs.filter(x => x.text);
  if (r.length) { r[0] = { ...r[0], text: r[0].text.replace(/^\s+/, '') }; const l = r.length - 1; r[l] = { ...r[l], text: r[l].text.replace(/\s+$/, '') }; }
  return r.filter(x => x.text);
};
export const plain = runs => runs.map(r => (r.math ? `$${r.text}$` : r.text)).join('');

export function toBlocks(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  const blocks = [];
  const walk = (parent, style = null) => {
    for (const el of parent.children) {
      const tag = el.tagName;
      const cls = el.classList;
      if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') blocks.push({ t: 'h3', runs: trimRuns(runsOf(el)) });
      else if (tag === 'UL' || tag === 'OL') {
        const items = [];
        const list = (node, level) => {
          for (const li of node.children) {
            if (li.tagName !== 'LI') continue;
            const own = li.cloneNode(true);
            own.querySelectorAll('ul, ol').forEach(n => n.remove());
            items.push({ runs: trimRuns(runsOf(own)), level });
            li.querySelectorAll(':scope > ul, :scope > ol').forEach(n => list(n, level + 1));
          }
        };
        list(el, 0);
        blocks.push({ t: 'list', ordered: tag === 'OL', items, style });
      } else if (tag === 'TABLE') {
        const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.children].map(td => trimRuns(runsOf(td))));
        if (rows.length) blocks.push({ t: 'table', rows });
      } else if (tag === 'DETAILS') {
        const q = el.querySelector('summary');
        const a = el.querySelector('.qa-a');
        blocks.push({ t: 'qa', q: q ? trimRuns(runsOf(q)) : [], a: a ? trimRuns(runsOf(a)) : [] });
      } else if (cls.contains('ai-answer')) {
        const tagText = el.querySelector('.ai-answer-tag')?.textContent.match(/to "(.*)" ·/)?.[1];
        blocks.push({ t: 'answer', q: tagText || '' });
        walk(el, 'answer');
        blocks.push({ t: 'answer-end' });
      } else if (cls.contains('formula')) {
        const label = el.querySelector('.formula-label');
        const m = el.querySelector('.math');
        if (label) blocks.push({ t: 'p', runs: trimRuns(runsOf(label)), style: 'formula-label' });
        if (m) blocks.push({ t: 'math', tex: m.dataset.tex || m.textContent });
      } else if (tag === 'DIV' && el.children.length && !el.querySelector(':scope > br:only-child')) {
        walk(el, cls.contains('example') ? 'example' : style);
      } else {
        const runs = trimRuns(runsOf(el));
        if (!runs.length) continue;
        const s = cls.contains('def') ? 'def' : cls.contains('callout') ? 'callout' : cls.contains('lead') ? 'lead' : style;
        blocks.push({ t: 'p', runs, style: s });
      }
    }
  };
  walk(t.content);
  return blocks;
}

/* ---------- pictures ---------- */
async function shrink(bytes, type = 'image/jpeg') {
  const bmp = await createImageBitmap(new Blob([bytes], { type }));
  const k = Math.min(1, IMG_EDGE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return { bytes: new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()), w: c.width, h: c.height, ext: 'jpg', mime: 'image/jpeg' };
}
/** AI-drawn diagram -> PNG, with its labels. */
async function diagramPng(d) {
  const lines = (d.labels || []).map(l => (l.px != null ? `<line x1="${l.x}" y1="${l.y}" x2="${l.px}" y2="${l.py}" stroke="#475569" stroke-width="${d.width / 400}"/><circle cx="${l.px}" cy="${l.py}" r="${d.width / 180}" fill="#475569"/>` : '')).join('');
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fs = Math.max(10, d.width * 0.027);
  const labels = (d.labels || []).map(l => {
    const w = String(l.text).length * fs * 0.56 + fs;
    return `<rect x="${l.x - w / 2}" y="${l.y - fs * 0.8}" width="${w}" height="${fs * 1.6}" rx="${fs * 0.3}" fill="#fff" stroke="#cbd5e1"/><text x="${l.x}" y="${l.y}" font-family="sans-serif" font-weight="600" font-size="${fs}" fill="#1f2937" text-anchor="middle" dominant-baseline="middle">${esc(l.text)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}"><rect width="${d.width}" height="${d.height}" fill="#fff"/>${safeSvg(d.svg)}${lines}${labels}</svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const k = Math.min(2, IMG_EDGE / Math.max(d.width, d.height));
  const c = document.createElement('canvas');
  c.width = Math.round(d.width * k); c.height = Math.round(d.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { bytes: new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()), w: c.width, h: c.height, ext: 'png', mime: 'image/png' };
}
/** The pictures of one heading, top to bottom: [{ name, bytes, w, h, ext, mime }] */
async function picsOf(nbId, topic) {
  const out = [];
  for (const pic of [...(topic.pics || [])].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))) {
    try {
      const img = pic.kind === 'diagram' ? await diagramPng(pic.diagram) : await shrink(await api.readImage(nbId, pic.file));
      out.push({ ...img, name: pic.name || 'Picture' });
    } catch { /* missing or unreadable: skip */ }
  }
  return out;
}

/** Everything an exporter needs, already converted: [{ section, title, created, topics: [{ heading, blocks, pics }] }] */
export async function prepare(nb, pageId, progress) {
  const pages = await gather(nb, pageId);
  const out = [];
  for (const [n, { section, meta, page }] of pages.entries()) {
    progress?.(`Preparing page ${n + 1} of ${pages.length}: ${page.title}…`);
    const topics = [];
    for (const t of page.topics || []) topics.push({ heading: t.heading || '', blocks: toBlocks(t.html), pics: await picsOf(nb.id, t) });
    out.push({ section, title: page.title || meta.title || 'Untitled page', created: page.created || Date.now(), guide: page.kind === 'guide', topics });
  }
  return out;
}

/* ---------- Word ---------- */
export async function buildDocx(nb, pages, { single }) {
  const D = await loadScript('docx/dist/index.iife.js', 'docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun, ShadingType, WidthType, BorderStyle, LevelFormat, AlignmentType } = D;
  let listInstance = 0;
  const textRuns = (runs, extra = {}) => runs.flatMap(r => r.text.split('\n').map((part, i) => new TextRun({
    text: part, break: i ? 1 : 0, bold: r.b || extra.bold, italics: r.i || extra.italics, underline: r.u ? {} : undefined, strike: r.s,
    font: r.math ? 'Cambria Math' : r.code ? 'Consolas' : undefined, shading: r.hl ? { type: ShadingType.CLEAR, fill: r.hl, color: 'auto' } : undefined,
  })));
  const box = fill => ({ shading: { type: ShadingType.CLEAR, fill, color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: '5A45C2', space: 6 } } });
  const kids = [];
  const image = p => {
    const w = Math.min(520, p.w), hgt = Math.round(w * p.h / p.w);
    kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: p.ext === 'png' ? 'png' : 'jpg', data: p.bytes, transformation: { width: w, height: hgt }, altText: { title: p.name, description: p.name, name: p.name } })] }));
    if (p.name) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.name, italics: true, size: 18, color: '605E5C' })] }));
  };
  const blocks = list => {
    let inAnswer = false;
    for (const b of list) {
      const extra = inAnswer ? box('F4F1FE') : {};
      if (b.t === 'h3') kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: textRuns(b.runs) }));
      else if (b.t === 'p') {
        const style = b.style === 'callout' ? box('FFF7E0') : b.style === 'def' ? box('EEF6FF') : b.style === 'example' ? box('F3F2F1') : extra;
        kids.push(new Paragraph({ ...style, children: textRuns(b.runs, { italics: b.style === 'lead' }) }));
      } else if (b.t === 'math') kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.tex, font: 'Cambria Math' })] }));
      else if (b.t === 'list') {
        const inst = ++listInstance;
        for (const it of b.items) kids.push(new Paragraph({ ...extra, children: textRuns(it.runs), ...(b.ordered ? { numbering: { reference: 'num', level: Math.min(it.level, 2), instance: inst } } : { bullet: { level: Math.min(it.level, 2) } }) }));
      } else if (b.t === 'table') {
        const cols = Math.max(...b.rows.map(r => r.length));
        kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: Array.from({ length: cols }, (_, k) => new TableCell({ shading: i === 0 ? { type: ShadingType.CLEAR, fill: 'EDEBE9', color: 'auto' } : undefined, children: [new Paragraph({ children: textRuns(r[k] || [], { bold: i === 0 }) })] })) })) }));
        kids.push(new Paragraph({ children: [] }));
      } else if (b.t === 'qa') {
        kids.push(new Paragraph({ ...box('F3F2F1'), children: [new TextRun({ text: 'Q: ', bold: true }), ...textRuns(b.q)] }));
        kids.push(new Paragraph({ ...box('F3F2F1'), children: [new TextRun({ text: 'A: ', bold: true }), ...textRuns(b.a)] }));
      } else if (b.t === 'answer') { inAnswer = true; kids.push(new Paragraph({ ...box('F4F1FE'), children: [new TextRun({ text: `AI answer${b.q ? `: ${b.q}` : ''}`, bold: true, color: '5A45C2', size: 18 })] })); }
      else if (b.t === 'answer-end') inAnswer = false;
    }
  };
  if (!single) {
    kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(nb.name)] }));
    kids.push(new Paragraph({ children: [new TextRun({ text: `Exported from Study Hall, ${new Date().toLocaleDateString()}`, color: '605E5C' })] }));
  }
  let lastSection = null;
  for (const [n, pg] of pages.entries()) {
    if (!single && pg.section !== lastSection) { kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: n > 0, children: [new TextRun(pg.section)] })); lastSection = pg.section; }
    kids.push(new Paragraph({ heading: single ? HeadingLevel.TITLE : HeadingLevel.HEADING_1, children: [new TextRun(pg.title)] }));
    kids.push(new Paragraph({ children: [new TextRun({ text: new Date(pg.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), color: '605E5C', size: 18 })] }));
    for (const t of pg.topics) {
      if (t.heading) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t.heading)] }));
      blocks(t.blocks);
      t.pics.forEach(image);
    }
  }
  const doc = new Document({
    creator: 'Study Hall', title: single ? pages[0]?.title : nb.name,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: { config: [{ reference: 'num', levels: [0, 1, 2].map(level => ({ level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    sections: [{ children: kids }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}

/* ---------- PowerPoint ---------- */
export async function buildPptx(nb, pages, { single }) {
  const Pptx = await loadScript('pptxgenjs/dist/pptxgen.bundle.js', 'PptxGenJS');
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = single ? pages[0]?.title : nb.name;
  pptx.defineSlideMaster({ title: 'NOTES', background: { color: 'FFFFFF' }, objects: [{ rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: '5A45C2' } } }] });
  const run = (r, opts = {}) => ({ text: r.math ? r.text : r.text, options: { bold: r.b, italic: r.i, underline: r.u ? { style: 'sng' } : undefined, strike: r.s ? 'sngStrike' : undefined, highlight: r.hl, fontFace: r.math ? 'Cambria Math' : r.code ? 'Consolas' : undefined, ...opts } });
  const para = (runs, opts) => { const parts = runs.length ? runs.map(r => run(r)) : [{ text: ' ', options: {} }]; Object.assign(parts[parts.length - 1].options, { breakLine: true }); Object.assign(parts[0].options, opts); return parts; };
  const LINES = 13;
  const lineCost = runs => Math.max(1, Math.ceil(plain(runs).length / 95));
  const titleSlide = (title, sub) => {
    const s = pptx.addSlide({ masterName: 'NOTES' });
    s.addText(title, { x: 0.8, y: 2.4, w: 11.7, h: 1.4, fontSize: 40, bold: true, color: '201F1E', fontFace: 'Calibri' });
    if (sub) s.addText(sub, { x: 0.8, y: 3.9, w: 11.7, h: 0.6, fontSize: 18, color: '605E5C' });
  };
  const contentSlide = (title, items, notes) => {
    const s = pptx.addSlide({ masterName: 'NOTES' });
    s.addText(title || ' ', { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 28, bold: true, color: '4B38A8', fontFace: 'Calibri' });
    s.addText(items.flat(), { x: 0.6, y: 1.35, w: 12.1, h: 5.8, fontSize: 18, color: '201F1E', valign: 'top', fontFace: 'Calibri', paraSpaceAfter: 6 });
    if (notes) s.addNotes(notes);
  };
  if (!single) titleSlide(nb.name, `Exported from Study Hall · ${new Date().toLocaleDateString()}`);
  for (const pg of pages) {
    titleSlide(pg.title, `${single ? '' : `${pg.section} · `}${new Date(pg.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`);
    for (const t of pg.topics) {
      let items = [], used = 0, notes = [], part = 0;
      const flush = () => { if (items.length) { contentSlide(`${t.heading}${part ? ' (continued)' : ''}`, items, notes.join('\n')); part++; } items = []; used = 0; notes = []; };
      const add = (p, cost) => { if (used + cost > LINES && items.length) flush(); items.push(p); used += cost; };
      for (const b of t.blocks) {
        if (b.t === 'h3') add(para(b.runs, { bold: true, color: '4B38A8', fontSize: 20 }), 1.3);
        else if (b.t === 'p') add(para(b.runs, b.style === 'lead' ? { italic: true, color: '605E5C' } : {}), lineCost(b.runs));
        else if (b.t === 'math') add(para([{ text: b.tex, math: true }], { align: 'center' }), 1.2);
        else if (b.t === 'list') b.items.forEach((it, k) => add(para(it.runs, { bullet: b.ordered ? { type: 'number', startAt: k + 1 } : true, indentLevel: it.level }), lineCost(it.runs)));
        else if (b.t === 'qa') { add(para([{ text: 'Check yourself: ', b: true }, ...b.q]), lineCost(b.q)); notes.push(`Q: ${plain(b.q)}\nA: ${plain(b.a)}`); }
        else if (b.t === 'answer') add(para([{ text: `AI answer${b.q ? `: ${b.q}` : ''}`, b: true }], { color: '5A45C2', fontSize: 14 }), 1);
        else if (b.t === 'table') {
          flush();
          const s = pptx.addSlide({ masterName: 'NOTES' });
          s.addText(t.heading || ' ', { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 28, bold: true, color: '4B38A8' });
          const rows = b.rows.slice(0, 14).map((r, i) => r.map(c => ({ text: plain(c), options: { bold: i === 0, fill: { color: i === 0 ? 'EDEBE9' : 'FFFFFF' } } })));
          s.addTable(rows, { x: 0.6, y: 1.35, w: 12.1, fontSize: 14, border: { type: 'solid', pt: 0.5, color: 'C8C6C4' }, autoPage: true, autoPageRepeatHeader: true });
          part++;
        }
      }
      flush();
      if (!part && t.heading && !t.pics.length) contentSlide(t.heading, [para([{ text: ' ' }])]);
      for (const p of t.pics) {
        const s = pptx.addSlide({ masterName: 'NOTES' });
        s.addText(t.heading || p.name, { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 28, bold: true, color: '4B38A8' });
        const k = Math.min(12.1 / p.w, 5.6 / p.h);
        const w = p.w * k, hgt = p.h * k;
        s.addImage({ data: `${p.mime};base64,${b64(p.bytes)}`, x: (13.33 - w) / 2, y: 1.35 + (5.6 - hgt) / 2, w, h: hgt, altText: p.name });
        s.addText(p.name, { x: 0.6, y: 7.0, w: 12.1, h: 0.35, fontSize: 12, italic: true, color: '605E5C', align: 'center' });
      }
    }
  }
  return pptx.write({ outputType: 'uint8array' });
}

/* ---------- Evernote (.enex) ---------- */
const x = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function runsHtml(runs) {
  return runs.map(r => {
    let t = x(r.math ? `$${r.text}$` : r.text).replace(/\n/g, '<br/>');
    if (r.code) t = `<code>${t}</code>`;
    if (r.b) t = `<b>${t}</b>`;
    if (r.i) t = `<i>${t}</i>`;
    if (r.u) t = `<u>${t}</u>`;
    if (r.s) t = `<s>${t}</s>`;
    if (r.hl) t = `<span style="background-color:#${r.hl}">${t}</span>`;
    return t;
  }).join('');
}
/** Shared by Evernote and HTML: blocks -> XHTML. img(p) returns the tag for a picture. */
function blocksHtml(list, img) {
  const out = [];
  for (const b of list) {
    if (b.t === 'h3') out.push(`<h3>${runsHtml(b.runs)}</h3>`);
    else if (b.t === 'p') {
      const st = { callout: 'background-color:#FFF7E0;padding:6px 10px;border-left:4px solid #B07A10', def: 'background-color:#EEF6FF;padding:6px 10px;border-left:4px solid #1D6FD8', example: 'background-color:#F3F2F1;padding:6px 10px', lead: 'font-style:italic;color:#605E5C' }[b.style];
      out.push(`<div${st ? ` style="${st}"` : ''}>${runsHtml(b.runs)}</div>`);
    } else if (b.t === 'math') out.push(`<div style="text-align:center;font-family:'Cambria Math',serif">${x(b.tex)}</div>`);
    else if (b.t === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${b.items.map(it => `<li${it.level ? ` style="margin-left:${it.level * 24}px"` : ''}>${runsHtml(it.runs)}</li>`).join('')}</${tag}>`);
    } else if (b.t === 'table') out.push(`<table style="border-collapse:collapse">${b.rows.map((r, i) => `<tr>${r.map(c => `<${i ? 'td' : 'th'} style="border:1px solid #C8C6C4;padding:4px 8px">${runsHtml(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`);
    else if (b.t === 'qa') out.push(`<div style="background-color:#F3F2F1;padding:6px 10px"><b>Q:</b> ${runsHtml(b.q)}<br/><b>A:</b> ${runsHtml(b.a)}</div>`);
    else if (b.t === 'answer') out.push(`<div style="color:#5A45C2;font-size:12px"><b>AI answer${b.q ? `: ${x(b.q)}` : ''}</b></div>`);
  }
  return out.join('');
}
export async function buildEnex(nb, pages) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const notes = [];
  for (const pg of pages) {
    const res = [];
    let body = '';
    for (const t of pg.topics) {
      if (t.heading) body += `<h2>${x(t.heading)}</h2>`;
      body += blocksHtml(t.blocks);
      for (const p of t.pics) {
        const hash = md5(p.bytes);
        res.push(`<resource><data encoding="base64">${b64(p.bytes)}</data><mime>${p.mime}</mime><width>${p.w}</width><height>${p.h}</height><resource-attributes><file-name>${x(p.name)}.${p.ext}</file-name></resource-attributes></resource>`);
        body += `<div><en-media type="${p.mime}" hash="${hash}"/></div>`;
      }
    }
    const created = new Date(pg.created).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const enml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${body || '<div><br/></div>'}</en-note>`;
    notes.push(`<note><title>${x(pg.title.slice(0, 255))}</title><created>${created}</created><updated>${now}</updated><tag>${x(nb.name.slice(0, 100))}</tag><content><![CDATA[${enml.replace(/]]>/g, ']]]]><![CDATA[>')}]]></content>${res.join('')}</note>`);
  }
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n<en-export export-date="${now}" application="Study Hall" version="1">\n${notes.join('\n')}\n</en-export>\n`);
}

/* ---------- Markdown (Obsidian) ---------- */
function runsMd(runs) {
  return runs.map(r => {
    if (r.math) return `$${r.text}$`;
    let t = r.text.replace(/([*_`~=[\]\\])/g, '\\$1').replace(/\n/g, '  \n');
    if (!t.trim()) return t;
    const lead = t.match(/^\s*/)[0], tail = t.match(/\s*$/)[0];
    t = t.trim();
    if (r.code) t = `\`${r.text.trim()}\``;
    if (r.b) t = `**${t}**`;
    if (r.i) t = `*${t}*`;
    if (r.s) t = `~~${t}~~`;
    if (r.hl) t = `==${t}==`;
    return lead + t + tail;
  }).join('');
}
const safeName = s => String(s || 'Untitled').replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
/** Returns [{ path, text | bytes }] for an Obsidian vault folder. */
export function buildMarkdown(nb, pages, { single }) {
  const out = [];
  const used = new Set();
  const root = single ? '' : `${safeName(nb.name)}/`;
  for (const pg of pages) {
    const dir = single ? '' : `${root}${safeName(pg.section)}/`;
    let name = safeName(pg.title), k = 2;
    while (used.has(dir + name)) name = `${safeName(pg.title)} ${k++}`;
    used.add(dir + name);
    const lines = ['---', `title: "${pg.title.replace(/"/g, '\\"')}"`, `created: ${new Date(pg.created).toISOString().slice(0, 10)}`, `notebook: "${nb.name.replace(/"/g, '\\"')}"`, `section: "${String(pg.section).replace(/"/g, '\\"')}"`, 'source: Study Hall', '---', '', `# ${pg.title}`, ''];
    let pic = 0;
    for (const t of pg.topics) {
      if (t.heading) lines.push(`## ${t.heading}`, '');
      let answer = false;
      for (const b of t.blocks) {
        const q = answer ? '> ' : '';
        if (b.t === 'h3') lines.push(`${q}### ${runsMd(b.runs)}`, q);
        else if (b.t === 'p') {
          if (b.style === 'callout') lines.push(`${q}> [!important]`, `${q}> ${runsMd(b.runs)}`, q);
          else if (b.style === 'def') lines.push(`${q}> [!note] Definition`, `${q}> ${runsMd(b.runs)}`, q);
          else lines.push(`${q}${b.style === 'lead' ? `*${runsMd(b.runs)}*` : runsMd(b.runs)}`, q);
        } else if (b.t === 'math') lines.push(`${q}$$`, `${q}${b.tex}`, `${q}$$`, q);
        else if (b.t === 'list') { b.items.forEach((it, n) => lines.push(`${q}${'    '.repeat(it.level)}${b.ordered ? `${n + 1}.` : '-'} ${runsMd(it.runs)}`)); lines.push(q); }
        else if (b.t === 'table') {
          const cols = Math.max(...b.rows.map(r => r.length));
          const row = r => `${q}| ${Array.from({ length: cols }, (_, i) => runsMd(r[i] || []).replace(/\|/g, '\\|')).join(' | ')} |`;
          lines.push(row(b.rows[0]), `${q}|${' --- |'.repeat(cols)}`, ...b.rows.slice(1).map(row), q);
        } else if (b.t === 'qa') lines.push(`${q}> [!question]- ${runsMd(b.q)}`, `${q}> ${runsMd(b.a)}`, q);
        else if (b.t === 'answer') { answer = true; lines.push(`> [!tip] AI answer${b.q ? `: ${b.q}` : ''}`); }
        else if (b.t === 'answer-end') { answer = false; lines.push(''); }
      }
      for (const p of t.pics) {
        const file = `${safeName(pg.title)} ${++pic}.${p.ext}`;
        out.push({ path: `${root}attachments/${file}`, bytes: p.bytes });
        lines.push(`![[${file}]]`, p.name ? `*${p.name}*` : '', '');
      }
    }
    out.push({ path: `${dir}${name}.md`, text: lines.join('\n').replace(/\n{3,}/g, '\n\n') });
  }
  return out;
}

/* ---------- helpers ---------- */
export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Saves bytes: a Save dialog on desktop, the share sheet / download elsewhere. Resolves the saved path (desktop), true, or null. */
export async function saveBytes(name, mime, bytes) {
  if (isDesktop && files) return files.saveAs(name, bytes);
  return (await saveFile(name, mime, bytes)) ? true : null;
}
export async function zip(list) {
  const JSZip = await loadScript('jszip/dist/jszip.min.js', 'JSZip');
  const z = new JSZip();
  for (const f of list) z.file(f.path, f.bytes || f.text);
  return z.generateAsync({ type: 'uint8array' });
}
export const openUrl = url => (files ? files.openUrl(url) : window.open(url, '_blank', 'noopener'));

// MD5 (RFC 1321), needed for Evernote's picture references.
export function md5(bytes) {
  const K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
  const len = bytes.length, total = (((len + 8) >> 6) + 1) * 64;
  const m = new Uint8Array(total);
  m.set(bytes); m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  const w = new Int32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d; d = c; c = b;
      const sum = (a + f + K[i] + w[g]) | 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}
