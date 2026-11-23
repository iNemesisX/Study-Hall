// Pen settings (remembered between sessions) and the pen toolbar used on the
// Draw tab and in the photo viewer.
import { $, h } from '../ui.js';
import { TOOLS, INK_COLORS, HL_COLORS } from './ink.js';

// Toolbar button that keeps the text selection where it is.
export const tb = (label, title, fn, cls = '', attrs = {}) =>
  h('button', { class: `rb ${cls}`, title, html: label, onmousedown: e => e.preventDefault(), onclick: fn, ...attrs });

const KEY = 'studyhall-ink';
export const prefs = (() => {
  const base = { tool: 'pen', straight: false, autoPen: true, tools: {} };
  for (const [id, t] of Object.entries(TOOLS)) base.tools[id] = { color: t.color, size: t.size };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (TOOLS[saved.tool]) base.tool = saved.tool;
    base.straight = saved.straight === true;
    base.autoPen = saved.autoPen !== false;
    for (const id of Object.keys(TOOLS)) {
      const s = saved.tools?.[id];
      if (s && /^#[0-9a-f]{6}$/i.test(s.color)) base.tools[id].color = s.color;
      if (s && s.size >= TOOLS[id].min && s.size <= TOOLS[id].max) base.tools[id].size = +s.size;
    }
  } catch { /* keep defaults */ }
  return base;
})();
export const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

// What the ink layer should draw with for a given mode ('text' means ink is off).
export const toolSpec = getMode => () => {
  const m = getMode();
  if (m === 'text') return null;
  if (m === 'eraser') return { tool: 'eraser' };
  return { tool: m, ...prefs.tools[m], straight: prefs.straight };
};

/** Pen-type buttons, colours, thickness, eraser, undo/redo. */
export function inkBar({ getMode, setMode, history, disabled = false }) {
  const bar = h('div', { class: 'inkbar' });
  const draw = () => {
    const mode = getMode();
    const active = TOOLS[mode] ? mode : null;
    const cfg = active && prefs.tools[active];
    const pick = c => { cfg.color = c; savePrefs(); draw(); };
    const off = disabled ? { disabled: true } : {};
    bar.replaceChildren(...[
      h('span', { class: 'rb-group', 'data-tour': 'pens' }, Object.entries(TOOLS).map(([id, t]) =>
        tb(`<span class="rb-ico">${t.icon}</span>${t.label}`, t.label, () => { prefs.tool = id; savePrefs(); setMode(id); }, mode === id ? 'on' : '', { ...off, 'data-pen': id }))),
      tb('<span class="rb-ico">⌫</span>Eraser', 'Erase whole strokes (or flip your stylus over)', () => setMode('eraser'), mode === 'eraser' ? 'on' : '', off),
      active ? h('span', { class: 'rb-sep' }) : null,
      active ? (active === 'hl' ? HL_COLORS : INK_COLORS).map(c => {
        const b = tb('', 'Colour', () => pick(c), `swatch round ${cfg.color.toLowerCase() === c ? 'on' : ''}`);
        b.style.background = c;
        return b;
      }) : null,
      active ? h('input', { type: 'color', class: 'rb-color', title: 'Custom colour', value: cfg.color, oninput: e => { cfg.color = e.target.value; savePrefs(); } }) : null,
      active ? h('label', { class: 'rb-size', title: 'Thickness' },
        h('span', { class: 'rb-dot', style: `width:${Math.min(22, cfg.size)}px;height:${Math.min(22, cfg.size)}px;background:${cfg.color}` }),
        h('input', {
          type: 'range', min: TOOLS[active].min, max: TOOLS[active].max, step: 0.2, value: cfg.size,
          oninput: e => { cfg.size = +e.target.value; savePrefs(); const d = $('.rb-dot', bar); d.style.width = d.style.height = `${Math.min(22, cfg.size)}px`; },
        })) : null,
      active === 'hl' ? tb('― Straight', 'Draw straight highlighter lines', () => { prefs.straight = !prefs.straight; savePrefs(); draw(); }, prefs.straight ? 'on' : '') : null,
      h('span', { class: 'rb-sep' }),
      tb('↶ Undo', 'Undo ink (Ctrl+Z)', () => history?.undo(), '', off),
      tb('↷ Redo', 'Redo ink (Ctrl+Y)', () => history?.redo(), '', off),
    ].flat(3).filter(Boolean));
  };
  bar.redraw = draw;
  draw();
  return bar;
}
