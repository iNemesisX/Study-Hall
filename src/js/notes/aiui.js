// AI setup dialog and the shared "something went wrong" handling for AI actions.
import * as nbstore from './nbstore.js';
import { $, $$, esc, modal, toast, busy, confirmDialog } from '../ui.js';

const api = nbstore.api;
export const PROVIDERS = {
  gemini: { name: 'Google Gemini', tag: 'Free', short: 'Gemini (free)' },
  ollama: { name: 'On this computer (Ollama)', tag: 'Free · offline', short: 'Local (Ollama)' },
  claude: { name: 'Anthropic Claude', tag: 'Paid · best quality', short: 'Claude' },
};
const listeners = new Set();
export const onAiChange = fn => listeners.add(fn);
export const getSettings = () => (api ? api.getSettings() : Promise.resolve({ ready: false, provider: 'gemini' }));

export const getUsage = () => (api ? api.usage().catch(() => null) : Promise.resolve(null));

/** Before an action that needs several AI requests: warn when today's allowance may not cover it. */
export async function checkBudget(needed) {
  const u = await getUsage();
  if (!u || !u.limit || u.left >= needed) return true;
  const name = PROVIDERS[u.provider]?.name || 'AI';
  if (u.left <= 0) {
    return confirmDialog('Today\'s AI limit looks used up', `You've used ${u.count} of ${u.source === 'estimate' ? 'about ' : ''}${u.limit} ${name} requests today, so this will probably fail. The limit resets in about ${Math.ceil(u.hoursToReset)} hours. Try anyway?`, 'Try anyway', 'primary');
  }
  return confirmDialog('This may use up today\'s AI limit', `This needs about ${needed} AI requests and you have ${u.source === 'estimate' ? 'about ' : ''}${u.left} left today with ${name}. It may stop part-way. Continue?`, 'Continue', 'primary');
}

export const errText = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** Shows an AI error. A missing key opens AI setup instead. */
export function fail(e) {
  busy(null);
  const msg = errText(e);
  if (msg.includes('NO_KEY')) return aiSettingsDialog('Set up the AI first. The Gemini option is free.');
  modal({ title: 'That didn\'t work', body: `<p>${esc(msg)}</p>`, actions: [{ label: 'AI setup', kind: 'ghost', onClick: () => { aiSettingsDialog(); } }, { label: 'OK', kind: 'primary' }] });
}

/** Resolves true when an AI provider is ready; otherwise opens AI setup and resolves false. */
export async function ensureAi() {
  if ((await getSettings()).ready) return true;
  aiSettingsDialog('Set up the AI first. The Gemini option is free.');
  return false;
}

