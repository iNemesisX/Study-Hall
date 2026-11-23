// Freehand ink on an SVG overlay, built on Pointer Events so mouse, touch and
// stylus all work. With a stylus: pressure shapes fountain-pen strokes, the
// eraser end or barrel button erases, and once a pen has been seen, fingers
// scroll the page instead of drawing (palm rejection).
//
// A stroke is { tool, color, size, pts } where pts are [x, y] or [x, y, pressure]
// in the SVG's own coordinate space, so ink stays put whether the SVG is
// pixel-sized (notes) or scaled by a viewBox (photos).

const NS = 'http://www.w3.org/2000/svg';

export const TOOLS = {
  pen:      { label: 'Pen',         icon: '🖊', min: 1, max: 8,  size: 2.2, color: '#1d4ed8' },
  fountain: { label: 'Fountain',    icon: '✒', min: 2, max: 14, size: 5,   color: '#1b1f2a' },
  pencil:   { label: 'Pencil',      icon: '✏', min: 1, max: 6,  size: 1.8, color: '#4b5563' },
  marker:   { label: 'Marker',      icon: '🖍', min: 4, max: 26, size: 9,   color: '#d92d20' },
  hl:       { label: 'Highlighter', icon: '▍', min: 8, max: 40, size: 20,  color: '#ffe14d' },
};
export const INK_COLORS = ['#1b1f2a', '#4b5563', '#1d4ed8', '#0e7490', '#15803d', '#d92d20', '#c2410c', '#7e22ce'];
export const HL_COLORS = ['#ffe14d', '#9be88f', '#ff9ec7', '#8fd0ff', '#ffb561'];

const round = n => Math.round(n * 10) / 10;

