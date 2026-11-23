// Small DOM and dialog helpers shared by every view.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

// True when a keyboard shortcut should be ignored (typing, or a dialog is open).
export const ignoreKey = e =>
  e.ctrlKey || e.metaKey || e.altKey ||
  !!e.target.closest?.('input, textarea, select') || !!$('.modal-backdrop');

// Adds a document keydown listener and returns a function that removes it.
export function onKey(fn) {
  document.addEventListener('keydown', fn);
  return () => document.removeEventListener('keydown', fn);
}

export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

/**
 * Opens a dialog. actions: [{ label, kind, onClick(el) }] — return false from
 * onClick to keep the dialog open. Returns a close() function.
 */
export function modal({ title, body, actions = [], wide = false, onMount, onClose }) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<footer>${actions.map((a, i) =>
        `<button class="btn ${a.kind || ''}" data-action="${i}">${esc(a.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
  const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() {
    if (!el.isConnected) return;
    el.remove();
    document.removeEventListener('keydown', onEsc, true);
    onClose?.();
  }
  document.addEventListener('keydown', onEsc, true);
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  $('[data-close]', el).onclick = close;
  actions.forEach((a, i) => {
    $(`[data-action="${i}"]`, el).onclick = async () => {
      if ((await a.onClick?.(el)) !== false) close();
    };
  });
  $('#modal-root').append(el);
  onMount?.(el, close);
  ($('input:not([type=checkbox]):not([type=radio]), textarea, select', el) || $('.btn.primary, .btn.danger', el))?.focus();
  return close;
}

export function confirmDialog(title, message, okLabel = 'Delete', kind = 'danger') {
  return new Promise(resolve => {
    let ok = false;
    modal({
      title,
      body: `<p>${esc(message)}</p>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: okLabel, kind, onClick: () => { ok = true; } }],
      onClose: () => resolve(ok),
    });
  });
}

export function promptDialog(title, label, value = '', okLabel = 'Save') {
  return new Promise(resolve => {
    let result = null;
    const submit = el => {
      const v = $('input', el).value.trim();
      if (!v) { $('input', el).focus(); return false; }
      result = v;
    };
    modal({
      title,
      body: `<label class="select-wrap">${esc(label)}<input class="input" value="${esc(value)}" maxlength="80"></label>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: okLabel, kind: 'primary', onClick: submit }],
      onMount: (el, close) => {
        $('input', el).addEventListener('keydown', e => { if (e.key === 'Enter' && submit(el) !== false) close(); });
        $('input', el).select();
      },
      onClose: () => resolve(result),
    });
  });
}

// Loads an image from a URL (blob: or data:) and returns a resized data URL
// no larger than max px on its longest side — keeps the data file small.
export function resizeImage(src, max = 1000, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

// Reads an image file and returns a resized data URL.
export async function readImage(file, max = 1000) {
  const url = URL.createObjectURL(file);
  try { return await resizeImage(url, max, file.type); } finally { URL.revokeObjectURL(url); }
}

/** Small DOM builder: h('button', { class: 'btn', onclick: fn }, 'Label'). */
export function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && !k.startsWith('data-')) n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) n.append(c);
  return n;
}

/** Pop-up menu under an element. items: [{ label, icon?, onClick, kind?, on? } | 'sep' | { head }]. */
export function menu(anchor, items) {
  closeMenu();
  const el = h('div', { class: 'menu', role: 'menu' }, items.map(it =>
    it === 'sep' ? h('div', { class: 'menu-sep' })
      : it.head ? h('div', { class: 'menu-head', text: it.head })
        : h('button', { class: `menu-item ${it.kind || ''} ${it.on ? 'on' : ''}`, role: 'menuitem', onclick: () => { closeMenu(); it.onClick(); } },
          it.icon ? h('span', { class: 'menu-ico', html: it.icon }) : null, h('span', { text: it.label }))));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8))}px`;
  el.style.top = `${Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 8)}px`;
  const off = e => { if (!el.contains(e.target)) closeMenu(); };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
  menu.close = () => { el.remove(); document.removeEventListener('mousedown', off); menu.close = null; };
}
export function closeMenu() { menu.close?.(); }

/** Full-window "working…" overlay. Call with no message to remove it. */
export function busy(msg) {
  let b = $('#busy');
  if (!msg) return b?.remove();
  if (!b) { b = h('div', { id: 'busy' }, h('div', { class: 'spinner' }), h('p')); document.body.append(b); }
  $('p', b).textContent = msg;
}
