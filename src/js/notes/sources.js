// Turning documents and recordings into something the AI can read, on the device:
//   - Word (.docx) and PowerPoint (.pptx): text (and PowerPoint pictures) taken out locally
//   - PDF: sent as it is to Gemini and Claude; rendered to page images for Ollama
//   - Audio: recorded in the app or uploaded, converted to small WAV chunks for transcription
// The libraries load only when first needed.
import { platform } from '../platform.js';

export const DOC_EXT = ['pdf', 'docx', 'pptx', 'txt', 'md', 'csv'];
export const AUDIO_EXT = ['wav', 'mp3', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'webm', 'flac'];
export const ACCEPT_DOCS = '.pdf,.docx,.pptx,.txt,.md,.csv,application/pdf';
export const ACCEPT_AUDIO = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.flac';
const CHUNK_SECONDS = 8 * 60;      // per transcription request (keeps each request well under 20 MB)
const SAMPLE_RATE = 12000;         // speech stays clear; Gemini reduces audio to about 16 kbps anyway
const MAX_PDF_PAGES_OLLAMA = 20;

export const extOf = file => (String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || '';
/** 'image' | 'doc' | 'audio' | null */
export function kindOf(file) {
  const ext = extOf(file);
  if (file.type?.startsWith('image/') || /^(jpe?g|png|gif|webp|bmp|heic|heif)$/.test(ext)) return 'image';
  if (file.type?.startsWith('audio/') || AUDIO_EXT.includes(ext)) return 'audio';
  if (file.type === 'video/mp4' && ext === 'm4a') return 'audio';
  if (DOC_EXT.includes(ext) || file.type === 'application/pdf') return 'doc';
  return null;
}
export const docIcon = ext => ({ pdf: '📕', docx: '📘', pptx: '📙' }[ext] || '📄');

/* ---------- loading the libraries ---------- */
export const vendor = sub => new URL(`${platform.vendor || '../node_modules/'}${sub}`, document.baseURI).href;
const scripts = new Map();
export function loadScript(sub, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scripts.has(sub)) {
    scripts.set(sub, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = vendor(sub);
      el.onload = () => resolve(window[globalName]);
      el.onerror = () => reject(new Error('Could not load the document reader'));
      document.head.append(el);
    }));
  }
  return scripts.get(sub);
}
let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    // The "legacy" build includes the newer browser features pdf.js needs, for older iPads and Electron.
    pdfjs = await import(vendor('pdfjs-dist/legacy/build/pdf.min.mjs'));
    pdfjs.GlobalWorkerOptions.workerSrc = vendor('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  }
  return pdfjs;
}

/* ---------- documents ---------- */
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function shrinkImage(bytes, maxEdge = 1600) {
  const bmp = await createImageBitmap(new Blob([bytes])).catch(() => null);
  if (!bmp) return null;
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  if (bmp.width < 120 || bmp.height < 120) { bmp.close?.(); return null; } // icons and bullets
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer());
}

/**
 * What to send to the AI for a stored document:
 *   { name, file } for a PDF (read natively by Gemini and Claude), or
 *   { name, text, imageBytes? } for everything else. For Ollama, PDFs come back as page images instead.
 */
