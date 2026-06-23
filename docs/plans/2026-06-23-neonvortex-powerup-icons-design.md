# 설계 — 파워업 픽업 아이콘 (아틀라스 섹션 1 반영)

**날짜**: 2026-06-23
**상태**: 설계 승인 (구현 계획 대기)
**범위**: 코스메틱. 파워업 7종의 픽업 비주얼을 동일한 앰버 캡슐+글자에서
`sprite-atlas.png` 섹션 1("POWER-UPS / PICKUPS")의 **종류별 전용 배지**로 교체.

## 1. 배경

현재 `render.drawPow`는 모든 파워업을 같은 `crystalAmber` 캡슐 + 색 글리프
(M/S/T/×2/»/Ψ/+5)로 그린다. 아틀라스 섹션 1에 종류별 배지(시안 행, x≈18~700,
y≈16~110)가 있어 파워업마다 구분된 픽업 아이콘을 줄 수 있다. 이것이 아틀라스에서
"기존 메커니즘에 그대로 맞는" 유일한 미사용 섹션이다(적/월드오브젝트/콘솔 등은 대응
메커니즘 부재 → 범위 외).

## 2. 불변식

- 순수 코스메틱: `game.js`·`POWER_META`·스폰·시드 RNG·점수·히트박스 **무변경**.
- 60fps 핫패스 프레임당 할당 0(틴트 배지는 `type:color`별 1회 캐시 후 blit).
- 스프라이트 미디코드/실패 시 **현 캡슐+글리프 폴백 유지**.

## 3. 매핑 (파워업 → 배지 슬롯)

배지 행 10슬롯: `0:+ 1:실드 2:번개 3:U자석 4:>> 5:✸버스트 6:폭탄 7:궤도구 8:패널 9:1UP`.
게임 사용 7종(rect는 슬롯별 단독 bbox 스캔, 구현 시 ±2px 시각 검증):

| 파워업 | 배지 | rect `{x,y,w,h}` | 글리프 유지 |
|---|---|---|---|
| MAGNET | U자석 | `{228, 23, 66, 87}` | — |
| SHIELD | 실드 | `{88, 16, 66, 94}` | — |
| BOOST | 번개 | `{158, 16, 66, 94}` | — |
| SPREAD | `>>` | `{298, 23, 66, 87}` | — |
| X2 | ✸버스트 | `{369, 23, 66, 87}` | `×2` |
| SLOW | 궤도구 | `{509, 24, 66, 86}` | `T` |
| TIME | `+` | `{19, 16, 65, 94}` | `+5` |

명확한 4종(MAGNET/SHIELD/BOOST/SPREAD)은 아이콘만, 모호한 3종(X2/SLOW/TIME)은
작은 글리프를 유지해 명료성을 보장한다. 미사용 슬롯(폭탄·패널·1UP)은 대응 메커니즘
없음 → 미반영.

## 4. 색 처리

배지는 시안 한 색뿐이므로, 각 배지를 `POWER_META[type].color`로 **틴트**해 종류별
색 코딩을 유지한다(HUD·플로팅 텍스트와 일치). 틴트는 ship 도색과 같은 오프스크린
캐시 기법이되, **단일 source-atop 패스(알파 ~0.55)** 만 사용해(멀티플라이 셰이드 생략)
작은 아이콘이 뭉개지지 않게 한다. 캐시 키 `type:color`, 최초 1회 빌드.

**검증 게이트**: 게임 크기에서 틴트가 탁하면 무틴트(네이티브 시안 배지 + 색 글리프)로
폴백 — 구현 후 스크린샷에서 판단.

## 5. 컴포넌트 변경

### `sprites.js`
- `POWER_ICONS` rect 맵(파워업 타입 키, 위 표) 추가.
- `powerIconCanvas(type, color)`: `POWER_ICONS[type]`을 `color`로 틴트한 오프스크린
  캔버스를 `iconCache[type+':'+color]`에 1회 빌드/반환. 미디코드 시 null.
- `drawPowerIcon(ctx, type, x, y, size, rot, color)`: 디코드 전 false 반환(폴백 신호).
  틴트 캐시 blit, longest-edge `size` 스케일, 선택적 회전. 9-arg/blit 무할당.
- export에 `drawPowerIcon`, `powerIcons: POWER_ICONS` 노출.

### `render.js` — `drawPow`
- `crystalAmber` 캡슐 블릿을 `SP.drawPowerIcon(ctx, o.type, o.x, o.y+bob, size, rot, meta.color)`
  로 교체. false면 **현 캡슐+벡터 폴백 그대로**.
- 글리프 오버레이는 **X2/SLOW/TIME에만** 표시(명확 4종은 생략). 깜빡임(blink) 로직 유지.

### 테스트
- 단위(`node --test`): `POWER_ICONS`에 7종 모두 존재 + rect 형태, `drawPowerIcon`은
  함수이고 미디코드 샌드박스에서 false 반환(순수 가드).
- 정적 핀: `render.js`가 `drawPowerIcon` 사용 + 글리프가 조건부(X2/SLOW/TIME).
- perf: `performance-analyzer`로 drawPow 핫패스 무할당 확인.

## 6. 데이터 흐름

```
game.js (무변경) ─ s.pows[].type ─► render.drawPow
                                      │
SP.drawPowerIcon(type, color) ─► iconCache[type:color] blit (틴트 1회 빌드)
                                  └ 미디코드 → false → 캡슐+글리프 폴백
X2/SLOW/TIME → 작은 글리프 오버레이
```

## 7. 후속

- `design.md` 자산 섹션 갱신(파워업이 섹션1 배지 사용; 슬롯 7개).
- `/build-standalone` 재생성(사용자), 스크린샷 검증(틴트 탁함 여부 포함).

## 8. 대안 (기각/예비)

- **무틴트 시안 배지 + 전종 글리프 유지**: 색 코딩 약해지나 가장 단순·안전. 4의 검증
  게이트가 탁할 때의 폴백.
- 배경/적·월드오브젝트 섹션 반영: 대응 메커니즘 부재(배경은 절차적로 충분) → 범위 외.