export async function aiSettingsDialog(note) {
  if (!api) return toast('AI needs the desktop app');
  const s = await api.getSettings();
  let provider = s.provider;
  const form = p => {
    const el = $(`[data-p="${p}"]`);
    const lim = $('[data-f="limit"]', el);
    return { key: $('[data-f="key"]', el)?.value.trim() || '', model: $('[data-f="model"]', el).value.trim(), url: $('[data-f="url"]', el)?.value.trim() || '', ...(lim ? { dailyLimit: +lim.value || 0 } : {}) };
  };
  const keyField = (p, placeholder) => `<label class="select-wrap">API key<input class="input" type="password" data-f="key" autocomplete="off"
    placeholder="${s[p].hasKey ? 'A key is saved. Type a new one to replace it.' : placeholder}"></label>`;
  const modelField = p => `<label class="select-wrap">Model
    <span class="row gap"><input class="input" data-f="model" value="${esc(s[p].model)}" spellcheck="false" list="models-${p}">
    <button class="btn small" data-list="${p}" type="button">Find models</button></span><datalist id="models-${p}"></datalist></label>`;
  modal({
    title: 'AI setup', wide: true,
    body: `
      ${note ? `<p class="callout-note">${esc(note)}</p>` : ''}
      <p class="muted small">The AI reads your photos and writes the notes, flashcards and study guides. Everything it writes is marked with the model that wrote it. AI-generated content can be wrong, so check it against your class materials. Pick one option. You can switch any time. <a href="#" data-faq-link>Step-by-step help in the FAQ</a></p>
      <div class="ai-choices">
        ${Object.entries(PROVIDERS).map(([id, p]) => `<button class="ai-choice ${id === provider ? 'on' : ''}" data-pick="${id}" type="button">
          <b>${esc(p.name)}</b><span class="pill">${esc(p.tag)}</span></button>`).join('')}
      </div>
      <div class="ai-panel" data-p="gemini">
        <ol class="steps"><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with a Google account.</li>
          <li>Click <b>Create API key</b> and copy it.</li><li>Paste it below and press <b>Save</b>.</li></ol>
        ${keyField('gemini', 'Paste your Gemini key')}${modelField('gemini')}
        <label class="select-wrap">Daily request limit for the usage alert (leave empty to detect it automatically)
          <input class="input" type="number" min="0" data-f="limit" value="${s.gemini.dailyLimit || ''}" placeholder="Automatic. Your real limits are listed at aistudio.google.com/rate-limit"></label>
        <p class="muted small">Free, with daily limits that reset at midnight Pacific time. On the free tier, Google may use what you send to improve its products, so don't photograph anything private.</p>
      </div>
      <div class="ai-panel" data-p="ollama">
        <ol class="steps"><li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a>.</li>
          <li>Open a terminal and run <code>ollama pull ${esc(s.ollama.model)}</code> (a download of several GB).</li><li>Press <b>Test connection</b> below.</li></ol>
        <label class="select-wrap">Ollama address<input class="input" data-f="url" value="${esc(s.ollama.url)}" spellcheck="false"></label>${modelField('ollama')}
        <p class="muted small">Free and private: nothing leaves this computer. Needs a strong PC (a graphics card with about 8 GB of memory or more). Slower, and less accurate on handwriting, than the online options.</p>
      </div>
      <div class="ai-panel" data-p="claude">
        <ol class="steps"><li>Create a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> (needs a payment method).</li><li>Paste it below and press <b>Save</b>.</li></ol>
        ${keyField('claude', 'sk-ant-…')}${modelField('claude')}
        <label class="select-wrap">Daily request budget for the usage alert (optional)
          <input class="input" type="number" min="0" data-f="limit" value="${s.claude.dailyLimit || ''}" placeholder="e.g. 50. Leave empty for no alert"></label>
        <p class="muted small">The most accurate notes, especially from handwriting and dense slides. Billed to your Anthropic account for each use.</p>
      </div>
      <label class="select-wrap" style="margin-top:12px">How detailed should notes be?<select class="input" data-f="detail">
        ${[['concise', 'Concise: key ideas only'], ['detailed', 'Detailed: learn it from the notes'], ['exhaustive', 'Exhaustive: everything on the page']]
          .map(([v, t]) => `<option value="${v}" ${s.detail === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="opt-row" style="margin-top:10px"><span>Draw clean versions of diagrams<br><span class="muted small">When photos contain diagrams, the AI also redraws each one as an editable diagram. Uses one extra AI request per diagram.</span></span>
        <input type="checkbox" class="switch" data-f="autodraw" ${s.autoDraw ? 'checked' : ''}></label>
      <p class="ai-status" data-status></p>`,
    onMount: (el, close) => {
      const show = () => {
        $$('[data-pick]', el).forEach(b => b.classList.toggle('on', b.dataset.pick === provider));
        $$('[data-p]', el).forEach(p => { p.hidden = p.dataset.p !== provider; });
      };
      $$('[data-pick]', el).forEach(b => { b.onclick = () => { provider = b.dataset.pick; show(); }; });
      $('[data-faq-link]', el).onclick = async e => { e.preventDefault(); close(); (await import('../views/help.js')).faqDialog(provider); };
      const say = (msg, kind = '') => { const st = $('[data-status]', el); st.textContent = msg; st.className = `ai-status ${kind}`; };
      $$('[data-list]', el).forEach(b => {
        b.onclick = async () => {
          const p = b.dataset.list;
          say('Looking up models…');
          try {
            const names = await api.models({ provider: p, form: form(p) });
            $(`#models-${p}`, el).innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
            say(names.length ? `${names.length} models found. Click the Model box to choose one.` : 'No models found.', names.length ? 'ok' : 'bad');
          } catch (e) { say(errText(e).includes('NO_KEY') ? 'Enter a key first.' : errText(e), 'bad'); }
        };
      });
      show();
    },
    actions: [
      { label: 'Test connection', kind: 'ghost', onClick: async el => {
        const st = $('[data-status]', el);
        st.textContent = 'Testing…'; st.className = 'ai-status';
        try { await api.testAi({ provider, form: form(provider) }); st.textContent = '✓ Connected. Press Save to use it.'; st.className = 'ai-status ok'; }
        catch (e) { st.textContent = errText(e).includes('NO_KEY') ? 'Enter a key first.' : errText(e); st.className = 'ai-status bad'; }
        return false;
      } },
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save', kind: 'primary', onClick: async el => {
        const patch = { provider, detail: $('[data-f="detail"]', el).value, autoDraw: $('[data-f="autodraw"]', el).checked };
        for (const p of Object.keys(PROVIDERS)) patch[p] = form(p);
        await api.setSettings(patch);
        listeners.forEach(fn => fn());
        toast(`AI set to ${PROVIDERS[provider].short}`);
      } },
    ],
  });
}
