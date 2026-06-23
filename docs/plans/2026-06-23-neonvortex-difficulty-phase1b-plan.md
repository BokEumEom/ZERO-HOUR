# 난이도 Phase 1B (UI 셀렉터 + 난이도별 기록) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플레이어가 메뉴에서 EASY/NORMAL/HARD를 골라 프리플레이를 시작하고, 베스트 기록이 난이도별로 분리 저장되게 한다. (데일리는 Phase 1에서 이미 Normal 강제.)

**Architecture:** store에 난이도별 베스트 접근자(`best_<diff>`)와 `best_all`→`best_normal` 마이그레이션을 추가하고, game over 결과에 `difficulty`를 실어보낸다. main.js는 영속 난이도(`settings.nvDifficulty`)를 읽어 `G.start(mode, diff)`로 시작하고, 게임오버 시 난이도별 베스트로 라우팅한다. 메뉴에 3칩 셀렉터를 추가해 헤드라인 베스트가 선택 난이도를 반영한다.

**Tech Stack:** Vanilla JS IIFE, IndexedDB kv store, `node --test 'test/unit/*.mjs'`(vm 샌드박스 + IndexedDB 스텁).

설계: [docs/plans/2026-06-23-neonvortex-difficulty-turret-design.md](2026-06-23-neonvortex-difficulty-turret-design.md). 선행: Phase 1(엔진 knob, main 병합 완료) — `G.start(mode, difficulty)`·`s.difficulty` 이미 존재.

---

## File Structure (Phase 1B)
- `js/store.js` (수정) — `saveBestFor/loadBestFor/loadBests` 접근자 + `best_all`→`best_normal` 마이그레이션.
- `js/games/neonvortex/game.js` (수정) — `endGame` 결과 `res`에 `difficulty` 추가.
- `js/games/neonvortex/main.js` (수정) — `difficultyValue/setDifficulty`, `reallyStart`→`G.start(mode, diff)`, `onGameOver` 난이도별 베스트 라우팅, 부팅 시 `recs.bestByDiff` 로드, 헤드라인.
- `index.html` (수정) — 메뉴 난이도 셀렉터 3칩.
- `test/unit/store.test.mjs`, `test/unit/difficulty.test.mjs`, `test/unit/static.test.mjs` (수정) — 단위/정적 테스트.

테스트: `node --test 'test/unit/*.mjs'` (디렉터리 형태는 이 Node에서 실패하므로 글롭).

---

### Task 1: store — 난이도별 베스트 접근자 + 마이그레이션

**Files:**
- Modify: `js/store.js`
- Test: `test/unit/store.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — `test/unit/store.test.mjs` 끝에 append (기존 파일의 import/헬퍼 재사용; `loadModules`+`fakeIndexedDB`+`flushMicrotasks` 사용):
```js
test('per-difficulty best is namespaced and round-trips', async () => {
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb: fakeIndexedDB() });
  const g = sb.SY.store.forGame('neonvortex');
  await g.saveBestFor('hard', { score: 1234, combo: 9, date: '2026-03-01', mode: 'free' });
  await flushMicrotasks();
  const easy = await g.loadBestFor('easy');
  const hard = await g.loadBestFor('hard');
  assert.equal(easy, null, 'easy untouched');
  assert.equal(hard.score, 1234, 'hard round-trips');
});

test('migrateBest copies legacy best_all into best_normal once (idempotent)', async () => {
  const idb = fakeIndexedDB();
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb });
  // seed a legacy namespaced best_all (pre-Phase-1B)
  idb._dbs.set('scoreyard', new Map([['neonvortex:best_all', { score: 500, combo: 5, date: '2026-02-01', mode: 'daily' }]]));
  const g = sb.SY.store.forGame('neonvortex');
  await sb.SY.store.migrateBest('neonvortex');
  await flushMicrotasks();
  assert.equal((await g.loadBestFor('normal')).score, 500, 'best_normal seeded from best_all');
  // idempotent: a second call must not clobber a higher best_normal
  await g.saveBestFor('normal', { score: 999, combo: 1, date: '2026-03-01', mode: 'free' });
  await flushMicrotasks();
  await sb.SY.store.migrateBest('neonvortex');
  await flushMicrotasks();
  assert.equal((await g.loadBestFor('normal')).score, 999, 'migration does not overwrite existing best_normal');
});
```
(파일 상단에 `fakeIndexedDB`/`flushMicrotasks`가 import되어 있는지 확인하고 없으면 import 라인에 추가.)

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/store.test.mjs'` → `saveBestFor`/`migrateBest` 미정의로 실패.

