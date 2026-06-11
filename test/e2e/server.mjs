// Tiny static server + /report sink for the E2E harness.
// Exits 0 when the harness posts an all-pass report, 1 on failures or timeout.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] || 8419);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.writeHead(200).end('ok');
      const report = JSON.parse(body);
      let fail = 0;
      for (const r of report.results) {
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.scenario}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
        if (!r.pass) fail++;
      }
      console.log(`\nE2E: ${report.results.length - fail}/${report.results.length} assertions passed`);
      server.close();
      process.exit(fail ? 1 : 0);
    });
    return;
  }
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(port, () => console.log(`e2e server on :${port}`));
setTimeout(() => { console.error('E2E TIMEOUT: no report received'); process.exit(1); }, 120000);
