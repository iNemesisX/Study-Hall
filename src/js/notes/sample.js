// The "Welcome to Study Hall" notebook: a how-to page, a page of sample notes
// (what the AI writes from photos), a sample study guide and a sample flashcard
// set. The guided tour uses it, and new users can poke at it safely.
import * as store from '../store.js';
import * as nbstore from './nbstore.js';
import { uid } from '../ui.js';
import { sectionHtml } from './render.js';
import { FEATURES } from '../views/help.js';
import { FAQ } from '../faq.js';

const topics = sections => sections.map(s => ({ id: uid(), heading: s.heading, html: sectionHtml(s), ink: [] }));

const SAMPLE_NOTES = [
  { heading: 'What cellular respiration does', summary: 'Sample notes, written the way Study Hall writes them from photos of slides.', blocks: [
    { type: 'paragraph', text: '**Cellular respiration** is how cells release the energy stored in glucose and capture it as **ATP**, the molecule that powers most cell work.' },
    { type: 'formula', term: 'Overall equation', text: 'C_6H_{12}O_6 + 6\\,O_2 \\rightarrow 6\\,CO_2 + 6\\,H_2O + \\text{energy (ATP)}' },
    { type: 'definition', term: 'ATP', text: 'Adenosine triphosphate. Energy is released when its last phosphate bond is broken.' },
    { type: 'callout', text: 'Respiration is not breathing. Breathing moves gases; respiration is the chemistry inside cells.' }] },
  { heading: 'The three stages', summary: 'Where each stage happens and what it produces.', blocks: [
    { type: 'table', rows: [['Stage', 'Where', 'Main output'], ['Glycolysis', 'Cytoplasm', '2 ATP, 2 pyruvate'], ['Krebs cycle', 'Mitochondrial matrix', '2 ATP, CO₂, NADH'], ['Electron transport chain', 'Inner mitochondrial membrane', 'About 28 ATP, water']] },
    { type: 'numbered', items: ['**Glycolysis** splits one glucose into two pyruvate. It needs no oxygen.', 'The **Krebs cycle** finishes breaking down the carbon, releasing $CO_2$.', 'The **electron transport chain** uses oxygen to make most of the ATP.'] },
    { type: 'example', text: 'How much ATP does one glucose give in total?', items: ['Glycolysis: 2 ATP', 'Krebs cycle: 2 ATP', 'Electron transport chain: about 28 ATP', 'Total: about 32 ATP'] }] },
];
// A sample of what the AI's "clean diagram" looks like: shapes plus labels that can be edited and moved.
const SAMPLE_DIAGRAM = {
  width: 800, height: 330,
  svg: '<rect x="40" y="110" width="190" height="110" rx="14" fill="#dbeafe" stroke="#1d4ed8" stroke-width="3"/><rect x="305" y="110" width="190" height="110" rx="14" fill="#dcfce7" stroke="#15803d" stroke-width="3"/><rect x="555" y="110" width="225" height="110" rx="14" fill="#fef3c7" stroke="#b45309" stroke-width="3"/>'
    + '<line x1="232" y1="165" x2="290" y2="165" stroke="#475569" stroke-width="4"/><polygon points="288,155 304,165 288,175" fill="#475569"/><line x1="497" y1="165" x2="540" y2="165" stroke="#475569" stroke-width="4"/><polygon points="538,155 554,165 538,175" fill="#475569"/>',
  labels: [
    { text: 'Glycolysis', x: 135, y: 150 }, { text: '2 ATP', x: 135, y: 185 },
    { text: 'Krebs cycle', x: 400, y: 150 }, { text: '2 ATP', x: 400, y: 185 },
    { text: 'Electron transport chain', x: 667, y: 150 }, { text: 'about 28 ATP', x: 667, y: 185 },
    { text: 'Cytoplasm', x: 135, y: 60, px: 135, py: 112 }, { text: 'Mitochondrion', x: 530, y: 60, px: 400, py: 112 },
    { text: 'Glucose in', x: 135, y: 280, px: 60, py: 218 }, { text: 'Needs oxygen', x: 665, y: 280, px: 665, py: 218 },
  ],
};
const SAMPLE_GUIDE = [
  { heading: 'Big picture', summary: 'A sample of what "Generate study guide" writes from a class\'s notes.', blocks: [
    { type: 'paragraph', text: 'Cells turn glucose and oxygen into ATP in three stages. Know **where** each stage happens, **what goes in and comes out**, and **why oxygen matters**.' }] },
  { heading: 'Common mistakes', summary: '', blocks: [
    { type: 'callout', text: 'Mixing up respiration with breathing, or saying glycolysis needs oxygen (it does not).' }] },
  { heading: 'Practice questions', summary: 'Click a question to show its answer.', blocks: [
    { type: 'question', text: 'Which stage makes the most ATP, and where does it happen?', answer: 'The electron transport chain, on the inner mitochondrial membrane (about 28 ATP).' },
    { type: 'question', text: 'A cell has no oxygen. Which stage can still run?', answer: 'Glycolysis, because it does not need oxygen.' }] },
  { heading: 'Study checklist', summary: '', blocks: [
    { type: 'bullets', items: ['Write the overall equation from memory', 'Fill in the three-stage table without looking', 'Explain why the electron transport chain needs oxygen'] }] },
];
const SAMPLE_CARDS = [
  ['ATP', 'The molecule cells use to carry energy'], ['Glycolysis', 'Splits glucose into two pyruvate in the cytoplasm; needs no oxygen'],
  ['Krebs cycle', 'Stage in the mitochondrial matrix that releases CO₂ and makes NADH'], ['Electron transport chain', 'Stage on the inner mitochondrial membrane that makes most of the ATP'],
  ['Pyruvate', 'The 3-carbon product of glycolysis'], ['Mitochondria', 'Organelle where the Krebs cycle and electron transport chain happen'],
];

