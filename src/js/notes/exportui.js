// The Export dialog: pick this page or the whole notebook, then where it's going.
import { $, h, esc, modal, toast, busy } from '../ui.js';
import { isDesktop } from '../platform.js';
import * as X from './exporters.js';
import * as store from '../store.js';

const files = window.studyhall?.files;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const TARGETS = [
  { id: 'word', icon: '📘', name: 'Word', note: '.docx', kind: 'docx' },
  { id: 'gdocs', icon: '📄', name: 'Google Docs', note: 'via Google Drive', kind: 'docx',
    after: ['Open Google Drive and drag the file in (or New › File upload).', 'Right-click it and choose Open with › Google Docs.'], url: 'https://drive.google.com/drive/my-drive', urlLabel: 'Open Google Drive' },
  { id: 'pptx', icon: '📙', name: 'PowerPoint', note: '.pptx, a slide per heading', kind: 'pptx' },
  { id: 'gslides', icon: '📊', name: 'Google Slides', note: 'via Google Drive', kind: 'pptx',
    after: ['Open Google Drive and drag the file in (or New › File upload).', 'Right-click it and choose Open with › Google Slides.'], url: 'https://drive.google.com/drive/my-drive', urlLabel: 'Open Google Drive' },
  { id: 'notion', icon: '⬛', name: 'Notion', note: 'imports with pictures', kind: 'docx',
    after: ['In Notion, click Import in the sidebar (or Settings › Import).', 'Choose Word and pick the file you just saved. Notion keeps the headings, lists and pictures.'], url: 'https://www.notion.so/', urlLabel: 'Open Notion' },
  { id: 'evernote', icon: '🐘', name: 'Evernote', note: '.enex, a note per page', kind: 'enex',
    after: ['In the Evernote desktop app, choose File › Import › Evernote export file (ENEX).', 'Pick the file you just saved. Each page becomes a note, tagged with the notebook name.'], url: 'https://evernote.com/download', urlLabel: 'Get the Evernote app' },
  { id: 'obsidian', icon: '🟣', name: 'Obsidian', note: isDesktop ? 'straight into your vault' : '.zip of Markdown', kind: 'md' },
];

/** nb: notebook; pageId: the open page (or null for the whole notebook). */
export function exportDialog(nb, pageId, { exportPdf } = {}) {
  let scope = pageId ? 'page' : 'notebook';
  modal({
    title: 'Export to another app',
    wide: true,
    body: `
      ${pageId ? `<div class="seg" role="radiogroup" data-scope>
        <button class="seg-btn on" data-v="page" role="radio">This page</button>
        <button class="seg-btn" data-v="notebook" role="radio">Whole notebook: ${esc(nb.name)}</button></div>` : `<p>Exporting the whole notebook <b>${esc(nb.name)}</b>.</p>`}
      <div class="export-grid">${TARGETS.map(t => `<button class="export-card" data-t="${t.id}"><span class="export-ico">${t.icon}</span><b>${esc(t.name)}</b><span class="muted small">${esc(t.note)}</span></button>`).join('')}
        ${exportPdf ? '<button class="export-card" data-t="pdf"><span class="export-ico">📕</span><b>PDF</b><span class="muted small">this page, with your ink</span></button>' : ''}</div>
      <p class="muted small">Text, headings, lists, tables, highlights, formulas, Q&amp;A, pictures and diagrams are included. Pen and highlighter ink is kept only in the PDF.</p>`,
    actions: [{ label: 'Close', kind: 'ghost' }],
    onMount: (el, close) => {
      el.querySelectorAll('[data-scope] .seg-btn').forEach(b => { b.onclick = () => { scope = b.dataset.v; el.querySelectorAll('[data-scope] .seg-btn').forEach(x => x.classList.toggle('on', x === b)); }; });
      el.querySelectorAll('[data-t]').forEach(b => {
        b.onclick = async () => {
          close();
          if (b.dataset.t === 'pdf') return exportPdf();
          await run(TARGETS.find(t => t.id === b.dataset.t), nb, scope === 'page' ? pageId : null);
        };
      });
    },
  });
}

const stamp = () => new Date().toLocaleDateString('en-CA');
const fileBase = (nb, pages, single) => `${(single ? pages[0].title : nb.name).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}`;

