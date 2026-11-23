// "Add from phone": a small web server on the local network, running only while
// the QR dialog is open. The QR code holds a one-time link; the phone opens a
// page with a camera button and uploads photos straight to the open notebook.
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

const MAX_BYTES = 25 * 1024 * 1024;
let active = null; // { server, token }

function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const virtual = /virtual|vethernet|vmware|vbox|hyper-v|wsl|docker|loopback|tailscale|zerotier/i.test(name);
      out.push({ name, address: a.address, rank: (priv ? 0 : 2) + (virtual ? 1 : 0) });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Study Hall capture</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 17px/1.4 system-ui, -apple-system, sans-serif; background: #0a092d; color: #f6f7fb; min-height: 100vh; display: flex; flex-direction: column; padding: 22px 18px 30px; gap: 14px; }
  h1 { font-size: 21px; margin: 0; color: #a3b0ff; }
  p { margin: 0; color: #a8b1d0; }
  label.btn { display: block; text-align: center; padding: 20px; border-radius: 14px; font-weight: 700; font-size: 19px; background: #4255ff; color: #fff; }
  label.btn.alt { background: #2e3856; font-size: 16px; padding: 14px; font-weight: 600; }
  input { display: none; }
  #status { font-weight: 600; color: #f6f7fb; min-height: 24px; }
  #list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  #list div { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: #232b4b; }
  #list img { width: 100%; height: 100%; object-fit: cover; display: block; }
  #list span { position: absolute; right: 5px; bottom: 5px; background: rgba(0,0,0,.65); border-radius: 99px; padding: 1px 8px; font-size: 13px; }
  .ok span { color: #3ccfa0; } .bad span { color: #ff8a75; }
</style></head><body>
<h1>◆ Study Hall</h1>
<p>Photos you take here go straight into the notebook open on your computer.</p>
<label class="btn">📷 Take photo<input id="cam" type="file" accept="image/*" capture="environment"></label>
<label class="btn alt">Choose from gallery<input id="pick" type="file" accept="image/*" multiple></label>
<div id="status"></div>
<div id="list"></div>
<script>
(function () {
  var sent = 0, MAX = 2000, base = location.pathname.replace(/\\/$/, '');
  var status = document.getElementById('status'), list = document.getElementById('list');
  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve({ blob: b || file, url: url }); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { resolve({ blob: file, url: url }); };
      img.src = url;
    });
  }
  function send(file) {
    var cell = document.createElement('div'), tag = document.createElement('span');
    tag.textContent = '…'; cell.appendChild(tag); list.prepend(cell);
    return shrink(file).then(function (r) {
      var im = document.createElement('img'); im.src = r.url; cell.prepend(im);
      return fetch(base + '/upload', { method: 'POST', headers: { 'Content-Type': r.blob.type || 'image/jpeg' }, body: r.blob });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status === 410 ? 'closed' : 'failed');
      sent++; cell.className = 'ok'; tag.textContent = '✓';
      status.textContent = sent + (sent === 1 ? ' photo sent' : ' photos sent');
    }).catch(function (e) {
      cell.className = 'bad'; tag.textContent = '✕';
      status.textContent = e.message === 'closed' ? 'The capture window on the computer was closed. Scan a new code.' : 'Could not send. Check that both devices are on the same Wi-Fi.';
    });
  }
  function onPick(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    files.reduce(function (p, f) { return p.then(function () { return send(f); }); }, Promise.resolve());
  }
  document.getElementById('cam').addEventListener('change', onPick);
  document.getElementById('pick').addEventListener('change', onPick);
})();
</script></body></html>`;

/** Starts the server. onImage(buffer) must resolve once the image is stored, or throw. */
async function start(onImage) {
  await stop();
  const token = crypto.randomBytes(16).toString('hex');
  const prefix = `/c/${token}`;
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0].replace(/\/$/, '');
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    };
    if (req.method === 'GET' && url === prefix) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'");
      return send(200, PAGE, 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && url === `${prefix}/upload`) {
      if (Number(req.headers['content-length']) > MAX_BYTES) { send(413, 'Too large'); return req.destroy(); }
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { send(413, 'Too large'); req.destroy(); } else chunks.push(c);
      });
      req.on('end', async () => {
        if (res.writableEnded) return;
        try { await onImage(Buffer.concat(chunks)); send(200, 'ok'); }
        catch (e) { send(415, String(e.message || 'Could not read that image')); }
      });
      return;
    }
    // Anything else (including links from an earlier, closed session) is refused.
    send(url.startsWith('/c/') ? 410 : 404, 'Not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); });
  active = { server, token };
  const { port } = server.address();
  const links = [];
  for (const a of lanAddresses()) {
    const url = `http://${a.address}:${port}${prefix}`;
    links.push({ name: a.name, url, qr: await QRCode.toDataURL(url, { margin: 2, width: 440, errorCorrectionLevel: 'M' }) });
  }
  return links;
}

function stop() {
  if (!active) return Promise.resolve();
  const { server } = active;
  active = null;
  return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
}

module.exports = { start, stop };
