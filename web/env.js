// Test hook: "?mock" in the address (or a stored flag) makes the AI return canned
// results, the same switch the desktop tests use. Must load before notes/ai.js.
let mock = false;
try { mock = new URLSearchParams(location.search).has('mock') || localStorage.getItem('studyhall-mock') === '1'; } catch { /* ignore */ }
globalThis.STUDYHALL_ENV = mock ? { STUDYHALL_MOCK: '1' } : {};