export async function run(target, nb, pageId) {
  const single = !!pageId;
  try {
    busy('Preparing your notes…');
    const pages = await X.prepare(nb, pageId, busy);
    if (!pages.length || !pages.some(p => p.topics.length)) { busy(null); return toast('There are no notes to export yet'); }
    const base = fileBase(nb, pages, single);
    let saved;
    if (target.kind === 'docx') { busy('Building the Word file…'); saved = await X.saveBytes(`${base}.docx`, DOCX, await X.buildDocx(nb, pages, { single })); }
    else if (target.kind === 'pptx') { busy('Building the slides…'); saved = await X.saveBytes(`${base}.pptx`, PPTX, await X.buildPptx(nb, pages, { single })); }
    else if (target.kind === 'enex') { busy('Building the Evernote file…'); saved = await X.saveBytes(`${base}.enex`, 'application/enex+xml', await X.buildEnex(nb, pages)); }
    else if (target.kind === 'md') { busy(null); return obsidian(nb, pages, single, base); }
    busy(null);
    if (!saved) return;
    if (target.after) return doneDialog(target, saved);
    toast(typeof saved === 'string' ? `Saved: ${saved}` : 'Exported');
    if (typeof saved === 'string') files.show(saved);
  } catch (e) {
    busy(null);
    toast(`Export failed: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
  }
}

function doneDialog(target, saved) {
  modal({
    title: `Almost there: ${target.name}`,
    body: `<p>${typeof saved === 'string' ? `Saved to <code class="small">${esc(saved)}</code>.` : 'The file is saved.'} Now:</p><ol>${target.after.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`,
    actions: [
      ...(typeof saved === 'string' ? [{ label: 'Show file', kind: 'ghost', onClick: () => { files.show(saved); return false; } }] : []),
      { label: target.urlLabel, kind: 'primary', onClick: () => { X.openUrl(target.url); } },
    ],
  });
}

// Obsidian: on desktop, write Markdown and pictures into a vault folder; elsewhere, a .zip to unzip into the vault.
async function obsidian(nb, pages, single, base) {
  const list = X.buildMarkdown(nb, pages, { single });
  if (isDesktop && files) {
    const saved = store.db().settings.obsidianVault;
    let vault = saved && (await files.remember(saved)) ? saved : null;
    if (vault) {
      const reuse = await askReuse(vault);
      if (reuse === null) return;
      if (!reuse) vault = null;
    }
    vault ||= await files.pickFolder({ title: 'Choose your Obsidian vault folder' });
    if (!vault) return;
    store.setObsidianVault(vault);
    busy('Writing into your vault…');
    await files.write(vault, list.map(f => ({ ...f, path: `Study Hall/${f.path}` })));
    busy(null);
    const first = list.find(f => f.path.endsWith('.md'));
    const vaultName = vault.split(/[\\/]/).pop();
    modal({
      title: 'Exported to Obsidian',
      body: `<p>${list.filter(f => f.path.endsWith('.md')).length} note(s) were written to the <b>Study Hall</b> folder of your vault <b>${esc(vaultName)}</b>, with pictures in <code>attachments</code>.</p><p class="muted small">Exporting again replaces those notes, so edit copies in Obsidian if you want to keep changes.</p>`,
      actions: [{ label: 'Show folder', kind: 'ghost', onClick: () => { files.show(`${vault}/Study Hall`); return false; } },
        { label: 'Open in Obsidian', kind: 'primary', onClick: () => { X.openUrl(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(`Study Hall/${first.path.replace(/\.md$/, '')}`)}`).catch(() => toast('Obsidian isn\'t installed')); } }],
    });
    return;
  }
  busy('Packing the Markdown files…');
  const bytes = await X.zip(list);
  busy(null);
  const ok = await X.saveBytes(`${base} (Obsidian).zip`, 'application/zip', bytes);
  if (ok) modal({
    title: 'Almost there: Obsidian',
    body: '<ol><li>Save the .zip into your vault\'s folder (on iPad: Files › iCloud Drive › Obsidian › your vault).</li><li>Tap the .zip to unzip it. The notes appear in Obsidian, with pictures in <code>attachments</code>.</li></ol>',
    actions: [{ label: 'OK', kind: 'primary' }],
  });
}
function askReuse(vault) {
  return new Promise(resolve => {
    modal({
      title: 'Export to Obsidian',
      body: `<p>Export into the same vault as last time?</p><p><code class="small">${esc(vault)}</code></p>`,
      actions: [{ label: 'Choose another vault…', kind: 'ghost', onClick: () => resolve(false) }, { label: 'Use this vault', kind: 'primary', onClick: () => resolve(true) }],
      onClose: () => resolve(null),
    });
  });
}
