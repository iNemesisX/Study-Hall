// Create / edit a set. Edits happen on a draft copy and are saved with
// Create/Save; leaving with unsaved changes asks first. Includes the
// Quizlet-style import dialog and images on either side of a card.
import * as store from '../store.js';
import { $, $$, esc, uid, plural, modal, toast, readImage, resizeImage, promptDialog } from '../ui.js';
import { notFound } from './common.js';
import * as nbstore from '../notes/nbstore.js';

const blankCard = () => ({ id: uid(), term: '', def: '', starred: false });
const isEmpty = c => !c.term.trim() && !c.def.trim() && !c.termImg && !c.defImg;
const imgKey = side => (side === 'term' ? 'termImg' : 'defImg');

// opts: { notebookId } files a new set under a class notebook; { open: 'quizlet' } opens the Quizlet import straight away.
export function editorView(root, setId, folderId, opts = {}) {
  const existing = setId ? store.getSet(setId) : null;
  if (setId && !existing) return notFound(root);
  const draft = existing
    ? structuredClone(existing)
    : { id: uid(), title: '', description: '', folderId: store.getFolder(folderId) ? folderId : null, notebookId: nbstore.get(opts.notebookId) ? opts.notebookId : null, cards: [blankCard(), blankCard(), blankCard()] };
  let dirty = false;
  const verb = existing ? 'Save' : 'Create';

  const fileInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  let imageTarget = null;

  function sideHTML(c, side, label) {
    const img = c[imgKey(side)];
    return `<div class="edit-side">
        <textarea class="input" rows="1" data-field="${side}" placeholder="Enter ${label.toLowerCase()}" aria-label="${label}">${esc(c[side])}</textarea>
        <div class="edit-side-foot"><span class="label">${label.toUpperCase()}</span>
          ${img ? `<span class="img-slot"><img src="${esc(img)}" alt=""><button class="icon-btn" data-act="rm-img" data-side="${side}" title="Remove image">✕</button></span>`
                : `<button class="link-btn small" data-act="img" data-side="${side}" title="Add an image (or paste one into the box)">🖼 Image</button>`}
        </div></div>`;
  }
  const rowHTML = (c, i) => `<div class="edit-card" data-id="${c.id}">
      <div class="edit-card-head"><span class="num">${i + 1}</span>
        <div class="row">
          <button class="icon-btn" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="down" title="Move down" ${i === draft.cards.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="del" title="Delete card">🗑</button>
        </div></div>
      <div class="edit-card-body">${sideHTML(c, 'term', 'Term')}${sideHTML(c, 'def', 'Definition')}</div>
    </div>`;

  function folderOptions() {
    return `<option value="">No folder</option>${store.db().folders.map(f =>
      `<option value="${f.id}" ${f.id === draft.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
      <option value="__new">＋ New folder…</option>`;
  }

  function render() {
    root.innerHTML = `
      <div class="editor-head">
        <h1>${existing ? 'Edit set' : 'Create a new study set'}</h1>
        <div class="row gap">
          ${existing ? `<a class="btn ghost" href="#/set/${draft.id}">Cancel</a>` : ''}
          <button class="btn primary" data-act="save">${verb}</button>
        </div>
      </div>
      <div class="field"><input class="input big" id="title" maxlength="120" placeholder='Enter a title, like "Biology – Chapter 22: Evolution"' value="${esc(draft.title)}"></div>
      <div class="field-row">
        <textarea class="input" id="desc" rows="2" placeholder="Add a description…">${esc(draft.description)}</textarea>
        <div style="display:grid;gap:8px">
          <label class="select-wrap">Class notebook<select class="input" id="notebook"><option value="">None</option>${nbstore.list().map(n =>
            `<option value="${n.id}" ${n.id === draft.notebookId ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></label>
          <label class="select-wrap">Folder<select class="input" id="folder">${folderOptions()}</select></label>
        </div>
      </div>
      <div class="editor-tools">
        <div class="row gap"><button class="btn small" data-act="import">⤓ Import text</button>
          <button class="btn small" data-act="quizlet">⤓ Import from Quizlet</button>
          <button class="btn ghost small" data-act="swap">⇄ Swap terms and definitions</button></div>
        <span class="muted small" id="count">${plural(draft.cards.filter(c => !isEmpty(c)).length, 'card')}</span>
      </div>
      <div id="rows">${draft.cards.map(rowHTML).join('')}</div>
      <button class="add-card" data-act="add">＋ ADD A CARD</button>
      <div class="editor-foot"><button class="btn primary big" data-act="save">${verb}</button></div>`;
    $$('textarea[data-field]', root).forEach(autosize);
  }

  function renderRows(focusId, field = 'term') {
    $('#rows', root).innerHTML = draft.cards.map(rowHTML).join('');
    $$('textarea[data-field]', root).forEach(autosize);
    updateCount();
    if (focusId) $(`[data-id="${focusId}"] [data-field="${field}"]`, root)?.focus();
  }

  const autosize = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  const updateCount = () => { $('#count', root).textContent = plural(draft.cards.filter(c => !isEmpty(c)).length, 'card'); };
  const cardOf = el => draft.cards.find(c => c.id === el.closest('.edit-card')?.dataset.id);
  const touched = () => { dirty = true; };

  function addCard(after) {
    const c = blankCard();
    const i = after ? draft.cards.indexOf(after) + 1 : draft.cards.length;
    draft.cards.splice(i, 0, c);
    touched();
    renderRows(c.id);
    $(`[data-id="${c.id}"]`, root).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function setImage(card, side, file) {
    try {
      card[imgKey(side)] = await readImage(file);
      touched();
      renderRows();
    } catch (err) { toast(err.message); }
  }

  function save() {
    draft.title = $('#title', root).value.trim();
    const cards = draft.cards.filter(c => !isEmpty(c)).map(c => ({ ...c, term: c.term.trim(), def: c.def.trim() }));
    if (!draft.title) { toast('Add a title for your set'); $('#title', root).focus(); return; }
    if (!cards.length) { toast('Add at least one card'); return; }
    store.saveSet({ ...draft, description: draft.description.trim(), cards });
    dirty = false;
    toast(existing ? 'Set saved' : 'Set created');
    location.hash = `#/set/${draft.id}`;
  }

  // ---------- Events ----------
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'title') draft.title = t.value;
    else if (t.id === 'desc') draft.description = t.value;
    else if (t.dataset.field) { cardOf(t)[t.dataset.field] = t.value; autosize(t); updateCount(); }
    else return;
    touched();
  });

  root.addEventListener('change', async e => {
    if (e.target.id === 'notebook') { draft.notebookId = e.target.value || null; touched(); return; }
    if (e.target.id !== 'folder') return;
    if (e.target.value === '__new') {
      const name = await promptDialog('New folder', 'Folder name', '', 'Create');
      if (name) draft.folderId = store.createFolder(name).id;
      e.target.innerHTML = folderOptions();
    } else draft.folderId = e.target.value || null;
    touched();
  });

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const card = cardOf(t);
    const i = card ? draft.cards.indexOf(card) : -1;
    switch (t.dataset.act) {
      case 'save': return save();
      case 'add': return addCard();
      case 'import': return importDialog();
      case 'quizlet': return quizletDialog();
      case 'swap':
        draft.cards.forEach(c => { [c.term, c.def] = [c.def, c.term]; [c.termImg, c.defImg] = [c.defImg, c.termImg]; });
        touched();
        return renderRows();
      case 'del':
        draft.cards.splice(i, 1);
        if (!draft.cards.length) draft.cards.push(blankCard());
        touched();
        return renderRows();
      case 'up':
      case 'down': {
        const j = t.dataset.act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= draft.cards.length) return;
        [draft.cards[i], draft.cards[j]] = [draft.cards[j], draft.cards[i]];
        touched();
        return renderRows();
      }
      case 'img':
        imageTarget = { card, side: t.dataset.side };
        fileInput.value = '';
        return fileInput.click();
      case 'rm-img':
        delete card[imgKey(t.dataset.side)];
        touched();
        return renderRows();
    }
  });

  fileInput.onchange = () => {
    if (fileInput.files[0] && imageTarget) setImage(imageTarget.card, imageTarget.side, fileInput.files[0]);
  };

  // Paste an image straight into a term/definition box.
  root.addEventListener('paste', e => {
    const t = e.target;
    if (!t.dataset?.field) return;
    const file = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'))?.getAsFile();
    if (!file) return;
    e.preventDefault();
    setImage(cardOf(t), t.dataset.field, file);
  });

  // Tab from the last definition adds a new card, like Quizlet.
  root.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key === 'Tab' && !e.shiftKey && t.dataset?.field === 'def' && cardOf(t) === draft.cards.at(-1)) {
      e.preventDefault();
      addCard();
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });

  // ---------- Import ----------
  // ---------- Import from a Quizlet embed code or link (desktop app only) ----------
  function quizletDialog() {
    const api = window.studyhall;
    modal({
      title: 'Import from Quizlet',
      wide: true,
      body: `
        <p class="muted small" style="margin-top:0">On quizlet.com open the set, click <b>⋯ → Embed</b>, then <b>Copy HTML</b>, and paste it here.
          The set's link works too. Terms, definitions and images are copied into this set. Public sets only.</p>
        <textarea class="input" id="qz-code" rows="4" spellcheck="false" placeholder='<iframe src="https://quizlet.com/123456789/learn/embed?x=1jj1" …></iframe>'></textarea>
        <p class="small" id="qz-status" role="status" style="min-height:22px;margin:10px 0 0"></p>
        ${api?.importQuizlet ? '' : '<p class="small feedback bad">Importing from Quizlet only works in the desktop app, not in the browser preview.</p>'}`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Import', kind: 'primary', onClick: async el => {
          const status = $('#qz-status', el);
          const say = (msg, kind = '') => { status.className = `small feedback ${kind}`; status.textContent = msg; };
          const id = quizletSetId($('#qz-code', el).value);
          if (!id) { say("Paste a Quizlet embed code or set link (it should contain quizlet.com/<numbers>).", 'bad'); return false; }
          if (!api?.importQuizlet) { say('Open Study Hall as the desktop app to import from Quizlet.', 'bad'); return false; }
          const buttons = $$('footer .btn, #qz-code', el);
          buttons.forEach(b => { b.disabled = true; });
          say('Loading the set from Quizlet… If a Quizlet window opens, follow what it shows.');
          try {
            const data = await api.importQuizlet(id);
            say(`Saving ${plural(data.cards.length, 'card')}…`);
            const cards = [];
            for (const c of data.cards) {
              const card = { ...blankCard(), term: c.term, def: c.def };
              for (const k of ['termImg', 'defImg']) {
                if (c[k]) card[k] = await resizeImage(c[k], 1000, c[k].slice(5, c[k].indexOf(';'))).catch(() => undefined);
              }
              cards.push(card);
            }
            draft.cards = [...draft.cards.filter(c => !isEmpty(c)), ...cards];
            if (!draft.title.trim()) draft.title = data.title;
            if (!draft.description.trim()) draft.description = data.description;
            touched();
            render();
            toast(`Imported ${plural(cards.length, 'card')} from Quizlet` + (data.failedImages ? ` (${plural(data.failedImages, 'image')} couldn't be downloaded)` : ''));
          } catch (err) {
            buttons.forEach(b => { b.disabled = false; });
            say(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad');
            return false;
          }
        } },
      ],
    });
  }

  function importDialog() {
    modal({
      title: 'Import your data',
      wide: true,
      body: `
        <p class="muted small" style="margin-top:0">Paste from Quizlet, Word, Excel, Google Docs, etc. On Quizlet, use <b>⋯ → Export</b> if you see it (only on sets you created).
          Otherwise select the <b>Terms in this set</b> list (or the Print page), copy it, paste it here, and choose <b>Next line</b> below.</p>
        <textarea class="input" id="imp-text" rows="8" placeholder="Word 1&#9;Definition 1&#10;Word 2&#9;Definition 2&#10;Word 3&#9;Definition 3"></textarea>
        <div class="radio-row"><b>Between term and definition</b>
          <label><input type="radio" name="ts" value="\t" checked> Tab</label>
          <label title="Term on one line, definition on the next (text copied from a Quizlet page)"><input type="radio" name="ts" value="lines"> Next line</label>
          <label><input type="radio" name="ts" value=","> Comma</label>
          <label><input type="radio" name="ts" value=" - "> Dash</label>
          <label><input type="radio" name="ts" value="custom"> Custom <input class="input mini" id="ts-custom" placeholder=":" style="width:70px"></label>
        </div>
        <div class="radio-row"><b>Between cards</b>
          <label><input type="radio" name="cs" value="\n" checked> New line</label>
          <label><input type="radio" name="cs" value=";"> Semicolon</label>
          <label><input type="radio" name="cs" value="custom"> Custom <input class="input mini" id="cs-custom" placeholder="\\n\\n" style="width:70px"></label>
        </div>
        <div class="muted small" id="imp-count">Preview: 0 cards</div>
        <div class="preview-list" id="imp-preview" hidden></div>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Import', kind: 'primary', onClick: el => {
          const cards = parse(el);
          if (!cards.length) { toast('Nothing to import yet'); return false; }
          // Replace the starter blank rows, otherwise add to the end.
          draft.cards = [...draft.cards.filter(c => !isEmpty(c)), ...cards];
          touched();
          renderRows();
          toast(`Imported ${plural(cards.length, 'card')}`);
        } },
      ],
      onMount: el => {
        let autoPicked = false;
        const refresh = e => {
          // Text copied from a Quizlet page has no tabs: switch to "Next line" once, automatically.
          const raw = $('#imp-text', el).value;
          const tsTab = $('input[name="ts"]', el); // the Tab option
          if (e?.target.id === 'imp-text' && !autoPicked && raw.includes('\n') && !raw.includes('\t') && tsTab.checked) {
            $('input[name="ts"][value="lines"]', el).checked = true;
            autoPicked = true;
          }
          const lines = $('input[name="ts"]:checked', el).value === 'lines';
          $$('input[name="cs"], #cs-custom', el).forEach(i => { i.disabled = lines; });
          const cards = parse(el);
          $('#imp-count', el).textContent = `Preview: ${plural(cards.length, 'card')}`;
          const prev = $('#imp-preview', el);
          prev.hidden = !cards.length;
          prev.innerHTML = cards.slice(0, 50).map(c => `<div><b>${esc(c.term)}</b><span>${esc(c.def)}</span></div>`).join('');
        };
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      },
    });
  }

  function parse(el) {
    const unescape = s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const pickSep = (name, customId) => {
      const v = $(`input[name="${name}"]:checked`, el).value;
      return v === 'custom' ? unescape($(`#${customId}`, el).value) : v;
    };
    const termSep = pickSep('ts', 'ts-custom');
    const cardSep = pickSep('cs', 'cs-custom');
    const raw = $('#imp-text', el).value.replace(/\r\n/g, '\n');
    if (!raw.trim()) return [];
    if (termSep === 'lines') {
      // Lines alternate term, definition, term, definition… (blank lines ignored).
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      const cards = [];
      for (let i = 0; i < lines.length; i += 2) cards.push({ ...blankCard(), term: lines[i], def: lines[i + 1] || '' });
      return cards;
    }
    if (!termSep || !cardSep) return [];
    return raw.split(cardSep).map(chunk => {
      const at = chunk.indexOf(termSep);
      const term = (at < 0 ? chunk : chunk.slice(0, at)).trim();
      const def = (at < 0 ? '' : chunk.slice(at + termSep.length)).trim();
      return { ...blankCard(), term, def };
    }).filter(c => c.term || c.def);
  }

  render();
  if (!existing) $('#title', root).focus();
  if (opts.open === 'quizlet') setTimeout(quizletDialog, 0);
  return { guard: () => !dirty || confirm('You have unsaved changes. Leave without saving?') };
}

/** Finds the set ID in a Quizlet embed code, embed link or set link. */
export function quizletSetId(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?quizlet\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(\d{3,15})(?=[\/?#"'\s]|$)/i);
  return m ? m[1] : null;
}
