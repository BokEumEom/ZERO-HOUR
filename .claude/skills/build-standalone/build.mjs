// Rebuilds standalone.html from index.html by inlining the
// local js/ modules and the CDN libraries (React, ReactDOM, Babel Standalone)
// so the result runs fully offline as a single file.
//
// Usage: node .claude/skills/build-standalone/build.mjs [output.html]
// Requires Node 18+ (uses global fetch). Network access is needed once per
// build to download the CDN libraries.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const outPath = path.resolve(root, process.argv[2] ?? 'standalone.html');

const html = await readFile(path.join(root, 'index.html'), 'utf8');

// Inline-safe: a literal "</script>" inside JS source would terminate the tag.
const escapeScript = (code) => code.replace(/<\/script/gi, '<\\/script');

const scriptTag = /<script([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g;
const tasks = [];
for (const m of html.matchAll(scriptTag)) {
  tasks.push((async () => {
    const [tag, pre, src] = m;
    const isBabel = /text\/babel/.test(tag);
    let code;
    if (/^https?:\/\//.test(src)) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`fetch failed ${res.status}: ${src}`);
      code = await res.text();
    } else {
      code = await readFile(path.join(root, src), 'utf8');
    }
    const typeAttr = isBabel ? ' type="text/babel"' : '';
    return [tag, `<script${typeAttr}>\n// --- inlined: ${src} ---\n${escapeScript(code)}\n</script>`];
  })());
}

let out = html;
const replaced = await Promise.all(tasks);
if (replaced.length === 0) throw new Error('no <script src> tags found in index.html');
for (const [tag, inlined] of replaced) {
  // Function replacer: inlined library code contains $-patterns ($&, $') that
  // a string replacement would expand.
  out = out.replace(tag, () => inlined);
}

// Verify every original tag is gone (checking the whole output for
// "<script src" would false-positive on such strings inside library code).
for (const [tag] of replaced) {
  if (out.includes(tag)) throw new Error(`tag not replaced: ${tag}`);
}
await writeFile(outPath, out);
console.log(`built ${outPath} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
