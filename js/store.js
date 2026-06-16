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
  function utcDateMinus(n) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n))
      .toISOString().slice(0, 10);
  }

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
  // Records are namespaced per game: "<id>:best_all", "<id>:daily_<date>".
  //   best_all  : { score, combo, date, mode }
  //   daily_<d> : { score, combo, pace: number[], bossDown }
  // Settings are shared across the arcade: "settings" { muted, haptics, seenHowto }.
  SY.store = {
    // ---- shared settings ----
    async loadSettings() { return (await kvGet('settings')) || { muted: false }; },
    saveSettings(s) { return kvSet('settings', s); },

    // ---- per-game record store ----
    forGame(id) {
      const k = (suffix) => id + ':' + suffix;
      return {
        async loadAll() {
          const today = SY.todayUTC();
          const [bestAll, daily] = await Promise.all([kvGet(k('best_all')), kvGet(k('daily_' + today))]);
          return { bestAll: bestAll || null, dailyBest: daily || null, today };
        },
        saveBestAll(rec) { return kvSet(k('best_all'), rec); },
        saveDaily(date, rec) { return kvSet(k('daily_' + date), rec); },
        async loadRecentDailies(n) {
          const dates = [];
          for (let i = 0; i < n; i++) dates.push(utcDateMinus(i));
          const recsArr = await Promise.all(dates.map((d) => kvGet(k('daily_' + d))));
          return dates.map((date, i) => ({ date, rec: recsArr[i] || null })); // newest first
        },
        // Streak from daily keys (no stored counter, self-healing). A missing
        // record today doesn't break the streak until the day is over.
        async computeStreak() {
          let offset = 0;
          if (!(await kvGet(k('daily_' + utcDateMinus(0))))) offset = 1;
          let streak = 0;
          while (streak < 365 && (await kvGet(k('daily_' + utcDateMinus(offset + streak))))) streak++;
          return streak;
        },
        // lifetime medals: set of unlocked ids (no stored timestamps)
        async loadMedals() { return (await kvGet(k('medals'))) || []; },
        async addMedals(ids) {
          const set = new Set((await kvGet(k('medals'))) || []);
          const added = ids.filter((id) => !set.has(id));
          if (added.length) { added.forEach((id) => set.add(id)); await kvSet(k('medals'), [...set]); }
          return added; // newly unlocked this call
        },
      };
    },

    // One-time migration of pre-namespace keys (best_all / daily_<date>) into a
    // game's namespace. Idempotent: skips if the namespaced best already exists,
    // and no-ops on a fresh install. Legacy keys are left in place (harmless).
    async migrate(id) {
      if ((await kvGet(id + ':best_all')) !== undefined) return;
      const legacyBest = await kvGet('best_all');
      if (legacyBest === undefined) return;
      await kvSet(id + ':best_all', legacyBest);
      for (let i = 0; i < 90; i++) {
        const d = utcDateMinus(i);
        const v = await kvGet('daily_' + d);
        if (v !== undefined) await kvSet(id + ':daily_' + d, v);
      }
    },
  };
})();