- [ ] **Step 3: `forGame`에 난이도별 접근자 추가** — `js/store.js`의 `forGame(id)` 반환 객체에서 `saveBestAll(rec) { return kvSet(k('best_all'), rec); }` 줄 바로 다음에 추가:
```js
        // per-difficulty all-time best (free-play). daily stays Normal (Phase 1).
        saveBestFor(diff, rec) { return kvSet(k('best_' + diff), rec); },
        async loadBestFor(diff) { return (await kvGet(k('best_' + diff))) || null; },
        async loadBests() {
          const [easy, normal, hard] = await Promise.all([
            kvGet(k('best_easy')), kvGet(k('best_normal')), kvGet(k('best_hard')),
          ]);
          return { easy: easy || null, normal: normal || null, hard: hard || null };
        },
```

- [ ] **Step 4: `migrateBest` 추가** — `SY.store` 객체에서 기존 `async migrate(id) { ... }` 메서드 정의가 끝나는 `},` 다음에 새 메서드 추가:
```js
    // One-time: copy a player's legacy single best (best_all) into best_normal so
    // the pre-difficulty personal best is attributed to Normal. Idempotent: skips
    // if best_normal already exists.
    async migrateBest(id) {
      const k = (s) => id + ':' + s;
      if ((await kvGet(k('best_normal'))) !== undefined) return;
      const legacy = await kvGet(k('best_all'));
      if (legacy === undefined) return;
      await kvSet(k('best_normal'), legacy);
    },
```

- [ ] **Step 5: 통과 확인** — `node --test 'test/unit/store.test.mjs'` → PASS. 이어서 `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 6: 커밋**
```bash
git add js/store.js test/unit/store.test.mjs
git commit -m "feat: store 난이도별 베스트 접근자 + best_all→best_normal 마이그레이션"
```

---

### Task 2: game over 결과에 difficulty 실어보내기

**Files:**
- Modify: `js/games/neonvortex/game.js`
- Test: `test/unit/difficulty.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — `test/unit/difficulty.test.mjs` 끝에 append:
```js
test('game-over result carries the run difficulty', () => {
  const G = boot().SY.nvGame;
  let res = null;
  G.events.onGameOver = (r) => { res = r; };
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  // force time-out end quickly
  G.state.timeLeft = 0.0001;
  G.update(0.01);
  assert.ok(res, 'game over fired');
  assert.equal(res.difficulty, 'hard');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/difficulty.test.mjs'` → `res.difficulty` undefined로 실패.

- [ ] **Step 3: `endGame`의 `res`에 difficulty 추가** — `game.js`의 `endGame`에서 `res` 객체 리터럴의 `mode: s.mode, score: s.score, maxCombo: s.maxCombo,` 줄 바로 다음 줄에 추가:
```js
      difficulty: s.difficulty,
```

- [ ] **Step 4: 통과 확인** — `node --test 'test/unit/difficulty.test.mjs'` → PASS. 이어서 `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 5: 커밋**
```bash
git add js/games/neonvortex/game.js test/unit/difficulty.test.mjs
git commit -m "feat: 게임오버 결과에 difficulty 포함"
```

---

### Task 3: main.js — 난이도 값/시작/기록 라우팅 (DOM 제외)

**Files:**
- Modify: `js/games/neonvortex/main.js`
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: 실패 정적 핀 추가** — `test/unit/static.test.mjs` 끝에 append:
```js
test('main.js wires difficulty into start + per-difficulty best routing', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/G\.start\(mode, difficultyValue\(\)\)/.test(src), 'reallyStart passes selected difficulty');
  assert.ok(src.includes('saveBestFor'), 'onGameOver routes to per-difficulty best');
  assert.ok(src.includes('nvDifficulty'), 'difficulty persisted in settings');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/static.test.mjs'`.

- [ ] **Step 3: `difficultyValue`/`setDifficulty` 추가** — `main.js`의 도색 셀렉터 블록(`const NV_COATINGS = [` 부근)과 동일 패턴으로, `paintValue` 정의 근처(예: `const paintValue = () => {` 정의 위)에 추가:
```js
  // ---------- difficulty (free-play only; daily is always Normal) ----------
  const NV_DIFFICULTIES = ['easy', 'normal', 'hard'];
  const difficultyValue = () => {
    const d = recs.settings && recs.settings.nvDifficulty;
    return NV_DIFFICULTIES.includes(d) ? d : 'normal';
  };
  function setDifficulty(id) {
    const next = NV_DIFFICULTIES.includes(id) ? id : 'normal';
    recs.settings.nvDifficulty = next;
    SY.store.saveSettings(recs.settings);
    renderMenuStats();           // headline best reflects the selected difficulty
    if (typeof syncDifficultyChips === 'function') syncDifficultyChips(); // syncDifficultyChips is added in Task 4 (DOM)
  }
```

