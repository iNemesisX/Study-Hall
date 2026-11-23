// Exposes a small, safe API to the page as window.studyhall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studyhall', {
  // What this version can do (the tablet / browser version describes itself in web/bridge.js).
  platform: { kind: 'desktop', os: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux', qr: true, camera: false, ollama: true, quizlet: true, installed: true, vendor: '../node_modules/', mock: !!process.env.STUDYHALL_MOCK },
  load: () => ipcRenderer.invoke('data:load'),
  save: json => ipcRenderer.invoke('data:save', json),
  saveSync: json => ipcRenderer.sendSync('data:save-sync', json),
  dataPath: () => ipcRenderer.invoke('data:path'),
  importQuizlet: setId => ipcRenderer.invoke('quizlet:import', setId),
  // Updates (see updater.js)
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    open: () => ipcRenderer.invoke('update:open'),
    onStatus: fn => { ipcRenderer.on('update:status', (_e, s) => fn(s)); },
  },
  version: () => ipcRenderer.invoke('update:state').then(s => s.current),
  // Backups and exports (see files.js): only folders picked through a system dialog can be written.
  files: {
    icloud: () => ipcRenderer.invoke('files:icloud'),
    remember: folder => ipcRenderer.invoke('files:remember', folder),
    pickFolder: opts => ipcRenderer.invoke('files:pick-folder', opts),
    write: (folder, files) => ipcRenderer.invoke('files:write', folder, files),
    backup: (folder, text, keep) => ipcRenderer.invoke('files:backup', folder, text, keep),
    saveAs: (name, bytes) => ipcRenderer.invoke('files:save-as', name, bytes),
    show: file => ipcRenderer.invoke('files:show', file),
    openUrl: url => ipcRenderer.invoke('files:open-url', url),
  },
  // Notebooks (see notes/main.js)
  notes: {
    getSettings: () => ipcRenderer.invoke('notes:settings:get'),
    setSettings: patch => ipcRenderer.invoke('notes:settings:set', patch),
    models: args => ipcRenderer.invoke('notes:ai:models', args),
    usage: () => ipcRenderer.invoke('notes:usage:get'),
    onUsage: fn => { ipcRenderer.on('notes:usage', () => fn()); },
    testAi: args => ipcRenderer.invoke('notes:ai:test', args),
    list: () => ipcRenderer.invoke('notes:list'),
    saveNotebook: nb => ipcRenderer.invoke('notes:nb:save', nb),
    removeNotebook: id => ipcRenderer.invoke('notes:nb:delete', id),
    loadPage: (nbId, pageId) => ipcRenderer.invoke('notes:page:load', nbId, pageId),
    savePage: (nbId, page) => ipcRenderer.invoke('notes:page:save', nbId, page),
    savePageSync: (nbId, json) => ipcRenderer.sendSync('notes:page:save-sync', nbId, json),
    removePage: (nbId, pageId) => ipcRenderer.invoke('notes:page:delete', nbId, pageId),
    addImage: (id, name, bytes) => ipcRenderer.invoke('notes:image:add', id, name, bytes),
    readImage: (id, file) => ipcRenderer.invoke('notes:image:read', id, file),
    putImage: (id, file, bytes) => ipcRenderer.invoke('notes:image:put', id, file, bytes),
    addFile: (id, name, ext, bytes) => ipcRenderer.invoke('notes:file:add', id, name, ext, bytes),
    transcribe: args => ipcRenderer.invoke('notes:ai:transcribe', args),
    ask: args => ipcRenderer.invoke('notes:ai:ask', args),
    removeImage: (id, file) => ipcRenderer.invoke('notes:image:remove', id, file),
    generate: args => ipcRenderer.invoke('notes:ai:notes', args),
    makeCards: args => ipcRenderer.invoke('notes:ai:cards', args),
    makeGuide: args => ipcRenderer.invoke('notes:ai:guide', args),
    findFigures: args => ipcRenderer.invoke('notes:ai:figures', args),
    drawDiagram: args => ipcRenderer.invoke('notes:ai:diagram', args),
    captureStart: id => ipcRenderer.invoke('notes:capture:start', id),
    captureStop: () => ipcRenderer.invoke('notes:capture:stop'),
    onCapture: fn => {
      const handler = (_e, payload) => fn(payload);
      ipcRenderer.on('notes:captured', handler);
      return () => ipcRenderer.removeListener('notes:captured', handler);
    },
    exportPdf: name => ipcRenderer.invoke('notes:pdf', name),
    path: () => ipcRenderer.invoke('notes:path'),
  },
});
