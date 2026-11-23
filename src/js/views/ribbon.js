// The ribbon: Home / Insert / Draw / Study / Help tabs across the top.
// Page tools act on the open page (set by page.js through setPage); Study and
// Help work anywhere.
import * as store from '../store.js';
import { exportDialog } from '../notes/exportui.js';
import { shareDialog } from '../cloud/ui.js';
import { checkForUpdates } from '../update.js';
import { $, h, toast, menu } from '../ui.js';
import { tb, inkBar, prefs, savePrefs } from '../notes/inkbar.js';
import { aiSettingsDialog } from '../notes/aiui.js';
import { context } from './nav.js';
import { studySetDialog, studyGuideDialog, openTest } from './study.js';
import { startTour, featureGuide, faqDialog, backupDialog } from './help.js';

const TABS = [['home', 'Home'], ['insert', 'Insert'], ['draw', 'Draw'], ['study', 'Study'], ['help', 'Help']];
const TEXT_HL = [['Yellow', '#fff29a'], ['Green', '#c9f2c7'], ['Pink', '#ffd0e4'], ['Blue', '#cfe6ff'], ['Orange', '#ffdcb0']];
import { platform, isDesktop, GENERIC_FONTS, installedFonts, fontStack } from '../platform.js';
// The page's default font is the system font; pages from older versions may name others.
const fontChoices = current => {
  const named = installedFonts();
  const list = [...GENERIC_FONTS.map(([label]) => label), ...named];
  if (current && !list.includes(current)) list.push(current);
  return list;
};
const SIZES = [11, 12, 13, 14, 15.5, 17, 19, 22, 26, 32];
const state = { tab: 'home', page: null, hash: '#/' };

// Flashcards: generate from notes, type by hand, or bring a set in from Quizlet.
function flashcardMenu(anchor, nb, scope) {
  const sets = store.setsForNotebook(nb.id);
  menu(anchor, [
    { head: 'New flashcard set' },
    { label: 'Generate from your notes', icon: '✨', onClick: () => studySetDialog(nb, scope) },
    { label: 'Type your own cards', icon: '✎', onClick: () => { location.hash = `#/new/nb/${nb.id}`; } },
    { label: 'Import from Quizlet (paste a link)', icon: '⤓', onClick: () => { location.hash = `#/new/nb/${nb.id}/quizlet`; } },
    ...(sets.length ? ['sep', { head: 'Sets for this class (study, edit, export to Quizlet)' }, ...sets.map(s => ({ label: `${s.title} (${s.cards.length})`, icon: '🗂', onClick: () => { location.hash = `#/set/${s.id}`; } }))] : []),
  ]);
}

export const getTab = () => state.tab;
export function setTab(tab) {
  if (state.tab === tab) return;
  if (state.tab === 'draw' && state.page?.getMode() !== 'text') { state.tab = tab; state.page.setMode('text'); return; } // setMode refreshes
  state.tab = tab;
  refresh();
}
export function setPage(ctrl) { state.page = ctrl; refresh(); }
export function setRoute(hash) { state.hash = hash; refresh(); }

const big = (icon, label, title, fn, opts = {}) =>
  tb(`<span class="rb-big-ico">${icon}</span><span>${label}</span>${opts.badge ? `<span class="rb-badge">${opts.badge}</span>` : ''}`, title, fn, `big ${opts.cls || ''}`, { ...(opts.disabled ? { disabled: true } : {}), ...(opts.tour ? { 'data-tour': opts.tour } : {}) });
const group = (label, tour, ...kids) => h('div', { class: 'rb-group-box', ...(tour ? { 'data-tour': tour } : {}) }, h('div', { class: 'rb-row' }, kids), h('div', { class: 'rb-caption', text: label }));

