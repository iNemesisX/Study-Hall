// Exposes a small, safe API to the page as window.studyhall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studyhall', {
  load: () => ipcRenderer.invoke('data:load'),
  save: json => ipcRenderer.invoke('data:save', json),
  saveSync: json => ipcRenderer.sendSync('data:save-sync', json),
  dataPath: () => ipcRenderer.invoke('data:path'),
  importQuizlet: setId => ipcRenderer.invoke('quizlet:import', setId),
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
