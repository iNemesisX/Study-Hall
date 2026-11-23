import * as store from '../store.js';
import { $, $$, esc, plural, modal, confirmDialog, promptDialog } from '../ui.js';
import { setCard, notFound } from './common.js';

export function folderView(root, id) {
  const folder = store.getFolder(id);
  if (!folder) return notFound(root, 'folder');

  function render() {
    const sets = store.setsInFolder(id);
    root.innerHTML = `
      <div class="editor-head">
        <div><h1>📁 ${esc(folder.name)}</h1><span class="muted">${plural(sets.length, 'set')}</span></div>
        <div class="row gap wrap">
          <button class="btn" data-act="rename">✎ Rename</button>
          <button class="btn danger-ghost" data-act="delete">🗑 Delete folder</button>
        </div>
      </div>
      <div class="row gap wrap" style="margin:8px 0 20px">
        <a class="btn primary" href="#/new/${id}">＋ Create set here</a>
        <button class="btn" data-act="add">Add existing sets</button>
      </div>
      ${sets.length
        ? `<div class="grid">${sets.map(setCard).join('')}</div>`
        : `<div class="empty"><div class="big-ico">📂</div><h2>This folder is empty</h2><p>Create a set here or add sets you already have.</p></div>`}`;
  }
  render();

  root.onclick = async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rename') {
      const name = await promptDialog('Rename folder', 'Folder name', folder.name);
      if (name) { store.renameFolder(id, name); render(); }
    } else if (act === 'delete') {
      if (await confirmDialog('Delete folder?', `"${folder.name}" will be deleted. The sets inside are kept and moved out of the folder.`)) {
        store.deleteFolder(id);
        location.hash = '#/library';
      }
    } else if (act === 'add') {
      const others = store.db().sets.filter(s => s.folderId !== id);
      if (!others.length) return modal({ title: 'Add sets', body: '<p class="muted">All your sets are already in this folder.</p>' });
      modal({
        title: `Add sets to ${folder.name}`,
        body: others.map(s => `<label class="opt-row"><span>${esc(s.title)}
          <span class="muted small">${s.folderId ? '· in ' + esc(store.getFolder(s.folderId)?.name || '') : ''}</span></span>
          <input type="checkbox" class="switch" value="${s.id}"></label>`).join(''),
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          { label: 'Add', kind: 'primary', onClick: el => {
            $$('input:checked', el).forEach(i => { store.getSet(i.value).folderId = id; });
            store.save();
            render();
          } },
        ],
      });
    }
  };
}