export function refresh() {
  const el = $('#ribbon');
  if (!el) return;
  const p = state.page;
  const nb = context(state.hash).nb;
  const none = !p; // no page open: page tools are greyed out
  const ro = !!p?.readonly; // a notebook shared with you as "Can view"
  const off = none || ro ? { disabled: true } : {};
  const offView = none ? { disabled: true } : {}; // reading tools still work when view only
  const needNb = fn => () => (nb ? fn(nb) : toast('Create or open a notebook first'));
  const withPage = fn => async () => { await p?.flush(); fn(); };
  const scope = p?.page ? `p:${p.page.id}` : 'all';
  let panel;

  if (state.tab === 'home') {
    panel = [
      group('Font', 'font',
        h('select', { class: 'rb-select font', title: 'Font: applies to the selected text, or to the whole page when nothing is selected', ...off, onchange: e => p.setFont(e.target.value) },
          fontChoices(p?.page?.font).map(f => h('option', { value: f, text: f, style: `font-family:${fontStack(f)}`, selected: (p?.page?.font || 'System') === f }))),
        h('select', { class: 'rb-select size', title: 'Text size: applies to the selected text, or to the whole page when nothing is selected', ...off, onchange: e => p.setSize(+e.target.value) },
          SIZES.map(s => h('option', { value: s, text: s === 15.5 ? '15.5 (normal)' : s, selected: (p?.page?.size || 15.5) === s })))),
      group('Text', 'format',
        tb('<b>B</b>', 'Bold (Ctrl+B)', () => p.exec('bold'), '', off),
        tb('<i>I</i>', 'Italic (Ctrl+I)', () => p.exec('italic'), '', off),
        tb('<u>U</u>', 'Underline (Ctrl+U)', () => p.exec('underline'), '', off),
        tb('<s>S</s>', 'Strikethrough', () => p.exec('strikeThrough'), '', off),
        h('span', { class: 'rb-sep' }),
        tb('• List', 'Bulleted list', () => p.exec('insertUnorderedList'), '', off),
        tb('1. List', 'Numbered list', () => p.exec('insertOrderedList'), '', off)),
      group('Highlight selected text', 'highlight',
        TEXT_HL.map(([name, c]) => { const b = tb('', `Highlight: ${name}`, () => p.exec('hiliteColor', c), 'swatch', off); b.style.background = c; return b; }),
        tb('⦸', 'Remove highlight', () => p.exec('hiliteColor', 'transparent'), '', off),
        tb('💬 Comment', 'Attach a comment to the selected text', () => p.addComment(), '', off)),
      group('Ask AI', 'ask',
        tb('✨ Ask AI', 'Ask about the highlighted text (Ctrl+J), or about the whole page when nothing is highlighted. Highlighting text also shows an Ask button beside it', () => p.askSelection(), 'accent-tb', offView),
        tb('⬚ Ask about an area', 'Drag a box around a diagram, drawing or part of the page and ask about it', () => p.askArea(), '', offView),
        tb(p?.isDictating() ? '■ Stop dictating' : '🎤 Dictate', 'Speak and your words are typed where the cursor is', () => p.dictate(), p?.isDictating() ? 'on' : '', { ...off, 'data-tour': 'dictate' })),
      group('Page', null,
        tb('＋ Heading', 'Add a new heading to this page', () => p.addTopic(), '', off),
        tb(p?.nb?.cloud ? '👥 Shared' : '🔗 Share', 'Share this notebook with classmates (they can view or edit), or make a view-only link', withPage(() => shareDialog(p.nb)), p?.nb?.cloud ? 'on' : '', { ...offView, 'data-tour': 'share' }),
        tb('⤴ Export', 'Export this page or notebook to Word, PowerPoint, Google Docs or Slides, Notion, Evernote or Obsidian', withPage(() => exportDialog(p.nb, p.page.id, { exportPdf: () => p.exportPdf() })), '', { ...offView, 'data-tour': 'export' }),
        tb(isDesktop ? '⤓ Save as PDF' : '⎙ Print / PDF', isDesktop ? 'Export this page, with highlights and ink, as a PDF' : 'Print this page, or save it as a PDF from the print screen', () => p.exportPdf(), '', offView)),
    ];
  } else if (state.tab === 'insert') {
    const fresh = p?.newPhotos() || 0;
    panel = [
      group('Sources to turn into notes', 'insert-photos',
        big('🖼', 'Photos', 'Choose image files from this device', () => p.choosePhotos(), { disabled: none || ro }),
        platform.qr ? big('📱', 'Phone camera', 'Show a QR code, then take pictures with your phone', () => p.phoneCamera(), { disabled: none || ro })
          : big('📷', 'Camera', 'Take a photo with this device\'s camera', () => p.phoneCamera(), { disabled: none || ro, tour: 'camera' }),
        big('📄', 'Document', 'Add a PDF, Word (.docx), PowerPoint (.pptx) or text file', () => p.chooseDocument(), { disabled: none || ro, tour: 'insert-doc' }),
        p?.canRecord() !== false ? big('🎙', 'Record', 'Record a lecture or voice note with the microphone', () => p.record(), { disabled: none || ro, tour: 'insert-record' }) : null,
        big('🎧', 'Audio file', 'Add a recording (MP3, M4A, WAV and more)', () => p.chooseAudio(), { disabled: none || ro }),
        h('span', { class: 'rb-hint', text: 'or drag in · Ctrl+V' })),
      group('Pictures in your notes', 'insert-pictures',
        big('🏞', 'Picture', 'Place an image in your notes. You can move it, resize it and draw on it', () => p.choosePicture(), { disabled: none || ro }),
        big('📎', 'Clippings', 'Diagrams found in your photos, plus clean versions redrawn by the AI, ready to drop into your notes', () => p.pics.toggleDock(), { disabled: none || ro, badge: p?.page ? (p.pics.unused() || '') : '' })),
      group('Sources → notes', 'insert-generate',
        big('✨', 'Turn into notes', 'The AI reads the new photos, documents and recordings on this page and writes organized notes', () => p.generate(false), { disabled: none || ro || !fresh, badge: fresh || '', cls: fresh ? 'accent' : '' }),
        tb('↻ Rewrite all', 'Write the notes again from everything on this page', () => p.generate(true), '', none || ro || !(p.page?.images.length || p.page?.docs?.length || p.page?.audio?.length) ? { disabled: true } : {})),
    ];
  } else if (state.tab === 'draw') {
    const auto = tb('✍ Stylus draws', 'When on, touching the page with a stylus starts drawing straight away',
      () => { prefs.autoPen = !prefs.autoPen; savePrefs(); refresh(); }, prefs.autoPen ? 'on' : '');
    panel = [
      h('div', { class: 'rb-group-box' }, h('div', { class: 'rb-row' },
        tb('<span class="rb-ico">𝖳</span>Type', 'Stop drawing: type, select and edit text', () => p.setMode('text'), p && p.getMode() === 'text' ? 'on' : '', none ? { disabled: true } : {}),
        h('span', { class: 'rb-sep' }),
        inkBar({ getMode: () => (p ? p.getMode() : 'text'), setMode: m => p?.setMode(m), history: p?.history, disabled: none || ro }),
        h('span', { class: 'rb-sep' }), auto),
      h('div', { class: 'rb-caption', text: 'Pick a pen, then draw on the page with a mouse, finger or stylus' })),
    ];
  } else if (state.tab === 'study') {
    const sets = nb ? store.setsForNotebook(nb.id).length : 0;
    panel = [
      group('Made from your notes', 'study-tools',
        big('🗂', 'Flashcards ▾', 'Generate cards from your notes, type your own, or import a Quizlet set', async e => { const a = e.currentTarget; await p?.flush(); if (!nb) return toast('Create or open a notebook first'); flashcardMenu(a, nb, scope); }, { badge: sets ? `${sets}` : '', tour: 'flashcards' }),
        big('📝', 'Practice test', 'Take a test (multiple choice, true/false, written) built from this class\'s flashcards', withPage(needNb(n => openTest(n)))),
        big('🧭', 'Study guide', 'Analyse this class\'s notes and write an exam study guide', withPage(needNb(n => studyGuideDialog(n))), { cls: 'accent' })),
      group('This class', null,
        big('🎓', 'Study tools', 'See this class\'s flashcard sets and study guides', needNb(n => { location.hash = `#/nb/${n.id}/study`; })),
        big('📚', 'All flashcard sets', 'Every set, including ones you typed or imported from Quizlet', () => { location.hash = '#/library'; })),
    ];
  } else {
    panel = [
      group('Learn Study Hall', 'help-tools',
        big('▶', 'Take the tour', 'Replay the guided tour', () => startTour()),
        big('❓', 'FAQ', 'Answers to common questions, including how to get and connect an API key', () => faqDialog(), { tour: 'faq' }),
        big('📖', 'Feature guide', 'What Study Hall can do and where to find it', () => featureGuide()),
        tb(`${store.db().settings.tourOnStartup ? '☑' : '☐'} Tour at startup`, 'Play the guided tour every time Study Hall opens', () => { store.setTourOnStartup(!store.db().settings.tourOnStartup); toast(store.db().settings.tourOnStartup ? 'The tour will play when Study Hall opens' : 'The tour won\'t play at startup. Replay it here any time.'); }, store.db().settings.tourOnStartup ? 'on' : '', { 'data-startup-toggle': '' })),
      group('Settings', null,
        big('⚙', 'AI setup', 'Choose the free, local or paid AI option', () => aiSettingsDialog()),
        big('💾', 'Backup', 'Back up to iCloud Drive, export everything, or restore', () => backupDialog(), { tour: 'backup' }),
        big('⟳', 'Check for updates', 'See if a newer version of Study Hall is out. Updates also download by themselves', () => checkForUpdates(), { tour: 'updates' })),
    ];
  }

  el.replaceChildren(
    h('div', { class: 'rb-tabs', role: 'tablist' }, TABS.map(([id, label]) =>
      h('button', { class: `rb-tab ${state.tab === id ? 'on' : ''}`, role: 'tab', 'data-tab': id, text: label, onclick: () => setTab(id) }))),
    h('div', { class: `rb-panel ${none && ['home', 'insert', 'draw'].includes(state.tab) ? 'nopage' : ''}` }, panel,
      none && ['home', 'insert', 'draw'].includes(state.tab) ? h('span', { class: 'rb-nopage', text: 'Open a page to use these tools' }) : null));
}
