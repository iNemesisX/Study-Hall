// The "made by AI" notice shown on everything the AI writes: notes, study guides,
// generated flashcards and redrawn diagrams. Each of those records which provider
// and model produced it, as a list of { provider, model } (a page can be extended
// later with a different model).
import { esc } from '../ui.js';

const NAMES = { gemini: 'Google Gemini', claude: 'Anthropic Claude', ollama: 'Ollama' };
export const WARNING = 'AI-generated content can be wrong. Check it against your class materials.';

const one = (b) => (NAMES[b?.provider] ? `${NAMES[b.provider]}${b.model ? ` (${b.model})` : ''}` : 'an AI model');

/** "Google Gemini (gemini-3.5-flash)", or "X and Y" when more than one model contributed. */
export function byText(list) {
  const names = [...new Set((list || []).map(one))];
  return names.length ? names.join(' and ') : 'an AI model';
}

/** Adds the model that just generated something to a record's list. */
export function addBy(list, by) {
  const out = Array.isArray(list) ? list.filter((b) => b && b.provider !== 'unknown') : [];
  if (by && !out.some((b) => b.provider === by.provider && b.model === by.model)) out.push({ provider: String(by.provider), model: String(by.model || '').slice(0, 100) });
  return out.slice(-4);
}

/** Notice as HTML. what: e.g. "Notes on this page were written". */
export function creditHtml(list, what, cls = '') {
  if (list?.some((b) => b.provider === 'sample')) {
    return `<div class="ai-credit ${cls}" contenteditable="false"><span class="ai-credit-ico">✨</span><span><b>Sample content.</b> Notes you generate show here which AI model wrote them, because ${WARNING.charAt(0).toLowerCase()}${WARNING.slice(1)}</span></div>`;
  }
  return `<div class="ai-credit ${cls}" contenteditable="false" title="${esc(WARNING)}"><span class="ai-credit-ico">✨</span><span><b>${esc(what)} with ${esc(byText(list))}.</b> ${esc(WARNING)}</span></div>`;
}