function distToSegment(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

// Smooth centre line through the points.
function linePath(pts) {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]} l0.01 0`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    d += ` Q${pts[i][0]} ${pts[i][1]} ${round((pts[i][0] + pts[i + 1][0]) / 2)} ${round((pts[i][1] + pts[i + 1][1]) / 2)}`;
  }
  const l = pts[pts.length - 1];
  return `${d} L${l[0]} ${l[1]}`;
}

// Filled outline whose width follows pressure (fountain pen).
function pressurePath(pts, size) {
  const half = p => (size * (0.22 + 0.9 * (p ?? 0.5))) / 2;
  const dot = (x, y, r) => `M${round(x - r)} ${round(y)}a${round(r)} ${round(r)} 0 1 0 ${round(2 * r)} 0a${round(r)} ${round(r)} 0 1 0 ${round(-2 * r)} 0Z`;
  if (pts.length === 1) return dot(pts[0][0], pts[0][1], half(pts[0][2]));
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const w = half(pts[i][2]);
    left.push(`${round(pts[i][0] + nx * w)} ${round(pts[i][1] + ny * w)}`);
    right.push(`${round(pts[i][0] - nx * w)} ${round(pts[i][1] - ny * w)}`);
  }
  const first = pts[0], last = pts[pts.length - 1];
  return `M${left.join('L')}L${right.reverse().join('L')}Z${dot(first[0], first[1], half(first[2]))}${dot(last[0], last[1], half(last[2]))}`;
}

export class Ink {
  /**
   * getTool(): { tool, color, size, straight? } | { tool: 'eraser' } | null (ink off)
   * onCommit(op): op is { type: 'add', ink, stroke } or { type: 'erase', ink, removed: [{ stroke, index }] }
   * scroller: element to scroll when a finger drags while a stylus is in use
   */
  constructor(svg, strokes, { getTool, onCommit, scroller }) {
    Object.assign(this, { svg, strokes, getTool, onCommit, scroller });
    this.cur = null;
    this.down = this.down.bind(this);
    svg.addEventListener('pointerdown', this.down);
    svg.addEventListener('pointermove', e => this.move(e));
    svg.addEventListener('pointerup', e => this.up(e));
    svg.addEventListener('pointercancel', e => this.up(e));
    svg.addEventListener('contextmenu', e => { if (this.getTool()) e.preventDefault(); }); // barrel button
    this.redraw();
  }

  point(e) {
    const m = this.svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [round(p.x), round(p.y)];
  }
  unit() { // SVG units per screen pixel
    const m = this.svg.getScreenCTM();
    return m && m.a ? 1 / m.a : 1;
  }

  down(e) {
    const t = this.getTool();
    if (!t || this.cur) return;
    if (e.pointerType === 'pen') Ink.penSeen = true;
    if (e.pointerType === 'touch' && Ink.penSeen) { // palm / finger while a stylus is in use: scroll
      this.cur = { scroll: true, id: e.pointerId, y: e.clientY };
      this.capture(e);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.capture(e);
    Ink.last = this;
    const penErase = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) || (e.buttons & 2));
    if (t.tool === 'eraser' || penErase) {
      this.cur = { erase: true, id: e.pointerId, removed: [] };
      this.erase(e);
      return;
    }
    const u = this.unit();
    const p = this.point(e);
    const pressured = t.tool === 'fountain';
    this.cur = {
      id: e.pointerId, straight: t.tool === 'hl' && t.straight, pressured,
      p: this.pressure(e, 0), t: e.timeStamp, sx: e.clientX, sy: e.clientY,
      stroke: { tool: t.tool, color: t.color, size: round(t.size * u), pts: [pressured ? [p[0], p[1], 0.5] : p] },
    };
    if (pressured) this.cur.stroke.pts[0][2] = this.cur.p;
    this.cur.el = this.draw(this.cur.stroke);
  }

  capture(e) { try { this.svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } }

  // Real pressure from a stylus; for mouse and touch, faster movement gives a thinner line.
  pressure(e, speed) {
    if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
    return Math.max(0.15, Math.min(0.85, 0.75 - speed * 0.22));
  }

  move(e) {
    const c = this.cur;
    if (!c || e.pointerId !== c.id) return;
    if (c.scroll) {
      if (this.scroller) this.scroller.scrollTop -= e.clientY - c.y;
      c.y = e.clientY;
      return;
    }
    if (c.erase) return this.erase(e);
    const u = this.unit();
    const pts = c.stroke.pts;
    if (c.straight) {
      const p = this.point(e);
      if (Math.abs(p[1] - pts[0][1]) < 14 * u) p[1] = pts[0][1]; // snap to a level line
      pts[1] = p;
    } else {
      for (const ev of (e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e])) {
        const p = this.point(ev);
        const last = pts[pts.length - 1];
        const dist = Math.hypot(p[0] - last[0], p[1] - last[1]);
        if (dist < 1.1 * u) continue;
        if (c.pressured) {
          const dt = Math.max(1, ev.timeStamp - c.t);
          c.p = c.p * 0.6 + this.pressure(ev, dist / u / dt) * 0.4; // smoothed
          c.t = ev.timeStamp;
          p.push(Math.round(c.p * 100) / 100);
        }
        pts.push(p);
      }
    }
    c.el.setAttribute('d', c.pressured ? pressurePath(pts, c.stroke.size) : linePath(pts));
  }

  up(e) {
    const c = this.cur;
    if (!c || (e && e.pointerId !== c.id)) return;
    this.cur = null;
    if (c.scroll) return;
    if (c.erase) {
      if (c.removed.length) this.onCommit({ type: 'erase', ink: this, removed: c.removed });
      return;
    }
    this.strokes.push(c.stroke);
    this.onCommit({ type: 'add', ink: this, stroke: c.stroke });
  }

  erase(e) {
    const [x, y] = this.point(e);
    const r = 8 * this.unit();
    let hit = false;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      const reach = r + s.size / 2;
      const touched = s.pts.length === 1
        ? Math.hypot(s.pts[0][0] - x, s.pts[0][1] - y) <= reach
        : s.pts.some((p, k) => k && distToSegment(x, y, s.pts[k - 1], p) <= reach);
      if (touched) { this.cur.removed.push({ stroke: s, index: i }); this.strokes.splice(i, 1); hit = true; }
    }
    if (hit) this.redraw();
  }

  draw(s) {
    const p = document.createElementNS(NS, 'path');
    if (s.tool === 'fountain') {
      p.setAttribute('d', pressurePath(s.pts, s.size));
      p.setAttribute('fill', s.color);
    } else {
      p.setAttribute('d', linePath(s.pts));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', s.color);
      p.setAttribute('stroke-width', s.size);
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', s.tool === 'hl' ? 'butt' : 'round');
      if (s.tool === 'hl') { p.setAttribute('stroke-opacity', '0.5'); p.style.mixBlendMode = 'multiply'; }
      if (s.tool === 'pencil') p.setAttribute('stroke-opacity', '0.72');
    }
    this.svg.appendChild(p);
    return p;
  }

  redraw() {
    this.svg.replaceChildren();
    // Highlighter first so it sits under pen strokes, like on paper.
    this.strokes.filter(s => s.tool === 'hl').forEach(s => this.draw(s));
    this.strokes.filter(s => s.tool !== 'hl').forEach(s => this.draw(s));
  }
}
Ink.last = null;
Ink.penSeen = false;

/** Undo/redo across every ink surface on a page. */
export class InkHistory {
  constructor(onChange) { this.done = []; this.undone = []; this.onChange = onChange; }
  push(op) { this.done.push(op); this.undone = []; this.onChange(); }
  apply(op, reverse) {
    const s = op.ink.strokes;
    const drop = stroke => { const i = s.indexOf(stroke); if (i >= 0) s.splice(i, 1); };
    if (op.type === 'add') {
      if (reverse) drop(op.stroke); else s.push(op.stroke);
    } else if (reverse) {
      [...op.removed].reverse().forEach(r => s.splice(Math.min(r.index, s.length), 0, r.stroke));
    } else {
      op.removed.forEach(r => drop(r.stroke));
    }
    op.ink.redraw();
    this.onChange();
  }
  undo() { const op = this.done.pop(); if (!op) return false; this.undone.push(op); this.apply(op, true); return true; }
  redo() { const op = this.undone.pop(); if (!op) return false; this.done.push(op); this.apply(op, false); return true; }
}