- [ ] **Step 4: `recs`에 bestByDiff 추가 + 부팅 로드** — `main.js` 상단 `let recs = { ... }` 리터럴에 `bestByDiff: { easy: null, normal: null, hard: null },`를 추가(예: `bestAll: null,` 다음). 그리고 `loadRecords()`에서 `await SY.store.migrate('neonvortex');` 다음 줄에 추가:
```js
    await SY.store.migrateBest('neonvortex');
```
그리고 `recs.lifetime = await gameStore.loadLifetime();` 다음 줄에 추가:
```js
    recs.bestByDiff = await gameStore.loadBests();
```

- [ ] **Step 5: 헤드라인이 선택 난이도 반영** — `renderMenuStats`의 all-best 줄을 교체. 현재:
```js
    $('menu-all-best').textContent = recs.bestAll
      ? 'ALL-TIME BEST ' + fmt(recs.bestAll.score) + ' · ×' + recs.bestAll.combo + ' · ' + recs.bestAll.date
      : 'ALL-TIME BEST —';
```
를:
```js
    const selDiff = difficultyValue();
    const dBest = (recs.bestByDiff && recs.bestByDiff[selDiff]) || null;
    $('menu-all-best').textContent = dBest
      ? selDiff.toUpperCase() + ' BEST ' + fmt(dBest.score) + ' · ×' + dBest.combo + ' · ' + dBest.date
      : selDiff.toUpperCase() + ' BEST —';
```

- [ ] **Step 6: `reallyStart`가 난이도 전달** — `main.js`의 `reallyStart`에서:
```js
    G.start(mode); // Phase 1B: pass selected difficulty — G.start(mode, difficultyValue())
```
를:
```js
    G.start(mode, difficultyValue()); // daily ignores it (engine forces Normal)
```

- [ ] **Step 7: `onGameOver` 난이도별 베스트 라우팅** — 현재의 best_all 블록:
```js
    if (!recs.bestAll || res.score > recs.bestAll.score) {
      newAll = true;
      recs.bestAll = { score: res.score, combo: res.maxCombo, date: recs.today, mode: res.mode };
      gameStore.saveBestAll(recs.bestAll);
    }
```
를:
```js
    const runDiff = res.difficulty || 'normal';
    recs.bestByDiff = recs.bestByDiff || { easy: null, normal: null, hard: null };
    if (!recs.bestByDiff[runDiff] || res.score > recs.bestByDiff[runDiff].score) {
      newAll = true;
      recs.bestByDiff[runDiff] = { score: res.score, combo: res.maxCombo, date: recs.today, mode: res.mode };
      gameStore.saveBestFor(runDiff, recs.bestByDiff[runDiff]);
    }
```
그리고 over 화면 "ALL-TIME BEST" 스탯(현재 `: fmt(recs.bestAll.score))`)을 난이도별로:
```js
      statRow(res.mode === 'daily' ? 'TODAY’S BEST' : 'ALL-TIME BEST',
        res.mode === 'daily'
          ? (recs.dailyBest ? fmt(recs.dailyBest.score) : '—')
          : fmt((recs.bestByDiff[res.difficulty || 'normal'] || { score: res.score }).score)),
```
(즉 `fmt(recs.bestAll.score)` → 위 난이도별 표현으로 교체. `recs.bestAll` 다른 참조가 남아있지 않은지 grep으로 확인하고, 남아있으면 헤드라인/오버 외 표시용은 `recs.bestByDiff.normal`로 대체하거나 제거.)

- [ ] **Step 8: 잔여 `recs.bestAll` 참조 정리** — `grep -n "recs.bestAll" js/games/neonvortex/main.js`로 남은 참조 확인. RANKING/achievements 등에서 쓰이면 `(recs.bestByDiff && recs.bestByDiff.normal)`로 의미 보존 교체(또는 해당 표시가 "전체 베스트"를 원하면 세 난이도 중 max). 각 치환은 표시 전용이라 동작 안전.

- [ ] **Step 9: 정적 테스트 + 전체 통과** — `node --test 'test/unit/static.test.mjs'` PASS, `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 10: 커밋**
```bash
git add js/games/neonvortex/main.js test/unit/static.test.mjs
git commit -m "feat: 난이도 선택값으로 시작 + 난이도별 베스트 라우팅/헤드라인"
```

---

### Task 4: index.html + main.js — 메뉴 난이도 셀렉터 3칩

**Files:**
- Modify: `index.html`, `js/games/neonvortex/main.js`, `css/neonvortex.css`

- [ ] **Step 1: 셀렉터 마크업 추가** — `index.html`의 FREE PLAY 버튼(`id="neonvortex-btn-free"`) `</button>` 닫힘 바로 다음에 추가:
```html
            <div id="neonvortex-menu-difficulty" class="nv-diff-row" role="group" aria-label="Free-play difficulty">
              <button id="neonvortex-diff-easy" class="nv-diff-chip" type="button" data-diff="easy">EASY</button>
              <button id="neonvortex-diff-normal" class="nv-diff-chip" type="button" data-diff="normal">NORMAL</button>
              <button id="neonvortex-diff-hard" class="nv-diff-chip" type="button" data-diff="hard">HARD</button>
            </div>
