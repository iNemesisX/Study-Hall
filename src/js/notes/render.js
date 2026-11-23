// Turns the model's structured notes into HTML, and notes HTML back into plain text.
// Math is rendered with KaTeX when it is loaded (window.katex); otherwise shown as typed.
import { esc } from '../ui.js';

function tex(src, display) {
  try {
    if (window.katex) return katex.renderToString(src, { throwOnError: false, displayMode: display });
  } catch { /* fall through */ }
  return esc(src);
}

const mathSpan = (src, display) =>
  `<span class="math${display ? ' math-block' : ''}" contenteditable="false" data-tex="${esc(src)}">${tex(src, display)}</span>`;

// **bold**, *italic*, `code`, $math$
export function inline(text) {
  const maths = [];
  let s = String(text ?? '').replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, m) => {
    maths.push(m);
    return `\u0001${maths.length - 1}\u0001`;
  });
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => mathSpan(maths[i], false));
}

function blockHtml(b) {
  const items = Array.isArray(b.items) ? b.items : [];
  const list = (tag) => (items.length ? `<${tag}>${items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>` : '');
  switch (b.type) {
    case 'subheading': return `<h3>${inline(b.text)}</h3>`;
    case 'bullets': return list('ul');
    case 'numbered': return list('ol');
    case 'definition': return `<p class="def"><strong>${inline(b.term)}</strong> — ${inline(b.text)}</p>`;
    case 'formula':
      return `<p class="formula">${b.term ? `<span class="formula-label">${inline(b.term)}</span>` : ''}${mathSpan(String(b.text ?? '').replace(/^\$+|\$+$/g, ''), true)}</p>`;
    case 'example': return `<div class="example"><p><strong>Example.</strong> ${inline(b.text)}</p>${list('ol')}</div>`;
    case 'callout': return `<p class="callout">${inline(b.text)}</p>`;
    case 'question':
      return `<details class="qa" contenteditable="false"><summary>${inline(b.text)}</summary><div class="qa-a">${inline(b.answer || '')}</div></details>`;
    case 'table': {
      const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => Array.isArray(r) && r.length);
      if (!rows.length) return '';
      const [head, ...rest] = rows;
      return `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    default: return b.text ? `<p>${inline(b.text)}</p>` : list('ul');
  }
}

export function sectionHtml(sec, withSummary = true) {
  const lead = withSummary && sec.summary ? `<p class="lead">${inline(sec.summary)}</p>` : '';
  return lead + (sec.blocks || []).map(blockHtml).join('');
}

// Plain text of a notes section, with math restored to $...$, for sending to the model.
export function htmlToText(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('.math').forEach((m) => m.replaceWith(`$${m.dataset.tex}$`));
  const out = [];
  const walk = (node) => {
    for (const c of node.children) {
      const tag = c.tagName;
      if (tag === 'UL' || tag === 'OL') [...c.children].forEach((li, i) => out.push(`${tag === 'OL' ? `${i + 1}.` : '-'} ${li.textContent.trim()}`));
      else if (tag === 'TABLE') c.querySelectorAll('tr').forEach((tr) => out.push([...tr.children].map((x) => x.textContent.trim()).join(' | ')));
      else if (tag === 'DETAILS') out.push(`Q: ${c.querySelector('summary')?.textContent.trim() || ''}\nA: ${c.querySelector('.qa-a')?.textContent.trim() || ''}`);
      else if (tag === 'DIV' && c.children.length) walk(c);
      else if (c.textContent.trim()) out.push((tag === 'H3' ? '### ' : '') + c.textContent.trim());
    }
  };
  walk(t.content);
  const loose = [...t.content.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim());
  return [...loose, ...out].join('\n');
}
