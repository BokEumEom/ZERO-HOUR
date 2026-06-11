// Scoreyard — IndexedDB persistence + seeded RNG
(function () {
  const SY = (window.SY = window.SY || {});

  // ---------- Seeded RNG (xmur3 hash -> mulberry32) ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SY.makeRng = function (seedStr) {
    return mulberry32(xmur3(String(seedStr))());
  };
  SY.todayUTC = function () {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  };

  // ---------- IndexedDB key-value store ----------
  const DB_NAME = 'scoreyard';
  const STORE = 'kv';
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function kvGet(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) {
      console.warn('store get failed', e);
      return undefined;
    }
  }

  async function kvSet(key, val) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('store set failed', e);
    }
  }

  // ---------- Typed accessors ----------
  // best_all   : { score, combo, date, mode }
  // daily_<d>  : { score, combo, pace: number[], bossDown }
  // settings   : { muted: bool }
  SY.store = {
    async loadAll() {
      const today = SY.todayUTC();
      const [settings, bestAll, daily] = await Promise.all([
        kvGet('settings'),
        kvGet('best_all'),
        kvGet('daily_' + today),
      ]);
      return {
        settings: settings || { muted: false },
        bestAll: bestAll || null,
        dailyBest: daily || null,
        today,
      };
    },
    saveSettings(s) { return kvSet('settings', s); },
    saveBestAll(rec) { return kvSet('best_all', rec); },
    saveDaily(date, rec) { return kvSet('daily_' + date, rec); },
  };
})();