```

- [ ] **Step 2: 칩 스타일 추가** — `css/neonvortex.css` 끝에 추가(기존 토큰 변수 사용):
```css
.nv-diff-row { display: flex; gap: 8px; margin: 6px 0 2px; }
.nv-diff-chip {
  flex: 1; padding: 8px 4px; font: 600 12px/1 var(--nv-mono, monospace);
  letter-spacing: 0.08em; color: var(--nv-dim, #7da); background: transparent;
  border: 1px solid rgba(45,226,198,0.35); border-radius: 8px; cursor: pointer;
}
.nv-diff-chip.active { color: #04090f; background: var(--nv-accent, #2de2c6); border-color: var(--nv-accent, #2de2c6); }
```

- [ ] **Step 3: 칩 동기화 + 핸들러** — `main.js`에 `syncDifficultyChips`를 추가하고(setDifficulty가 호출), 버튼 핸들러를 등록. `setDifficulty` 정의 다음에:
```js
  function syncDifficultyChips() {
    const sel = difficultyValue();
    for (const d of NV_DIFFICULTIES) {
      const el = $('diff-' + d);
      if (el) el.classList.toggle('active', d === sel);
    }
  }
```
그리고 버튼 핸들러 등록부(다른 `$('btn-...').addEventListener` 근처, 예: `$('btn-free').addEventListener(...)` 다음)에:
```js
  for (const d of NV_DIFFICULTIES) {
    $('diff-' + d).addEventListener('click', () => setDifficulty(d));
  }
```
그리고 `enter()`에서 `renderMenuStats();` 호출 다음에 `syncDifficultyChips();`를 추가(메뉴 진입 시 현재 난이도 강조).

- [ ] **Step 4: 정적 핀 추가** — `test/unit/static.test.mjs` 끝에:
```js
test('menu has a difficulty selector wired to setDifficulty', () => {
  const html = read('index.html');
  assert.ok(html.includes('neonvortex-menu-difficulty'), 'selector markup present');
  const src = read(`${NV}/main.js`);
  assert.ok(src.includes('syncDifficultyChips'), 'chips synced to active difficulty');
});
```

- [ ] **Step 5: 전체 통과** — `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 6: 커밋**
```bash
git add index.html css/neonvortex.css js/games/neonvortex/main.js test/unit/static.test.mjs
git commit -m "feat: 메뉴 EASY/NORMAL/HARD 난이도 셀렉터"
```

---

### Task 5: 검증

- [ ] **Step 1: 수동 스크린샷 검증** — `http://localhost:3000`: 메뉴에서 난이도 칩 선택 → 헤드라인이 `<DIFF> BEST`로 갱신, 새로고침 후에도 선택 유지(영속), FREE PLAY가 선택 난이도로 시작(Hard에서 적 밀도/속도↑ 체감), START DAILY는 항상 Normal. 난이도별 베스트가 따로 쌓이는지.
- [ ] **Step 2: `/build-standalone`** (사용자 실행) — standalone 재생성 + 해시 동기화 검사 통과.

---

## Self-Review

**Spec coverage:** 난이도 영속(`nvDifficulty`) → Task3. 프리플레이 난이도 시작 → Task3(reallyStart). 데일리 Normal → Phase1 엔진 + Task3(daily ignores). 난이도별 베스트(`best_<diff>`) → Task1+Task3. 마이그레이션 → Task1. 헤드라인 선택 난이도 반영 → Task3. 메뉴 셀렉터 UI → Task4. res.difficulty → Task2. ✓

**Placeholder scan:** 모든 스텝 실제 코드. Task3 Step8은 grep 기반 조건부 정리지만 구체 치환 규칙(표시 전용 → `recs.bestByDiff.normal`)을 명시. ✓

**Type consistency:** `difficultyValue()` 반환('easy'|'normal'|'hard') ↔ `G.start(mode, diff)` ↔ `saveBestFor(diff, rec)` ↔ `recs.bestByDiff[diff]` 키 일치. `res.difficulty`(Task2) ↔ onGameOver `runDiff`(Task3) 일치. `syncDifficultyChips`/`NV_DIFFICULTIES`/`setDifficulty` 식별자 Task3↔Task4 일치. store `best_<diff>` 키 ↔ `loadBests` 일치. ✓
