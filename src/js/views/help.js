// Teaching the app: the first-run guided tour, the feature guide, and backup.
import * as store from '../store.js';
import * as nbstore from '../notes/nbstore.js';
import * as ribbon from './ribbon.js';
import { $, h, esc, modal, confirmDialog, toast } from '../ui.js';
import { prefs } from '../notes/inkbar.js';
import { aiSettingsDialog } from '../notes/aiui.js';
import { ensureWelcome, welcomePage } from '../notes/sample.js';
import { newNotebook, navIsDrawer } from './nav.js';
import { FAQ, faqHtml } from '../faq.js';
import { exportEverything, importEverything, saveFile } from '../notes/transfer.js';
import * as backup from '../notes/backup.js';
import { platform, isDesktop, touchFirst } from '../platform.js';

/* ---------- what the app does (feature guide + the "Start here" page) ---------- */
export const FEATURES = [
  { icon: '📓', title: 'Notebooks, sections and pages', what: 'Keep one notebook per class. Split it into sections (units or chapters) and pages (one lecture or topic each).',
    where: 'The left side of the window. The notebook name at the top switches notebooks.',
    how: ['Click the notebook name, then "New notebook".', 'Use "Add section" and "Add page" at the bottom of each column.', 'Click ⋯ next to a section or page to rename, move or delete it.'] },
  { icon: '📸', title: 'Turn photos and documents into notes', what: 'Add pictures of slides, textbook pages, handouts or handwritten work, or a PDF, Word or PowerPoint file. The AI reads them together and writes organized notes with headings, definitions, formulas and worked examples.',
    where: 'Insert tab → Photos or Document, then "Turn into notes".',
    how: ['Open a page and go to the Insert tab.', 'Click Photos or Document, drag files onto the page, or paste a screenshot with Ctrl+V.', 'Click "Turn into notes". Add more later and the notes are extended.'] },
  { icon: '🎙', title: 'Record lectures, voice notes and dictation', what: 'Record a lecture or a voice note (or add an audio file) and get organized notes from it, with the full transcript kept on the page. Or dictate: speak and your words are typed where the cursor is.',
    where: 'Insert tab → Record or Audio file. Home tab → Dictate.',
    how: ['Insert → Record, allow the microphone, then Stop and save.', 'Press "Turn into notes". Open Transcript to read every word.', 'To dictate, click in your notes, press Home → Dictate, speak, then Stop dictating.', 'Speech is written out by Google Gemini (free key), whichever AI you use for notes.'] },
  { icon: '✨', title: 'Ask the AI about your notes', what: 'Highlight anything in your notes and an Ask button appears beside it. Ask it to explain in more detail, show how to derive a formula, give an example or quiz you, then keep asking follow-ups. Works on diagrams and handwriting too.',
    where: 'Highlight text, or Home tab → Ask AI / Ask about an area. Pictures have their own ✨ Ask button.',
    how: ['Highlight a sentence, formula or paragraph and click ✨ Ask.', 'Pick a quick question or type your own; ask follow-ups in the same chat.', 'Each answer says whether it agrees with Wikipedia (or a web search, if turned on in AI setup), with source links.', 'Press "Look it up" to search Google, Wikipedia, YouTube or Khan Academy yourself.', 'Press "Insert into notes" to keep an answer, marked as AI, with its sources.', 'For a diagram or drawing: Home → Ask about an area, then drag a box around it.'] },
  { icon: '🏞', title: 'Pictures and diagrams in your notes', what: 'Put standalone images in your notes, then move them, resize them and draw on them. When your photos contain diagrams, Study Hall finds them and offers each one in the Clippings tray, both as a cut-out of the photo and as a clean diagram redrawn by the AI with labels you can edit and move.',
    where: 'Insert tab → Picture and Clippings. The Clippings tray sits at the bottom right of a page.',
    how: ['Insert → Picture adds an image file. Dragging or pasting an image onto your notes offers the same choice.', 'After turning photos into notes, open Clippings and drag a diagram into your notes, or press Place. Press Redraw for a clean version.', 'Click a picture to select it: drag to move, drag the corner to resize, double-click a diagram label to edit it. Use the Draw tab to write on it.', 'To cut out part of a photo yourself, click the photo and choose "Clip a picture".'] },
  ...(platform.qr ? [{ icon: '📱', title: 'Use your phone as the camera', what: 'Take pictures with your phone and have them appear on the page straight away. Nothing to install on the phone.',
    where: 'Insert tab → Phone camera.',
    how: ['Connect the phone to the same Wi-Fi as the computer.', 'Click Phone camera and scan the QR code with the phone.', 'Tap "Take photo" on the phone. Each picture lands on the open page.'] }]
    : [{ icon: '📷', title: 'Take photos with this tablet', what: 'Use the tablet\'s camera to photograph slides, handouts or textbook pages straight onto the page.',
      where: 'Insert tab → Camera, or "Take a photo" on an empty page.',
      how: ['Open a page and go to the Insert tab.', 'Tap Camera and take the picture. Retake it if it\'s blurry.', 'Tap "Turn photos into notes" when you have all the photos for the page.'] }]),
  { icon: '☁', title: 'Backups (iCloud Drive) and moving between devices', what: isDesktop ? 'Study Hall can back up everything to iCloud Drive (or OneDrive, Google Drive, any folder) once a day, keeping the last 7. One file also moves your work to a Mac, iPad or Android tablet.' : 'Back up everything to iCloud Drive or Google Drive with one tap, with a weekly reminder. The same file moves your work to another device.',
    where: 'Help tab → Backup.',
    how: isDesktop ? ['Help → Backup → Back up to iCloud Drive (or Choose a folder).', 'Backups then happen daily by themselves.', 'On another device: Help → Backup → Import a file and pick a backup. Nothing already there is overwritten.']
      : ['Help → Backup → Back up now.', 'Choose Save to Files → iCloud Drive (or Google Drive).', 'On another device: Help → Backup → Import a file. Nothing already there is overwritten.'] },
  { icon: '👥', title: 'Share and work together', what: 'Share a notebook with classmates who can edit it or only view it; changes sync live. Or turn on a view-only link that opens in any web browser, no app needed. Sign in with just your email.',
    where: 'Home tab → Share, or the notebook name → Share. 👤 at the top right → Shared with me.',
    how: ['Home → Share, sign in with the code emailed to you, then confirm.', 'Invite classmates by email as "Can edit" or "Can view", and send them the message Study Hall writes.', 'They open 👤 → Shared with me → Add.', 'Tick "Anyone with the link can view" for a read-only web link.'] },
  { icon: '⤴', title: 'Export to Word, Google Docs, PowerPoint, Notion, Evernote, Obsidian', what: 'Send a page or a whole notebook to the app you use: Word and Google Docs, PowerPoint and Google Slides (a slide per heading), Notion, Evernote or an Obsidian vault. Pictures, formulas and tables come along.',
    where: 'Home tab → Export, or ⋯ next to a page.',
    how: ['Home → Export, then pick This page or Whole notebook.', 'Click the app. Study Hall saves the file and tells you the one step to bring it in.', 'For Obsidian on a computer, pick your vault folder once; notes go straight into it.'] },  { icon: '🖍', title: 'Fonts, highlighting, comments and editing', what: 'The notes are yours to change. Type anywhere, pick the font and text size, highlight what matters and attach comments to remind yourself of questions.',
    where: 'Home tab.',
    how: ['Click in the notes and type to edit them.', 'Choose a font or size: it applies to the selected text, or to the whole page when nothing is selected.', 'Select some text, then click a highlight colour or Comment.'] },
  { icon: '✒', title: 'Draw and handwrite', what: 'Write on top of your notes with a mouse, finger or stylus. Five pen types, any colour and thickness, with undo.',
    where: 'Draw tab.',
    how: ['Go to the Draw tab and pick Pen, Fountain, Pencil, Marker or Highlighter.', 'Draw on the page. Click Type to go back to typing.', 'With a stylus: just touch the page to start drawing, and flip it over to erase.'] },
  { icon: '🗂', title: 'Flashcards: generated, typed or from Quizlet', what: 'Get a set three ways: the AI writes cards from your notes, you type your own (with images), or you import a public Quizlet set by pasting its link. Study with flip cards, Learn (which repeats what you miss) or by typing answers. Everything Quizlet charges for is free here.',
    where: 'Study tab → Flashcards.',
    how: ['Go to the Study tab and click Flashcards.', 'Pick "Generate from your notes", "Type your own cards" or "Import from Quizlet".', 'Open the set and pick Flashcards, Learn, Write or Test.'] },
  { icon: '⤴', title: 'Export a set back to Quizlet', what: 'Any set, including ones generated from your notes, can be sent to Quizlet so you can share it with classmates who use it.',
    where: 'Open a flashcard set → Export to Quizlet.',
    how: ['Open the set from Study tools or All flashcard sets.', 'Click "Export to Quizlet", then "Copy & open Quizlet".', 'Paste into Quizlet\'s Import box.'] },
  { icon: '📝', title: 'Practice tests', what: 'Test yourself with multiple choice, true/false and written questions made from a class\'s flashcards. Tests are graded and your scores are kept.',
    where: 'Study tab → Practice test.',
    how: ['Make flashcards for the class first.', 'Go to the Study tab and click Practice test.', 'Choose the question types and how many questions.'] },
  { icon: '🧭', title: 'Study guides for exams', what: 'The AI analyses a class\'s notes and writes an exam guide: the big picture, key concepts, terms, formulas, common mistakes, practice questions with answers and a review checklist.',
    where: 'Study tab → Study guide.',
    how: ['Add your notes for the class first.', 'Go to the Study tab and click Study guide.', 'Say what the exam covers (optional). The guide is saved as a page under "Study guides".'] },
  { icon: '⚙', title: 'Free AI setup', what: 'Study Hall needs an AI to read photos and write. Google Gemini is free with a Google account. You can also run a model on your own PC, or use Claude for the best quality.',
    where: 'The AI button at the top right, or Help tab → AI setup. Help → FAQ has step-by-step instructions for each option.',
    how: ['Click the AI button at the top right.', 'Choose Google Gemini and follow the steps to get a free key.', 'Paste the key, click Test connection, then Save.'] },
  { icon: '❓', title: 'FAQ', what: 'Answers to common questions: getting and connecting API keys, fixing the phone camera, importing from Quizlet, backing up your work and more. Type in the search box to find an answer.',
    where: 'Help tab → FAQ, or the ? button at the top right.',
    how: ['Click the ? button at the top right.', 'Type a few words into the search box.', 'Click a question to see the answer.'] },
];

