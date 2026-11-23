// What the device running Study Hall can do. The desktop app's preload.js and the
// tablet / browser version's web/bridge.js each describe their platform; a plain
// browser preview gets the desktop defaults.
export const platform = window.studyhall?.platform || { kind: 'desktop', os: 'other', qr: true, camera: false, ollama: true, quizlet: true, installed: true };
export const isDesktop = platform.kind === 'desktop';
export const isTablet = !isDesktop;
/** Touch screen (finger or stylus) as the main input. */
const coarse = matchMedia('(pointer: coarse)');
export const touchFirst = () => coarse.matches; // live: 2-in-1 laptops switch modes

// Fonts offered in the Home tab. Generic families work everywhere; named ones are
// listed only if the device has them installed.
export const GENERIC_FONTS = [['System', 'system-ui'], ['Serif', 'serif'], ['Sans serif', 'sans-serif'], ['Monospace', 'monospace'], ['Handwriting', 'cursive']];
const NAMED_FONTS = ['Segoe UI', 'Calibri', 'Arial', 'Helvetica Neue', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Cambria', 'Palatino',
  'Book Antiqua', 'Avenir Next', 'Gill Sans', 'Optima', 'Roboto', 'Noto Sans', 'Noto Serif', 'Consolas', 'Menlo', 'Courier New',
  'Comic Sans MS', 'Segoe Print', 'Noteworthy', 'Chalkboard SE', 'Marker Felt', 'Bradley Hand'];
let installed = null;
/** Named fonts present on this device (checked once by comparing text widths against fallbacks). */
export function installedFonts() {
  if (installed) return installed;
  const g = document.createElement('canvas').getContext('2d');
  const sample = 'mmmmmmmmmmlli1WQ@#';
  const width = family => { g.font = `40px ${family}`; return g.measureText(sample).width; };
  const base = ['monospace', 'serif', 'sans-serif'].map(f => [f, width(f)]);
  installed = NAMED_FONTS.filter(name => base.some(([fb, w]) => width(`'${name}', ${fb}`) !== w));
  return installed;
}
/** CSS font-family for a stored font name (generic names must not be quoted). */
export function fontStack(name) {
  const generic = GENERIC_FONTS.find(([label, css]) => label === name || css === name);
  return generic ? generic[1] : `'${name}', system-ui, sans-serif`;
}
