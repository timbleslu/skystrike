// serve-https.mjs — minimal self-signed HTTPS static server for the repo root.

import https from 'node:https';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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

function resolvePath(reqUrl) {
  const urlPath = decodeURIComponent(new URL(reqUrl, 'http://x').pathname);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const full = path.normalize(path.join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
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