export async function prepareDoc(doc, bytes, provider) {
  const ext = doc.ext;
  if (ext === 'pdf') {
    if (provider !== 'ollama') return { name: doc.name, file: doc.file };
    const lib = await loadPdfjs();
    const pdf = await lib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const pages = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES_OLLAMA); n++) {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1600 / Math.max(view.width, view.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
      pages.push(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()));
    }
    return { name: doc.name, pageImages: pages, truncated: pdf.numPages > MAX_PDF_PAGES_OLLAMA };
  }
  if (ext === 'docx') {
    const mammoth = await loadScript('mammoth/mammoth.browser.min.js', 'mammoth');
    const res = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    return { name: doc.name, text: res.value };
  }
  if (ext === 'pptx') {
    const JSZip = await loadScript('jszip/dist/jszip.min.js', 'JSZip');
    const zip = await JSZip.loadAsync(bytes);
    const num = p => +p.match(/(\d+)\.xml$/)[1];
    const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
    let text = '';
    for (const p of slides) {
      const xml = await zip.file(p).async('string');
      const paras = xml.split(/<\/a:p>/).map(chunk => [...chunk.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => decodeXml(m[1])).join('')).filter(t => t.trim());
      const notesPath = `ppt/notesSlides/notesSlide${num(p)}.xml`;
      let notes = '';
      if (zip.file(notesPath)) notes = [...(await zip.file(notesPath).async('string')).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => decodeXml(m[1])).join(' ').replace(/^\s*\d+\s*$/, '');
      text += `--- Slide ${num(p)} ---\n${paras.join('\n')}\n${notes.trim() ? `Speaker notes: ${notes.trim()}\n` : ''}\n`;
    }
    const media = Object.keys(zip.files).filter(p => /^ppt\/media\/.+\.(png|jpe?g)$/i.test(p)).slice(0, 24);
    const imageBytes = [];
    for (const p of media) {
      if (imageBytes.length >= 8) break;
      const img = await shrinkImage(await zip.file(p).async('uint8array'));
      if (img) imageBytes.push(img);
    }
    return { name: doc.name, text, imageBytes };
  }
  return { name: doc.name, text: new TextDecoder().decode(bytes) };
}

/* ---------- audio ---------- */
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/** Starts recording from the microphone. Returns { stop(): Promise<{ bytes, ext, mime, seconds }>, cancel(), level() }. */
export async function startRecording() {
  if (!canRecord()) throw new Error('This device can\'t record audio here.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { throw new Error(e.name === 'NotAllowedError' ? 'Study Hall isn\'t allowed to use the microphone. Allow it in your device settings, then try again.' : 'No microphone was found.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.start(1000);
  const started = Date.now();
  // A simple loudness meter, so people can see the microphone is hearing them.
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const level = () => { analyser.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return m / 128; };
  const end = () => { stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); };
  return {
    level,
    seconds: () => (Date.now() - started) / 1000,
    cancel() { try { rec.stop(); } catch { /* already stopped */ } end(); },
    stop: () => new Promise(resolve => {
      rec.onstop = async () => {
        end();
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks, { type });
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: type.split(';')[0], ext: /mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm', seconds: (Date.now() - started) / 1000 });
      };
      rec.stop();
    }),
  };
}

function wav(samples, rate) {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Uint8Array(out.buffer);
}

/** Any audio the device can play -> mono WAV chunks small enough to send. Returns { chunks: Uint8Array[], seconds }. */
export async function audioToChunks(bytes) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let decoded;
  try { decoded = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
  catch { throw new Error('This device can\'t read that audio file. Try saving it as MP3 or M4A.'); }
  finally { ctx.close().catch(() => {}); }
  const seconds = decoded.duration;
  const frames = Math.ceil(seconds * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, Math.max(1, frames), SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const mono = (await offline.startRendering()).getChannelData(0);
  const per = CHUNK_SECONDS * SAMPLE_RATE;
  const chunks = [];
  for (let i = 0; i < mono.length; i += per) chunks.push(wav(mono.subarray(i, i + per), SAMPLE_RATE));
  return { chunks, seconds };
}
export const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- live dictation (where the device offers speech recognition) ---------- */
// Desktop Chromium exposes the API but it doesn't work there, so only browsers and iPads use it.
export const liveDictation = () => platform.kind === 'web' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export function startLiveDictation({ onText, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sr = new SR();
  sr.continuous = true;
  sr.interimResults = false;
  sr.lang = navigator.language || 'en-US';
  sr.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
  sr.onend = () => onEnd?.();
  sr.onerror = e => onEnd?.(e.error);
  sr.start();
  return { stop: () => sr.stop() };
}