/** Returns the Welcome notebook, creating it (and its sample set) if needed. */
export async function ensureWelcome() {
  let nb = nbstore.list().find(n => n.sample);
  if (!nb) {
    nb = await nbstore.createNotebook('Welcome to Study Hall', { sample: true });
    const start = await nbstore.addSection(nb, 'Getting started');
    const guides = await nbstore.addSection(nb, 'Study guides', { guides: true });
    const howTo = FEATURES.map(f => ({ heading: `${f.icon} ${f.title}`, summary: '', blocks: [{ type: 'paragraph', text: f.what }, { type: 'definition', term: 'Where', text: f.where }, { type: 'numbered', items: f.how }] }));
    await nbstore.addPage(nb, start, { title: 'Start here: what Study Hall can do', topics: topics(howTo) });
    const sampleTopics = topics(SAMPLE_NOTES);
    sampleTopics[1].pics = [{ id: uid(), kind: 'diagram', name: 'The three stages', diagram: SAMPLE_DIAGRAM, x: 56, y: null, w: 600, r: SAMPLE_DIAGRAM.height / SAMPLE_DIAGRAM.width, ink: [] }];
    SAMPLE_DIAGRAM.by = { provider: 'sample' };
    await nbstore.addPage(nb, start, { title: 'Sample notes: Cellular respiration', topics: sampleTopics, aiBy: [{ provider: 'sample' }] });
    const plain = t => t.replace(/\[([^\]]+)\]\((https:[^)\s]+)\)/g, '$1'); // the note renderer has no links
    const ai = FAQ[0].items.filter(it => ['free', 'gemini', 'ollama', 'claude'].includes(it.id));
    await nbstore.addPage(nb, start, { title: 'Set up the AI (free)', topics: topics(ai.map(it => ({ heading: it.q, summary: '', blocks: it.a.map(b => (typeof b === 'string' ? { type: 'paragraph', text: plain(b) } : b.steps ? { type: 'numbered', items: b.steps.map(plain) } : { type: 'callout', text: plain(b.tip) })) }))) });
    await nbstore.addPage(nb, guides, { title: 'Sample study guide: Cellular respiration', kind: 'guide', topics: topics(SAMPLE_GUIDE), aiBy: [{ provider: 'sample' }] });
    start.pages[0].key = 'start'; start.pages[1].key = 'sample'; guides.pages[0].key = 'guide';
    await nbstore.saveNotebook(nb);
  }
  // The tour needs the "Start here" and sample-notes pages. Put back any the user deleted.
  const rebuild = { start: ['Start here: what Study Hall can do', () => topics(FEATURES.map(f => ({ heading: `${f.icon} ${f.title}`, summary: '', blocks: [{ type: 'paragraph', text: f.what }, { type: 'definition', term: 'Where', text: f.where }, { type: 'numbered', items: f.how }] })))],
    sample: ['Sample notes: Cellular respiration', () => topics(SAMPLE_NOTES)] };
  for (const key of ['start', 'sample']) {
    if (welcomePage(nb, key)) continue;
    const sec = nb.sections.find(x => !x.guides) || await nbstore.addSection(nb, 'Getting started');
    await nbstore.addPage(nb, sec, { title: rebuild[key][0], topics: rebuild[key][1]() });
    sec.pages[sec.pages.length - 1].key = key;
    if (key === 'start') sec.pages.unshift(sec.pages.pop());
    await nbstore.saveNotebook(nb);
  }
  if (!store.setsForNotebook(nb.id).length) {
    store.saveSet({ id: uid(), title: 'Sample: Cellular respiration', description: 'A sample set made from the sample notes', folderId: null, notebookId: nb.id,
      cards: SAMPLE_CARDS.map(([term, def]) => ({ id: uid(), term, def, starred: false })) });
  }
  return nb;
}
export const welcomePage = (nb, key) => nb.sections.flatMap(s => s.pages).find(p => p.key === key);
