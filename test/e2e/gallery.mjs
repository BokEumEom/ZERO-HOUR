// Visual-gallery server: serves the repo + gallery.html, saves canvas PNGs posted
// by the harness, exits when it posts /done. Companion to gallery.html / gallery.sh.
// A dev tool for eyeballing the real game render (rAF is starved headless, so the
// harness paints via SY.nvRender()). Not part of the pass/fail E2E gate.
//   node test/e2e/gallery.mjs <repoRoot> <outDir> [port]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || path.resolve(here, '..', '..');
const outDir = process.argv[3] || '/tmp/sy-gallery';
const port = Number(process.argv[4] || 8742);
const galleryHtml = path.join(here, 'gallery.html');
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && (req.url === '/shot' || req.url === '/done')) {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      res.writeHead(200).end('ok');
      if (req.url === '/done') { console.log('gallery done: ' + body); server.close(); process.exit(0); }
      const { name, dataUrl } = JSON.parse(body);
      await writeFile(path.join(outDir, name + '.png'), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log('saved ' + name + '.png');
    });
    return;
  }
  if (req.url === '/gallery.html') {
    try { res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(await readFile(galleryHtml)); }
    catch { res.writeHead(404).end('no gallery.html'); }
    return;
  }
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file); // read first, then head — a 404 must not double-send headers
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end('not found'); }
});
// bind 127.0.0.1 explicitly — a bare listen can bind IPv6-only under WSL and refuse localhost
server.listen(port, '127.0.0.1', () => console.log('gallery server on 127.0.0.1:' + port + ' -> ' + outDir));
setTimeout(() => { console.error('gallery TIMEOUT: no /done received'); process.exit(1); }, 120000);
