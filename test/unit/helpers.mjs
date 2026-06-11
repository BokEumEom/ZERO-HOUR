// Test helpers: load the IIFE game modules into an isolated vm sandbox,
// with a minimal in-memory IndexedDB stub (covers exactly the API surface
// js/store.js uses) and an optional frozen clock.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function fakeIndexedDB() {
  const dbs = new Map(); // dbName -> Map(key -> value)
  return {
    _dbs: dbs,
    open(name) {
      const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const map = dbs.get(name);
        req.result = {
          createObjectStore() { return {}; },
          transaction() {
            const tx = { oncomplete: null, onerror: null, error: null };
            tx.objectStore = () => ({
              get(key) {
                const rq = { onsuccess: null, onerror: null, result: undefined };
                queueMicrotask(() => { rq.result = map.get(key); if (rq.onsuccess) rq.onsuccess(); });
                return rq;
              },
              put(val, key) {
                map.set(key, val);
                queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
                return {};
              },
            });
            return tx;
          },
        };
        if (isNew && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
}

// Date subclass with a controllable "now" — arg-ful constructions stay real.
export function frozenDateClass(fixedIso) {
  const fixed = new Date(fixedIso).getTime();
  return class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed); else super(...args);
    }
    static now() { return fixed; }
  };
}

// Build a sandbox, run the given module files in it, return the sandbox.
// opts: { nowIso?: string, idb?: object }
export function loadModules(files, opts = {}) {
  const sandbox = {
    console,
    Math,
    JSON,
    Promise,
    queueMicrotask,
    Date: opts.nowIso ? frozenDateClass(opts.nowIso) : Date,
    indexedDB: opts.idb || fakeIndexedDB(),
    __listeners: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (type, fn) => {
    (sandbox.__listeners[type] = sandbox.__listeners[type] || []).push(fn);
  };
  sandbox.dispatch = (type, ev) => { for (const fn of sandbox.__listeners[type] || []) fn(ev); };
  // every SY.audio.* call becomes a no-op
  const audioStub = new Proxy({}, { get: () => () => {} });
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
  }
  if (sandbox.SY) sandbox.SY.audio = audioStub;
  return sandbox;
}

export const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

// Drive the sim: returns the game-over result (or null if maxFrames hit).
export function runToGameOver(sb, mode, { dt = 1 / 60, maxFrames = 60 * 200, onFrame } = {}) {
  const G = sb.SY.game;
  let result = null;
  G.events.onGameOver = (res) => { result = res; };
  G.start(mode);
  for (let i = 0; i < maxFrames && !result; i++) {
    if (onFrame) onFrame(G, i);
    G.update(dt);
  }
  return result;
}
