// Desktop app: daily AI request counts, kept in ai-usage.json (see usage-core.js).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { createUsage } = require('./usage-core');

const file = () => path.join(app.getPath('userData'), 'ai-usage.json');
module.exports = createUsage({
  read: () => JSON.parse(fs.readFileSync(file(), 'utf8')),
  write: (state) => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(state)); },
  changed: () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('notes:usage'); },
});
