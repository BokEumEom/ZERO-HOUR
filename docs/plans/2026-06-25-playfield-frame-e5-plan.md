# 플레이필드 콕핏 프레임 (E5) — 설계 + 계획

> 아틀라스 섹션 5(ENVIRONMENT/MODULAR)의 프레임 브래킷을 캔버스 플레이필드
> 테두리로 자연 흡수. **순수 코스메틱** — 게임플레이·점수·RNG 무관.
> 이 문서는 기계적 구현용. 브랜치 `feat/playfield-frame`.

**확정 rect:** frameCorner (454,511,54,54) — 둥근 L-코너 브래킷(네온 액센트).

**불변식:** 코스메틱 전용 → 새 Math.random/Date.now 0개(베이스라인 14 유지), `s.rng`
미사용, 데일리 공정성 무관. 60fps 무할당(4 drawImage + strokeRect 1회). 점수표 무관.

**왜 코너 브래킷 + 얇은 엣지인가:** 섹션 5 프레임은 hollow 분절 line-art라 9-slice로
960px 엣지를 늘리면 액센트가 번짐. 코너 4개(회전)는 crisp + 무시늘림. 엣지는 캔버스
strokeRect(낮은 alpha)로 보완 → 완결된 프레임 느낌, 가독성 무해.

---

## Task 1: frameCorner rect + drawPlayfieldFrame

**sprites.js** A{} (eliteCore 줄 뒤):
```javascript
    frameCorner: { x: 454, y: 511, w: 54,  h: 54  }, // cockpit/targeting frame corner bracket (section 5)
```

**render.js** — drawElite 근처(또는 render() 위)에 헬퍼 추가:
```javascript
  // playfield cockpit frame — section-5 bracket art at the 4 corners (rotated),
  // joined by faint edge lines. Cosmetic only; deterministic (no rng).
  function drawPlayfieldFrame(ctx) {
    const m = 30;            // corner inset
    const sz = 56;           // bracket sprite size (longest edge)
    ctx.save();
    // faint connecting edges
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#5ad1ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    // corner brackets (top-left art rotated into each corner)
    ctx.globalAlpha = 0.55;
    const HALF = Math.PI / 2;
    if (!SP.draw(ctx, 'frameCorner', m, m, sz, 0)) { ctx.restore(); return; }
    SP.draw(ctx, 'frameCorner', W - m, m, sz, HALF);
    SP.draw(ctx, 'frameCorner', W - m, H - m, sz, Math.PI);
    SP.draw(ctx, 'frameCorner', m, H - m, sz, -HALF);
    ctx.restore();
  }
```
(첫 `SP.draw`가 false면 시트 미디코드 → 프레임 생략(엣지선만 남아도 무해하지만
일관성 위해 코너 실패 시 그대로 종료). globalAlpha는 save/restore로 복원.)

**render.js render()** — floats 루프 직후, surge-warn 블록 직전에 패스 추가:
```javascript
    drawPlayfieldFrame(ctx);
```
(엔티티·파티클·floats 위 = 콕핏 오버레이, 단 surge/boss/ready 대형 경보는 그 위에 유지.)

---

## Task 2: 테스트 핀

**test/unit/static.test.mjs** (elite 핀 근처):
```javascript
test('playfield cockpit frame (E5) is wired, cosmetic-only', () => {
  const render = read(`${NV}/render.js`);
  assert.ok(/drawPlayfieldFrame/.test(render), 'frame draw routine + pass');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/frameCorner:\s*\{/.test(spr), 'frameCorner rect');
  // cosmetic: the frame must not introduce gameplay randomness
  const frameFn = render.slice(render.indexOf('function drawPlayfieldFrame'));
  assert.ok(!/Math\.random|s\.rng/.test(frameFn.slice(0, frameFn.indexOf('}\n  function') + 1)),
    'frame is deterministic (no rng)');
});
```
(Math.random 베이스라인 14 핀은 game.js 대상이라 영향 없음 — render.js는 별도.)

---

## 완료 후
- `node --test 'test/unit/*.mjs'` 3x 안정. performance-analyzer(drawPlayfieldFrame 무할당).
  rng-fairness는 코스메틱이라 불필요하나, 베이스라인 14 확인.
- 사용자: /build-standalone + 모바일 검증(프레임 가독성). 다음: E4b 또는 E6.

## Self-Review
- 커버리지: rect(T1) + 렌더 헬퍼·패스(T1) + 정적 핀·코스메틱 단언(T2).
- 일관성: frameCorner rect, drawPlayfieldFrame이 sprites/render/test에서 일치.
- 공정성: 코스메틱 전용, s.rng/Math.random 미사용, 위치 결정론적 → 데일리 무관.
- 성능: 4 drawImage + strokeRect 1회, 루프/할당 없음.
