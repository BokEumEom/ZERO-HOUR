# ADR-0001: 듀얼 HTML — index.html 소스 + 생성형 standalone.html

- **상태**: 적용됨 (2026-06-11)
- **관련**: commit `92cb992`, `e00d382`

## Context

게임은 빌드 도구 없는 순수 HTML/JS이지만 두 가지 배포 형태가 필요하다:
모듈 분리된 개발/배포용 진입점과, 파일 하나로 어디서나 실행되는 단일 파일 버전.
두 파일을 손으로 동기화하면 반드시 어긋난다.

## Decision

- `index.html` + `js/` + `css/` 가 **유일한 소스**. `standalone.html`은 **생성 산출물**.
- 생성은 `node .claude/skills/build-standalone/build.mjs` — 로컬 `<script src>`·`<link rel="stylesheet">`와
  CDN 라이브러리(React/ReactDOM/Babel)를 인라인. Google Fonts 링크는 외부 유지(폰트 바이너리는 어차피 별도 요청).
- 3중 가드:
  1. PreToolUse 훅이 standalone.html 직접 수정을 **차단**
  2. PostToolUse 훅이 소스(`js/`, `css/`, `index.html`) 변경 시 stale **리마인드**
  3. `test/run-all.ps1`이 fresh build를 temp에 만들어 **해시 비교** (커밋 독립적 동기화 검사)

## Consequences

- (+) 단일 출처 보장, 재현 가능한 번들, 동기화 누락이 테스트로 잡힘
- (+) 인라인 시 `</script>` 이스케이프·`$&` 치환 패턴 등 함정을 빌드 스크립트 한 곳에서만 처리
- (−) CDN 핀 버전 변경 시 번들 해시가 바뀌므로 재빌드 필요 (의도된 동작)
- (참고) 원본 standalone은 gzip+base64 `__bundler` 포맷이었으나 평문 인라인으로 대체 — 기능 동일, 디버깅 용이
