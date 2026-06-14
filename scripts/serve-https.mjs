// serve-https.mjs — minimal self-signed HTTPS static server for the repo root.
//
// WHY THIS EXISTS:
//   The mobile motion controls use the `deviceorientation` event. Browsers only
//   fire that event in a SECURE CONTEXT (HTTPS). Opening the game over `file://`
//   or plain `http://` yields ZERO orientation events — i.e. motion controls look
//   "completely broken" on a phone. This server hands the page over HTTPS so a
//   real device can receive `deviceorientation` while you develop on LAN.
//
// HOW TO TEST ON A PHONE:
//   1. Run `npm run serve:https` on your dev machine (Mac/PC).
//   2. On the phone (same Wi-Fi), open the printed LAN URL, e.g.
//        https://<LAN-IP>:8443
//   3. The browser WILL show a "your connection is not private" /
//      "self-signed certificate" warning — this is expected for a dev cert.
//      ACCEPT IT (Advanced → Proceed) to load the page. Without accepting,
//      the page won't load and motion will still appear broken.
//
// Built entirely on Node built-ins + the `selfsigned` devDependency (in-memory
// cert, nothing written to disk). Override the port with the PORT env var.

import https from 'node:https';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // repo root (one up from scripts/)
const PORT = Number(process.env.PORT) || 8443;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// Resolve a request URL to a real file path inside ROOT, blocking traversal.
function resolvePath(reqUrl) {
  const urlPath = decodeURIComponent(new URL(reqUrl, 'http://x').pathname);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const full = path.normalize(path.join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null; // escaped root
  return full;
}

async function handleRequest(req, res) {
  try {
    let filePath = resolvePath(req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try {
        await fs.stat(filePath);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
    console.error(err);
  }
}

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

async function start() {
  // Generate a throwaway self-signed cert in memory at startup.
  // NOTE: selfsigned >=5 is async (WebCrypto-based) — generate() returns a Promise.
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 365, algorithm: 'sha256' }
  );

  const server = https.createServer({ key: pems.private, cert: pems.cert }, handleRequest);

  server.listen(PORT, '0.0.0.0', () => {
    const lan = lanAddress();
    console.log('SKYSTRIKE HTTPS dev server (secure context for deviceorientation)');
    console.log(`  Local:  https://localhost:${PORT}/`);
    if (lan) {
      console.log(`  LAN:    https://${lan}:${PORT}/   <- open this on your phone`);
      console.log('  (Accept the self-signed certificate warning on the phone.)');
    } else {
      console.log('  LAN:    (no external IPv4 found)');
    }
  });
}

start().catch((err) => {
  console.error('Failed to start HTTPS dev server:', err);
  process.exit(1);
});