export function featureGuide() {
  modal({
    title: 'What Study Hall can do', wide: true,
    body: `<div class="feature-list">${FEATURES.map(f => `<details class="feature"><summary><span class="ico">${f.icon}</span><span><b>${esc(f.title)}</b><br>
        <span class="muted small">${esc(f.where)}</span></span></summary>
        <p>${esc(f.what)}</p><ol>${f.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}</div>`,
    actions: [{ label: '▶ Take the tour', kind: 'ghost', onClick: () => { startTour(); } }, { label: 'FAQ', kind: 'ghost', onClick: () => { faqDialog(); } }, { label: 'Close', kind: 'primary' }],
  });
}

/* ---------- FAQ ---------- */
export function faqDialog(openId) {
  modal({
    title: 'Frequently asked questions', wide: true,
    body: `<input class="input faq-search" type="search" placeholder="Search the FAQ, e.g. &quot;API key&quot; or &quot;Quizlet&quot;" aria-label="Search the FAQ">
      ${FAQ.map(g => `<section class="faq-group"><h3>${esc(g.group)}</h3>${g.items.map(it =>
        `<details class="faq" data-faq="${it.id}" ${it.id === openId ? 'open' : ''}><summary>${esc(it.q)}</summary><div class="faq-a">${faqHtml(it.a)}
          ${it.action === 'ai' ? '<button class="btn small primary" data-ai>Open AI setup</button>' : ''}</div></details>`).join('')}</section>`).join('')}
      <p class="muted small faq-none" hidden>No questions match. Try fewer words.</p>`,
    onMount: (el, close) => {
      const search = $('.faq-search', el);
      search.addEventListener('input', () => {
        const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        el.querySelectorAll('details.faq').forEach(d => {
          const hit = words.every(w => d.textContent.toLowerCase().includes(w));
          d.hidden = !hit; if (hit) shown++;
          d.open = !!words.length && hit && shown <= 3;
        });
        el.querySelectorAll('.faq-group').forEach(g => { g.hidden = !g.querySelector('details.faq:not([hidden])'); });
        $('.faq-none', el).hidden = shown > 0;
      });
      el.querySelectorAll('[data-ai]').forEach(b => { b.onclick = () => { close(); aiSettingsDialog(); }; });
      if (openId) setTimeout(() => el.querySelector(`[data-faq="${openId}"]`)?.scrollIntoView({ block: 'start' }), 0);
      else search.focus();
    },
    actions: [{ label: 'Feature guide', kind: 'ghost', onClick: () => { featureGuide(); } }, { label: 'Close', kind: 'primary' }],
  });
}

/* ---------- backup (flashcard sets) ---------- */
export async function backupDialog() {
  const path = await store.dataPath();
  const notesPath = nbstore.api ? await nbstore.api.path() : null;
  modal({
    title: 'Backup & move to another device',
    body: `
      <h3>☁ Automatic backups</h3>
      <div data-auto></div>
      <h3 style="margin-top:20px">Everything</h3>
      <p>One file with all your notebooks (pages, photos, pictures and ink) and flashcard sets. Use it as a backup, or to move your work between a PC, Mac, iPad and Android tablet.</p>
      <div class="row gap wrap">
        <button class="btn primary" data-b="all-export">⤓ Export everything</button>
        <button class="btn" data-b="all-import">⤒ Import a file…</button>
      </div>
      <p class="muted small">Importing adds what isn't on this device yet; nothing here is overwritten. ${isDesktop ? '' : 'On a tablet, your work lives only on this device, so export a copy now and then.'}</p>
      <h3 style="margin-top:20px">Flashcard sets only</h3>
      <p class="muted small">Your sets and progress are saved automatically${path ? ` in <code class="small">${esc(path)}</code>` : ' on this device'}. ${notesPath ? `Notebooks are in <code class="small">${esc(notesPath)}</code>.` : ''}</p>
      <div class="row gap wrap">
        <button class="btn" data-b="export">⤓ Export flashcards</button>
        <button class="btn" data-b="import">⤒ Replace flashcards from a backup…</button>
      </div>
      <input type="file" accept=".json,application/json" data-in="sets" hidden>
      <input type="file" accept=".json,application/json" data-in="all" hidden>`,
    onMount: (el, close) => {
      autoBackupSection($('[data-auto]', el), close);
      $('[data-b="all-export"]', el).onclick = () => { close(); exportEverything(); };
      const all = $('[data-in="all"]', el);
      $('[data-b="all-import"]', el).onclick = () => all.click();
      all.onchange = () => { const f = all.files[0]; if (f) { close(); importEverything(f); } };
      $('[data-b="export"]', el).onclick = () => saveFile(`studyhall-flashcards-${new Date().toLocaleDateString('en-CA')}.json`, 'application/json', store.exportJSON());
      const input = $('[data-in="sets"]', el);
      $('[data-b="import"]', el).onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const text = await file.text();
        close();
        if (!(await confirmDialog('Replace flashcards?', 'This replaces ALL current flashcard sets and progress with the backup. To add sets instead, use Import a file.', 'Replace'))) return;
        try {
          store.importJSON(text);
          document.body.dataset.theme = store.db().settings.theme;
          location.hash = '#/library';
          toast('Backup restored');
        } catch (err) { toast(err.message); }
      };
    },
  });
}

// The automatic-backups part of the Backup dialog.
async function autoBackupSection(box, close) {
  const b = store.db().settings.backup;
  if (backup.canAuto()) {
    const icloud = await window.studyhall.files.icloud().catch(() => null);
    const where = b.folder ? backup.describeFolder(b.folder, icloud) : null;
    box.replaceChildren(
      h('p', { html: b.folder
        ? `Every day Study Hall saves a backup of everything to <code class="small">${esc(where)}</code> and keeps the last 7. ${esc(backup.statusText())}`
        : `Study Hall can save a backup of everything once a day. ${icloud ? 'Choose your <b>iCloud Drive</b> folder and the backups sync to iCloud, so your iPad (Files app) and other computers can import them.' : 'Pick a folder that syncs to the cloud (iCloud Drive, OneDrive, Google Drive or Dropbox) to keep copies off this computer. On Windows, install iCloud for Windows to get an iCloud Drive folder.'}` }),
      h('div', { class: 'row gap wrap' },
        b.folder ? h('button', { class: 'btn primary', text: 'Back up now', onclick: async () => { close(); await backup.backupNow(); } }) : null,
        icloud && !b.folder?.startsWith(icloud) ? h('button', { class: b.folder ? 'btn' : 'btn primary', text: '☁ Back up to iCloud Drive', onclick: async () => { close(); if (await backup.chooseFolder('icloud')) toast('Daily backups to iCloud Drive are on'); } }) : null,
        h('button', { class: 'btn', text: b.folder ? 'Change folder…' : (icloud ? 'Choose another folder…' : 'Choose a folder…'), onclick: async () => { close(); if (await backup.chooseFolder(null)) toast('Daily backups are on'); } }),
        b.lastFile ? h('button', { class: 'btn ghost', text: 'Show backups', onclick: async () => { await window.studyhall.files.remember(b.folder); window.studyhall.files.show(b.lastFile); } }) : null,
        b.folder ? h('button', { class: 'btn ghost', text: 'Turn off', onclick: () => { store.setBackup({ folder: null }); close(); toast('Automatic backups are off'); } }) : null),
      h('p', { class: 'muted small', text: 'To restore, use Import a file below and pick a backup. Importing never overwrites what\'s already here.' }));
  } else {
    box.replaceChildren(
      h('p', { html: `Your work is stored only on this device. Back up to <b>iCloud Drive</b>: press the button, then choose <b>Save to Files › iCloud Drive</b> (or Google Drive). ${esc(backup.statusText())}` }),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary', text: '☁ Back up now', onclick: () => { close(); exportEverything(); } }),
        h('label', { class: 'row gap small' }, h('input', { type: 'checkbox', checked: b.remind, onchange: e => store.setBackup({ remind: e.target.checked }) }), h('span', { text: 'Remind me weekly' }))),
      h('p', { class: 'muted small', text: 'Backups made by Study Hall on a Mac or PC into iCloud Drive can be imported here with Import a file.' }));
  }
}

/* ---------- guided tour ----------
   A step spotlights one part of the window and blocks everything else.
   Steps with `done` wait for the user to do the thing; the rest have a Next button. */
let tour = null;
const page = () => document.querySelector('.pg-root')?._pg || null;
const q = sel => () => document.querySelector(sel);
const PARTS = ['Notes', 'Flashcards and studying', 'Setup and help'];

// Steps are grouped into parts; a checkpoint between parts lets people stop or carry on.
function steps(nb) {
  const start = welcomePage(nb, 'start'), sample = welcomePage(nb, 'sample');
  const sampleSet = store.setsForNotebook(nb.id)[0];
  const at = meta => location.hash === `#/nb/${nb.id}/p/${meta.id}`;
  const open = meta => { if (meta && !at(meta)) location.hash = `#/nb/${nb.id}/p/${meta.id}`; };
  const onSet = () => !!sampleSet && location.hash === `#/set/${sampleSet.id}`;
  const openSet = () => { if (sampleSet && !onSet()) location.hash = `#/set/${sampleSet.id}`; };
  const flashMenu = () => { if (!document.querySelector('.menu')) document.querySelector('[data-tour="flashcards"]')?.click(); };
  const setItem = () => [...document.querySelectorAll('.menu .menu-item')].find(m => sampleSet && m.textContent.includes(sampleSet.title)) || null;
  let inkBefore = 0;
  return [
    { title: 'Welcome to Study Hall', big: true, welcome: true,
      body: 'Study Hall turns <b>photos of your slides, textbook pages and handwritten work</b> into organized notes, then turns those notes into <b>flashcards, practice tests and study guides</b>.<br><br>The tour has three short parts. You\'ll click through a sample class as you go:<ol class="tour-parts"><li><b>Notes</b>: notebooks, turning photos, documents and recordings into notes, asking the AI, drawing, sharing and exporting</li><li><b>Flashcards and studying</b>: making sets, the study modes, Quizlet, tests and study guides</li><li><b>Setup and help</b>: the free AI, backups, your account and where to get help</li></ol>',
      next: 'Start the tour' },

    /* ---- Part 1: Notes ---- */
    { part: 0, target: q('[data-tour="notebooks"]'), before: () => open(start), title: 'One notebook per class',
      body: 'This is the notebook you have open. Click here later to switch notebooks or create one for each class, like "Biology 101".' },
    { part: 0, target: q('[data-tour="sections"]'), before: () => open(start), title: 'Sections split up a class',
      body: 'Use sections for units, chapters or weeks. <b>Add section</b> is at the bottom of this column.' },
    { part: 0, target: q('[data-tour="pages"]'), before: () => open(start), title: 'Pages hold your notes',
      body: 'Each page is one lecture or topic.<br><br>👉 <b>Click "Sample notes: Cellular respiration"</b> to open it.', done: () => !!sample && at(sample) },
    { part: 0, target: q('[data-tour="paper"]'), before: () => open(sample), place: 'corner', title: 'This is what Study Hall writes',
      body: 'This sample shows the kind of notes you get from pictures of lecture slides: the AI works out the topics and writes headings, definitions, formulas, tables and worked examples. Everything on the page can be edited.<br><br>Pages written by the AI show a notice saying <b>which AI model wrote them</b>. AI-generated content can be wrong, so check notes against your slides or textbook.' },
    { part: 0, target: q('.pg-pic'), place: 'corner', title: 'Pictures and diagrams',
      before: () => { open(sample); setTimeout(() => document.querySelector('.pg-pic')?.scrollIntoView({ block: 'center' }), 350); },
      body: 'Pictures sit in your notes as objects you can <b>move, resize and draw on</b>. When your photos contain diagrams, Study Hall offers each one in the <b>Clippings</b> tray: as a cut-out of the photo, and as a <b>clean diagram redrawn by the AI</b> like this one, with labels you can edit (double-click) and move.' },
    { part: 0, target: q('[data-tab="insert"]'), before: () => { open(sample); ribbon.setTab('home'); }, title: 'Adding your own photos',
      body: '👉 <b>Click the Insert tab.</b>', done: () => ribbon.getTab() === 'insert' },
    { part: 0, target: q('#ribbon .rb-panel'), before: () => ribbon.setTab('insert'), title: 'Photos, documents and recordings',
      body: (platform.qr ? '<b>Photos</b> picks image files. <b>Phone camera</b> shows a QR code so you can snap pictures with your phone and have them appear here.' : '<b>Photos</b> picks images saved on this tablet. <b>Camera</b> takes a picture with the tablet\'s camera.') + ' <b>Document</b> adds a PDF, Word or PowerPoint file. <b>Record</b> records a lecture or voice note, and <b>Audio file</b> adds a recording you already have. You can also drag files onto a page.<br><br>Then press <b>Turn into notes</b>.<br><br><b>Picture</b> places an image straight into your notes, and <b>Clippings</b> holds the diagrams found in your photos.' },
    { part: 0, target: q('[data-tab="draw"]'), before: () => ribbon.setTab('insert'), title: 'Writing on your notes',
      body: '👉 <b>Click the Draw tab.</b>', done: () => ribbon.getTab() === 'draw' },
    { part: 0, target: q('[data-tour="pens"]'), before: () => { open(sample); ribbon.setTab('draw'); page()?.setMode('text'); }, title: 'Pick a pen',
      body: 'Pen, fountain pen, pencil, marker and highlighter each keep their own colour and thickness.<br><br>👉 <b>Click any pen.</b>', done: () => !!page() && page().getMode() !== 'text' },
    { part: 0, target: q('[data-tour="paper"]'), place: 'corner', title: 'Draw on the page',
      before: () => { ribbon.setTab('draw'); if (page() && page().getMode() === 'text') page().setMode(prefs.tool); inkBefore = page()?.inkCount() || 0; },
      body: '👉 <b>Drag on the notes to draw</b>: circle a word or underline something. A stylus works too, with pressure and an eraser end.', done: () => (page()?.inkCount() || 0) > inkBefore },
    { part: 0, target: q('[data-tab="home"]'), before: () => ribbon.setTab('draw'), title: 'Back to typing',
      body: '👉 <b>Click the Home tab.</b>', done: () => ribbon.getTab() === 'home' },
    { part: 0, target: q('#ribbon .rb-panel'), before: () => ribbon.setTab('home'), title: 'Fonts, highlights and comments',
      body: 'Pick a <b>font</b> and text size for the page or for selected text. Select text and click a <b>highlight colour</b>, or <b>Comment</b> to attach a question or reminder. <b>Save as PDF</b> exports the page with all your markings.' },
    { part: 0, target: q('[data-tour="ask"]'), before: () => { open(sample); ribbon.setTab('home'); }, title: 'Ask the AI about your notes',
      body: '<b>Highlight any part of your notes</b> and a <b>✨ Ask</b> button pops up beside it. Ask it to explain in more detail, show how to derive a formula, give an example or quiz you, then keep asking follow-ups. <b>Insert into notes</b> keeps an answer.<br><br>Every answer is <b>checked against Wikipedia</b> (or a web search, if you turn that on in AI setup) and shows its sources. <b>Look it up</b> searches Google, Wikipedia, YouTube or Khan Academy yourself.<br><br><b>Ask about an area</b> lets you drag a box around a diagram or handwriting. <b>Dictate</b> types what you say.' },
    { part: 0, target: q('[data-tour="share"]'), before: () => { open(sample); ribbon.setTab('home'); }, title: 'Share and export',
      body: '<b>Share</b> lets classmates edit or view a notebook, with changes syncing live, or makes a view-only link anyone can open in a browser. <b>Export</b> sends a page or notebook to <b>Word, Google Docs, PowerPoint, Google Slides, Notion, Evernote or Obsidian</b>.' },
    { checkpoint: 1, title: 'Part 1 done: Notes',
      body: 'Next is <b>Flashcards and studying</b> (9 steps): making flashcard sets three ways, the study modes, Quizlet import and export, practice tests and study guides.' },

    /* ---- Part 2: Flashcards and studying ---- */
    { part: 1, target: q('[data-tab="study"]'), before: () => { open(sample); ribbon.setTab('home'); }, title: 'The Study tab',
      body: 'Everything for studying is here, made from your notes.<br><br>👉 <b>Click the Study tab.</b>', done: () => ribbon.getTab() === 'study' },
    { part: 1, target: q('[data-tour="flashcards"]'), before: () => ribbon.setTab('study'), title: 'Flashcards',
      body: '👉 <b>Click Flashcards.</b>', done: () => !!document.querySelector('.menu') },
    { part: 1, target: q('.menu'), before: () => { ribbon.setTab('study'); flashMenu(); }, title: 'Three ways to make a set',
      body: '<b>Generate from your notes</b>: the AI writes term-and-definition cards from a page, a section or the whole class.<br><b>Type your own cards</b>: add terms, definitions and images yourself.<br><b>Import from Quizlet</b>: paste the link of any public Quizlet set to copy it in.' },
    { part: 1, target: setItem, before: () => { ribbon.setTab('study'); flashMenu(); }, title: 'Open a set',
      body: 'Sets you make for a class are listed here too.<br><br>👉 <b>Click "' + esc(sampleSet?.title || 'the sample set') + '"</b> to open it.', done: onSet },
    { part: 1, target: q('.modes'), before: openSet, title: 'Four ways to study',
      body: '<b>Flashcards</b>: flip through cards and sort them into "know" and "still learning".<br><b>Learn</b>: adaptive rounds that repeat what you get wrong until you master it.<br><b>Write</b>: type each answer from memory.<br><b>Test</b>: a graded practice test with multiple choice, true/false and written questions.<br><br>Your progress is tracked under <b>Your progress</b> further down.' },
    { part: 1, target: q('#fc .flash'), before: openSet, title: 'Try a card',
      body: '👉 <b>Click the card to flip it.</b><br><br>Use the arrows (or ← → keys) to move, Space to flip, and ★ to star hard cards so you can study just those.', done: () => !!document.querySelector('#fc .flash.flipped') },
    { part: 1, target: q('.set-head .row'), before: openSet, title: 'Edit, export to Quizlet',
      body: '<b>Edit</b> changes cards, adds images or imports more text. <b>Export to Quizlet</b> copies the set in Quizlet\'s format and opens Quizlet so you can share it with classmates. <b>Move</b> files it in a folder.' },
    { part: 1, target: q('[data-tour="study-tools"]'), before: () => { openSet(); ribbon.setTab('study'); }, title: 'Practice tests and study guides',
      body: '<b>Practice test</b> quizzes you on a class\'s flashcards and grades it. <b>Study guide</b> analyses all the notes for a class and writes an exam-prep guide: key concepts, terms, formulas, common mistakes, practice questions with answers and a review checklist. It is saved as a page you can edit.' },
    { part: 1, target: q('[data-tour="studyhub"]'), title: 'Everything for a class in one place',
      body: '<b>Study tools</b> lists every flashcard set and study guide for the open notebook, with buttons to make more. <b>All flashcard sets</b> (Study tab) shows sets from every class, plus ones you made outside a notebook.' },
    { checkpoint: 2, title: 'Part 2 done: Flashcards and studying',
      body: 'Last is <b>Setup and help</b>: turning on the free AI, backups, your account and where to find answers.' },

    /* ---- Part 3: Setup and help ---- */
    { part: 2, target: q('[data-tour="ai"]'), before: () => { open(sample); ribbon.setTab('home'); }, title: 'Set up the AI (free)',
      body: 'The AI is what reads photos, documents and recordings, answers your Ask AI questions, and writes notes, flashcards and study guides. <b>Google Gemini is free</b>: click here after the tour and follow the steps. <b>Help → FAQ</b> walks through getting a key.'
        + (platform.ollama ? '<br><br>Prefer a <b>local model</b>? Choose <b>Ollama</b> to run everything, Ask AI included, on ' + (isDesktop ? 'this computer' : 'a computer on your Wi-Fi') + ': free, no daily limit, nothing leaves it. Recordings and dictation still use a free Gemini key, since local models can\'t listen to audio.' : '') },
    { part: 2, target: q('[data-tour="backup"]'), before: () => ribbon.setTab('help'), title: 'Back up to iCloud Drive',
      body: isDesktop ? '<b>Backup</b> can save everything to <b>iCloud Drive</b> (or OneDrive, Google Drive, any folder) once a day by itself, keeping the last 7. The same file moves your work to an iPad, Mac or Android tablet.'
        : 'Your work lives on this device. <b>Backup → Back up now</b> saves everything to <b>iCloud Drive</b> or Google Drive, and Study Hall reminds you weekly. The same file moves your work to another device.' },
    ...(document.querySelector('[data-tour="account"]') ? [{ part: 2, target: q('[data-tour="account"]'), before: () => ribbon.setTab('help'), title: 'Your account (for sharing)',
      body: 'Sign in here with just your email to share notebooks. <b>Shared with me</b> lists notebooks classmates shared with you. You don\'t need an account for anything else.' }] : []),
    { part: 2, target: q('[data-tab="help"]'), title: 'Help is always here',
      body: 'The <b>Help</b> tab has the <b>FAQ</b> (including step-by-step instructions for getting an API key), the feature guide, and this tour, which you can replay or jump into at any part.<br><br>Study Hall <b>updates itself</b>: a card appears when a new version is ready, and <b>Check for updates</b> looks straight away.', next: 'Finish' },
  ];
}

export async function startTour() {
  if (tour || !nbstore.api) return;
  document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
  const nb = await ensureWelcome();
  const list = steps(nb);
  const shades = [0, 1, 2, 3].map(() => h('div', { class: 'tour-shade' }));
  const ring = h('div', { class: 'tour-ring' });
  const block = h('div', { class: 'tour-block' });
  const tip = h('div', { class: 'tour-tip', role: 'dialog', 'aria-live': 'polite' });
  const layer = h('div', { class: 'tour-layer' }, shades, block, ring, tip);
  document.body.append(layer);
  tour = { i: 0, list, layer };

  const end = finished => {
    clearInterval(tour.timer);
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
    tour = null;
    document.body.classList.remove('nav-open');
    store.setTourDone(true);
    ribbon.setTab('home');
    if (finished) finishDialog();
    else toast(store.db().settings.tourOnStartup ? 'Tour closed. It plays again next time Study Hall opens; turn that off on its first screen or in the Help tab.' : 'Tour closed. Replay it any time from the Help tab.');
  };
  const firstOf = part => list.findIndex(x => x.part === part);
  const count = s => {
    if (s.part == null) return '';
    const inPart = list.filter(x => x.part === s.part);
    return `Part ${s.part + 1} of ${PARTS.length} · ${PARTS[s.part]} · Step ${inPart.indexOf(s) + 1} of ${inPart.length}`;
  };
  const show = i => {
    tour.i = i;
    const s = list[i];
    try { s.before?.(); } catch (e) { console.error(e); }
    tip.className = `tour-tip ${s.big || s.checkpoint ? 'big' : ''}`;
    const prev = i > 1 && !s.checkpoint && list[i - 1].part === s.part;
    tip.replaceChildren(...[
      h('div', { class: 'tour-count', text: s.checkpoint ? `✓ Part ${s.checkpoint} of ${PARTS.length} complete` : count(s) }),
      h('h3', { text: s.title }),
      h('p', { html: touchFirst() ? s.body.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : s.body }),
      s.welcome ? h('div', { class: 'tour-jump' }, h('span', { class: 'muted small', text: 'Or jump to:' }),
        PARTS.slice(1).map((name, k) => h('button', { class: 'link-btn', 'data-part': k + 1, text: name, onclick: () => show(firstOf(k + 1)) }))) : null,
      s.welcome ? h('label', { class: 'tour-startup' },
        h('input', { type: 'checkbox', checked: store.db().settings.tourOnStartup, onchange: e => store.setTourOnStartup(e.target.checked) }),
        h('span', { text: 'Show this tour every time Study Hall opens' })) : null,
      h('div', { class: 'tour-actions' },
        s.checkpoint ? h('button', { class: 'link-btn', text: 'Finish for now', onclick: () => end(true) })
          : h('button', { class: 'link-btn', text: 'Skip the tour', onclick: () => end(false) }),
        h('span', { class: 'spacer' }),
        prev ? h('button', { class: 'btn small ghost', text: 'Back', onclick: () => show(i - 1) }) : null,
        s.checkpoint ? h('button', { class: 'btn small primary', text: `Continue to part ${s.checkpoint + 1}`, onclick: () => next() })
          : s.done ? h('button', { class: 'btn small ghost', text: 'Skip this step', onclick: () => next() })
            : h('button', { class: 'btn small primary', text: s.next || 'Next', onclick: () => next() }))].filter(Boolean));
    place();
    const main = tip.querySelector('.btn.primary');
    if (main) main.focus(); else document.activeElement?.blur?.();
  };
  const next = () => (tour.i + 1 < list.length ? show(tour.i + 1) : end(true));

  // Lays out the dark panels around the target, the ring on it, and the tip beside it.
  function place() {
    const s = list[tour.i];
    let el = s.target?.();
    // Targets in the navigation pane: slide it open on narrow screens.
    const inNav = el && el.closest?.('#nav');
    if (navIsDrawer()) document.body.classList.toggle('nav-open', !!inNav);
    const W = innerWidth, H = innerHeight;
    if (!el) {
      shades[0].style.cssText = 'left:0;top:0;width:100%;height:100%';
      shades.slice(1).forEach(x => { x.style.cssText = 'display:none'; });
      ring.style.display = block.style.display = 'none';
      tip.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)';
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 5;
    const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
    const w = Math.min(W, r.right + pad) - x, hgt = Math.min(H, r.bottom + pad) - y;
    shades[0].style.cssText = `left:0;top:0;width:100%;height:${y}px`;
    shades[1].style.cssText = `left:0;top:${y + hgt}px;width:100%;height:${Math.max(0, H - y - hgt)}px`;
    shades[2].style.cssText = `left:0;top:${y}px;width:${x}px;height:${hgt}px`;
    shades[3].style.cssText = `left:${x + w}px;top:${y}px;width:${Math.max(0, W - x - w)}px;height:${hgt}px`;
    const box = `left:${x}px;top:${y}px;width:${w}px;height:${hgt}px`;
    ring.style.cssText = box;
    block.style.cssText = s.done ? 'display:none' : box; // only "do it" steps let clicks through
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let tx, ty;
    if (s.place === 'corner') { tx = W - tw - 24; ty = H - th - 24; }
    else {
      tx = Math.max(12, Math.min(x, W - tw - 12));
      if (y + hgt + 12 + th < H) ty = y + hgt + 12;
      else if (y - th - 12 > 0) ty = y - th - 12;
      else { ty = Math.max(12, Math.min(y, H - th - 12)); tx = x + w + 12 + tw < W ? x + w + 12 : Math.max(12, x - tw - 12); }
    }
    tip.style.cssText = `left:${tx}px;top:${ty}px`;
  }

  // Keys only reach the tour's own buttons or the element being taught.
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return end(false); }
    const s = list[tour.i];
    if (tip.contains(e.target) || (s.done && s.target?.()?.contains(e.target))) return;
    e.preventDefault(); e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  tour.timer = setInterval(() => {
    const s = list[tour.i];
    if (s.done?.()) return next();
    place();
  }, 150);
  window.addEventListener('resize', () => tour && place());
  show(0);
}
export const tourActive = () => !!tour;

function finishDialog() {
  modal({
    title: 'You\'re ready',
    body: `<p>Three things to do next:</p>
      <ol class="steps"><li><b>Set up the free AI</b> so Study Hall can read your photos. Help → FAQ explains how to get a key.</li>
        <li><b>Create a notebook</b> for one of your classes.</li>
        <li><b>Add photos</b> of your latest slides or notes and turn them into notes.</li></ol>
      <p class="muted small">The Welcome notebook stays as a sandbox. Delete it whenever you like.</p>
      <label class="tour-startup"><input type="checkbox" data-startup ${store.db().settings.tourOnStartup ? 'checked' : ''}> Show the tour every time Study Hall opens</label>`,
    onMount: el => { el.querySelector('[data-startup]').onchange = e => store.setTourOnStartup(e.target.checked); },
    actions: [
      { label: 'Keep exploring', kind: 'ghost' },
      { label: 'Create a notebook', kind: '', onClick: () => { newNotebook(); } },
      { label: 'Set up free AI', kind: 'primary', onClick: () => { aiSettingsDialog(); } },
    ],
  });
}
