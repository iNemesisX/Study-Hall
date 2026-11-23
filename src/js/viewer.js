// The read-only web page that view-only links open (view.html#<token>).
// No sign-in: the database returns a notebook only while its owner keeps the link on.
// Notes written by other people are untrusted, so their HTML is cleaned before display.
import { CLOUD } from './cloud/config.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BUCKET = 'notebook-files';

/* ---------- cleaning shared HTML ---------- */
const TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'SUB', 'SUP', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'H1', 'H2', 'H3', 'H4', 'DETAILS', 'SUMMARY', 'BLOCKQUOTE', 'FONT', 'HR',
  // KaTeX output
  'MATH', 'SEMANTICS', 'MROW', 'MI', 'MO', 'MN', 'MSUP', 'MSUB', 'MSUBSUP', 'MFRAC', 'MSQRT', 'MROOT', 'MTEXT', 'MSPACE', 'MOVER', 'MUNDER', 'MUNDEROVER', 'MTABLE', 'MTR', 'MTD', 'MSTYLE', 'MPADDED', 'MENCLOSE', 'ANNOTATION', 'SVG', 'PATH', 'LINE']);
const ATTRS = new Set(['class', 'style', 'data-tex', 'data-note', 'title', 'colspan', 'rowspan', 'aria-hidden', 'viewbox', 'width', 'height', 'd', 'preserveaspectratio', 'encoding', 'xmlns', 'mathvariant', 'stretchy', 'fence', 'separator', 'lspace', 'rspace', 'x1', 'x2', 'y1', 'y2', 'stroke-width']);
export function clean(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const walk = node => {
    for (const el of [...node.children]) {
      if (!TAGS.has(el.tagName.toUpperCase())) { el.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName.toUpperCase()) ? [] : el.childNodes)); continue; }
      for (const a of [...el.attributes]) {
        if (!ATTRS.has(a.name.toLowerCase()) || /url\s*\(|expression|javascript:/i.test(a.value)) el.removeAttribute(a.name);
      }
      el.removeAttribute('contenteditable');
      walk(el);
    }
  };
  walk(t.content);
  return t.innerHTML;
}
const SVG_OK = /^(g|path|rect|circle|ellipse|line|polyline|polygon)$/;
function cleanSvg(markup) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup || ''}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return '';
  const walk = n => { for (const c of [...n.children]) { if (!SVG_OK.test(c.localName)) { c.remove(); continue; } for (const a of [...c.attributes]) if (/^on|href/i.test(a.name) || /url\(|javascript:/i.test(a.value)) c.removeAttribute(a.name); walk(c); } };
  walk(doc.documentElement);
  return [...doc.documentElement.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
}
function diagramSvg(d) {
  const lines = (d.labels || []).map(l => (l.px != null ? `<line x1="${+l.x}" y1="${+l.y}" x2="${+l.px}" y2="${+l.py}" stroke="#475569" stroke-width="${d.width / 400}"/><circle cx="${+l.px}" cy="${+l.py}" r="${d.width / 180}" fill="#475569"/>` : '')).join('');
  const fs = Math.max(10, d.width * 0.027);
  const labels = (d.labels || []).map(l => `<text x="${+l.x}" y="${+l.y}" font-size="${fs}" font-weight="600" fill="#1f2937" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#fff" stroke-width="${fs / 3}">${esc(l.text)}</text>`).join('');
  return `<svg viewBox="0 0 ${+d.width} ${+d.height}" class="v-diagram" role="img" aria-label="${esc(d.title || 'Diagram')}"><rect width="${+d.width}" height="${+d.height}" fill="#fff"/>${cleanSvg(d.svg)}${lines}${labels}</svg>`;
}

/* ---------- drawing the notebook ---------- */
/** data: what shared_by_link returns; fetchFile(file) -> Promise<Blob URL> */
export function show(data, fetchFile) {
  const pages = new Map((data.pages || []).map(p => [p.page_id, p.data]));
  const sections = data.meta?.sections || [];
  document.title = `${data.name} · Study Hall`;
  const nav = $('#v-nav');
  nav.innerHTML = `<div class="v-nb"><i class="nbchip" style="background:${esc(/^#[0-9a-f]{3,8}$/i.test(data.color) ? data.color : '#5a45c2')}"></i><b>${esc(data.name)}</b></div>
    <p class="muted small">Shared by ${esc(data.owner || 'the owner')}</p>
    ${sections.map(s => `<div class="v-sec"><div class="v-sec-name">${esc(s.name)}</div>${s.pages.filter(p => pages.has(p.id)).map(p => `<a href="#" class="v-page" data-id="${esc(p.id)}">${esc(p.title || 'Untitled page')}</a>`).join('')}</div>`).join('')}`;
  const open = id => {
    const page = pages.get(id);
    if (!page) return;
    nav.querySelectorAll('.v-page').forEach(a => a.classList.toggle('on', a.dataset.id === id));
    const main = $('#v-main');
    main.innerHTML = `<article class="pg-paper v-paper">
      <h1 class="pg-title">${esc(page.title)}</h1>
      <div class="pg-date">${esc(new Date(page.created || Date.now()).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</div>
      ${(page.aiBy || []).length ? '<div class="pg-credit ai-credit">✨ Parts of these notes were written by AI and can be wrong.</div>' : ''}
      ${(page.topics || []).map(t => `<section class="pg-topic"><h2>${esc(t.heading)}</h2><div class="pg-text">${clean(t.html)}</div>
        <div class="v-pics">${(t.pics || []).map(p => (p.kind === 'diagram' ? `<figure>${diagramSvg(p.diagram)}<figcaption>${esc(p.name || '')}</figcaption></figure>` : `<figure><img alt="${esc(p.name || 'Picture')}" data-file="${esc(p.file)}" style="max-width:${Math.min(+p.w || 420, 720)}px"><figcaption>${esc(p.name || '')}</figcaption></figure>`)).join('')}</div></section>`).join('')}
      ${(page.topics || []).length ? '' : '<p class="muted">This page has no notes yet.</p>'}
    </article>`;
    main.querySelectorAll('img[data-file]').forEach(img => { fetchFile(img.dataset.file).then(u => { img.src = u; }).catch(() => { img.alt = 'Picture unavailable'; }); });
    main.scrollTop = 0;
    document.body.classList.remove('v-menu');
  };
  nav.onclick = e => { const a = e.target.closest('.v-page'); if (a) { e.preventDefault(); open(a.dataset.id); } };
  const first = sections.flatMap(s => s.pages).find(p => pages.has(p.id));
  if (first) open(first.id); else $('#v-main').innerHTML = '<div class="empty"><p>This notebook has no pages yet.</p></div>';
}

function fail(msg) { $('#v-main').innerHTML = `<div class="empty"><div class="big-ico">🔒</div><h2>Can't open these notes</h2><p class="muted">${esc(msg)}</p></div>`; }

async function start() {
  const token = location.hash.slice(1);
  if (!/^[\w-]{20,}$/.test(token)) return fail('This link is incomplete. Ask the person who shared it to copy it again.');
  if (!CLOUD.url || !CLOUD.key) return fail('Sharing isn\'t set up for this site yet.');
  await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'vendor/@supabase/supabase-js/dist/umd/supabase.js'; s.onload = resolve; s.onerror = reject; document.head.append(s); });
  const sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('shared_by_link', { token });
  if (error) return fail('The notes couldn\'t be loaded. Check your connection and try again.');
  if (!data) return fail('This link has been turned off, or the notebook is no longer shared.');
  const urls = new Map();
  show(data, file => {
    if (!urls.has(file)) urls.set(file, sb.storage.from(BUCKET).download(`${data.id}/${file}`).then(({ data: blob, error: e }) => { if (e) throw e; return URL.createObjectURL(blob); }));
    return urls.get(file);
  });
}
if (document.body.classList.contains('viewer') && !window.STUDYHALL_VIEWER_TEST) start().catch(() => fail('Something went wrong loading these notes.'));
