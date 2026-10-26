# TASK-26 — Control 게임 스타일 HUD 폴리싱

상태: **Claude 설계·구현 (2026-10-26).** 사용자 지시로 UI/UX·연출은 Claude가 조사·설계·구현·검증한다.

## 1. 방향: "Forge Command HUD"

WorkForge는 AI가 이 PC에서 손을 쓰게 하는 관제 장치다. 그래서 장식용 게임 화면이 아니라 **기체 관제 콘솔**(메카·RTS의 전술 HUD) 문법을 쓴다. 이유:

- 기존 정체성(검정 + 용광로 주황)을 그대로 키울 수 있다. "Forge"의 녹은 금속 주황을 주 신호색으로, 강철 회색을 바탕으로.
- HUD 문법(모서리를 깎은 패널, 코너 브래킷, 분할 게이지, 모노스페이스 판독값)은 **상태를 더 빨리 읽게** 한다. 화려함이 아니라 판독성이 목적이다.
- 게임/캐릭터 IP, 외부 폰트·이미지 자산을 쓰지 않는다(라이선스 경계). 모든 장식은 CSS로 그린다.

기억에 남을 한 가지: **"SYSTEMS 3/4" 분할 게이지와 회전하는 리액터 코어**. 터널이 준비되면 코어가 천천히 돌고, 문제가 생기면 멈추고 붉게 맥동한다.

## 2. 상태 정직성 (과장 금지)

| 데이터 | 표현 | 금지 |
| --- | --- | --- |
| 터널 상태 | 리액터 코어 색·회전, 칩 | 터널 상태로 작업 성공·MCP 모드 추정 |
| SYSTEMS 게이지 | Doctor 체크리스트 4항목(프로필·프로세스·Supervisor·MCP 준비)과 **같은 판정**을 세그먼트로 | 임의 점수·경험치 |
| 작업 체크포인트 | 퀘스트 카드, 배지 문구 "보고됨 · …", 점선 레일 | 완료 체크 아이콘, "성공" 표현 |
| 실행 기록 | 미션 로그. `ownership_lost`는 사선 무늬 + "종료 기록 없음(진행 중이거나 비정상 종료)" | running 표시, 회전 스피너 |
| MCP 모드 | "확인 불가" 고정(증거 API I-38 전까지) | Control env로 추정 |

업적·레벨·연속 기록 같은 가짜 진행도는 넣지 않는다.

## 3. 시각 시스템

- **글꼴**: 외부 폰트 금지(CSP·라이선스). 시스템 폰트로 성격을 낸다.
  - 표시(제목·판독값): `Bahnschrift`(Windows 내장 DIN 계열, 가변 폭) → `DIN Alternate`(macOS) → `Arial Narrow` 계열, 좁은 폭(`font-stretch`).
  - 판독·ID: `Cascadia Mono` → `SF Mono` → `Consolas`.
  - 본문: `Segoe UI Variable Text` → `-apple-system`. CJK 대체 글꼴을 명시(`Malgun Gothic`, `Apple SD Gothic Neo`, `Yu Gothic UI`, `Microsoft YaHei UI`, `PingFang SC`).
- **색 토큰**: 강철 바탕 `#08090b`/`#111318`, 패널 `#14161b`, 선 `rgba(255,170,90,.14)`, 용광로 주황 `#ff7a18`·`#ffb347`, 상태 녹/황/적은 기존 값 유지(대비 4.5:1 이상).
- **형태**: `clip-path`로 모서리를 깎은 패널, `::before/::after` 코너 브래킷, 아주 옅은 정적 그리드 + 스캔라인 배경(애니메이션 없음).
- **버튼**: 키캡처럼 아래쪽 2px 깊이 → 누르면 내려감. 주 버튼은 용광로 그라데이션.
- 위험 구역: 해저드 스트라이프 테두리.

## 4. 화면 구조

```
[커맨드 바: 로고 · 제목 · 프로필 · 연결 칩 · 언어 · 닫기]
[리액터 패널: 코어 + 상태 제목 + SYSTEMS 게이지 + 4 판독값 + 버튼]  [Doctor: 진단 체크리스트]
[QUEST LOG: 작업 체크포인트(퀘스트 카드) | 미션 로그(실행 기록)]
[이벤트 피드(활동)]  [필드 가이드(범례 + 단축키)]
[업데이트: 단계 트랙]
[위험 구역]
[상태 줄 푸터]
```

DOM id·data-i18n 키·버튼 동작은 유지한다(기존 테스트와 보안 불변 조건이 문자열·id에 의존).

## 5. 연출과 모션

| 연출 | 트리거 | 구현 | reduced-motion |
| --- | --- | --- | --- |
| 부팅 시퀀스 | 첫 로드 | 패널이 아래에서 순차 등장(`nth-child` 지연, 1회, 420ms) | 즉시 표시 |
| 리액터 회전 | 터널 준비(online) | conic 링 `transform: rotate` 14초 1회전 | 정지 |
| 경보 맥동 | attention/offline | 코어 glow 2.4초 맥동 | 정지, 색만 |
| 상태 전환 플래시 | 상태 종류가 바뀔 때 1회 | 리액터 패널 테두리 0.6초 하이라이트 | 없음 |
| 버튼 눌림 | 클릭 | 2px 하강 | 없음(색만) |
| 토스트 | 알림 | 오른쪽에서 슬라이드 | 즉시 |

애니메이션은 `transform`·`opacity`만, JS 애니메이션 루프 없음. 숨겨진 탭에서는 브라우저가 CSS 애니메이션을 멈춘다.

## 6. 단축키 (마이크로 인터랙션)

- `Alt+Shift+S` 터널 시작, `Alt+Shift+X` 정지, `Alt+Shift+R` 새로고침, `Alt+Shift+D` Doctor.
- 수정자 키를 쓰므로 WCAG 2.1.4(단일 문자 단축키) 문제가 없다. 브라우저 기본 단축키(Alt+D 주소창 등)와 겹치지 않게 Shift를 함께 쓴다.
- 입력 칸·dialog 안·비활성 버튼일 때는 무시. 실행은 해당 버튼 `click()`으로 기존 경로를 그대로 탄다.
- `Alt+Shift`를 누르고 있는 동안 버튼 위에 키 힌트 칩 표시(게임의 키 프롬프트). 버튼에 `aria-keyshortcuts`.

## 7. 접근성·언어·반응형

- 4개 언어 키 집합 동일. 새 키: `hud.systems`, `hud.systemsValue`, `hud.hotkeysTitle`, `hud.hotkey.*`, `work.state.*`(배지).
- 게이지 세그먼트는 `aria-hidden`, 의미는 옆 텍스트(`3/4 정상`)로 전달.
- 상태는 색만으로 표현하지 않는다(문구·무늬 병행). 포커스 링은 모든 상호작용 요소에 2px 주황 + offset.
- `forced-colors: active`에서는 clip-path·장식 pseudo-element를 끄고 시스템 색 테두리로 대체.
- 좁은 화면(≤560px): 한 열, 커맨드 바 줄바꿈, 게이지 전체 폭, 퀘스트 로그 한 열. 390px에서 가로 스크롤 없음.

## 8. 성능 예산

- 새 이미지·폰트·라이브러리 0. CSS 증가 ≤ 12KB, JS 증가 ≤ 4KB.
- `backdrop-filter` 제거(패널 다수에 blur는 비용이 크다). 고정 배경은 정적 gradient.
- 상시 애니메이션은 리액터 회전 1개(transform).

## 9. 변경 파일

- `control-ui/style.css` 전면 재작성(셀렉터·id 계약 유지).
- `control-ui/index.html`: 리액터 링·SYSTEMS 게이지·단축키 안내 마크업 추가, 기존 id 유지.
- `control-ui/app.js`: 게이지 렌더, 상태 전환 플래시, 단축키, 작업 카드 상태 class, 새 번역 키(4개 언어).
- `scripts/test-control-dashboard.mjs`: UI 렌더 블록에 퀘스트 카드 상태 class·정직성 문구 검사 추가.

## 10. 검증 시나리오

1. `npm run test:control-dashboard`, `npm run test:security-invariants`(app.js 필수 문자열), `npm run test:control-ux`.
2. 실제 브라우저(Chrome) 데스크톱 1440px·모바일 390px: 4개 언어 전환, 상태별(정지·준비·주의·조회 실패) 화면, 작업 패널(빈 목록·stale·부분), 단축키·포커스 이동, reduced-motion 에뮬레이션. 스크린샷을 직접 확인한다(DOM 검사만으로 완료 주장 금지).
3. 실제 설치 Control·터널은 시작하지 않는다. 테스트용 control-server를 임시 프로필로 띄워 확인 후 종료.

## 11. 구현 기록

2026-10-26 Claude 구현 완료.

- `control-ui/style.css` 재작성: 강철·용광로 토큰, 시스템 폰트 스택(Bahnschrift/Cascadia Mono), 상단 오른쪽 모서리를 깎은 패널 + 코너 브래킷, 정적 그리드·스캔라인 배경, 키캡 버튼, 리액터 링, SYSTEMS 게이지, 퀘스트·미션 카드 레일, 해저드 스트라이프, 부팅 시퀀스, `prefers-reduced-motion`·`forced-colors` 대응. `backdrop-filter` 제거.
- CJK 대체 글꼴은 `:root:lang()`으로 언어별 선택(일본어 가나가 한국어 글꼴 메트릭을 빌려 자간이 벌어지던 문제를 실제 스크린샷에서 발견해 수정). CJK에서는 넓은 자간을 줄인다(`--track-wide`).
- `control-ui/index.html`: `#tunnelPanel`, 리액터 래퍼, `#systemsMeter`, 단축키 `aria-keyshortcuts`/`data-hotkey`, 필드 가이드의 단축키 목록. 기존 id·data-i18n 유지.
- `control-ui/app.js`: `setHeroKind`(상태 종류가 바뀔 때만 1회 플래시), `renderSystems`(Doctor 체크리스트와 같은 판정), 작업 카드 상태 class(`quest-*`, `mission-*`, ownership_lost → `mission-unsealed`), Alt+Shift 단축키(입력 칸·dialog·비활성 버튼 무시, `event.code`로 IME·자판 배열 무관), 새 번역 키 8개 × 4개 언어. 파일은 LF 유지.
- `scripts/test-control-dashboard.mjs` UI 블록: unsealed가 running/completed 스타일을 쓰지 않음, 보고 완료 라벨 유지, 4개 단축키 aria 노출, 단축키의 입력 칸·dialog 차단 코드, reduced-motion에서 애니메이션 제거.
- README en/ko Control 절에 HUD 정직성 규칙·단축키 한 문단.

검증
- `npm run test:control-dashboard`(CONTROL_DASHBOARD_TEST_OK), `npm run test:security-invariants`(app.js 필수 문자열 유지), `npm run test:control-ux` 통과. `git diff --check` 통과.
- 실제 Chrome(headless, CDP)로 임시 fixture 프로필 Control 서버를 띄워 확인: 1440px ko 정지/en 준비/ja 주의/zh 단축키 프롬프트, 390px ko 준비/en 조회 실패. 모든 폭에서 `scrollWidth == innerWidth`(가로 넘침 없음). reduced-motion 에뮬레이션에서 실행 중 애니메이션 0개. 스크린샷을 직접 확인했다.
- 실제 키 이벤트(CDP `Input.dispatchKeyEvent`)로 단축키 확인: Alt+Shift 누르는 동안만 프롬프트 표시, R·D 실행, 실행 중일 때 비활성 Start는 미실행, dialog 입력 중 X 미실행(`HUD_HOTKEYS_OK`). 실제 터널 동작은 클릭 함수를 계수기로 바꿔 실행하지 않았다.
- 실제 설치 Control·터널은 시작하지 않았다. 임시 서버·fixture·Chrome 프로필은 검증 후 삭제.

미검증·한계
- Claude in Chrome 확장 도구는 이 세션에서 탭 그룹이 계속 바뀌어(여러 Claude 세션이 같은 확장을 공유하는 것으로 보임) 첫 스크린샷 1장 이후 사용 불가 → headless Chrome CDP로 대체. 실제 화면 배율·GPU 합성 차이는 미검증.
- macOS(DIN Alternate 대체 글꼴)·Windows 고대비 모드는 실기 미확인. Firefox 120 이하에서는 `:has()` 미지원으로 리액터 링이 회색으로 남는다(상태는 코어 색·문구로 계속 표시).
- 스크린리더 실기(NVDA/VoiceOver) 낭독은 미확인. 구조상 목록은 live region이 아니고 상태줄만 polite.
- I-20 모드 배지는 아래 절에서 구현 완료.

### 작업 카드 담당자 칩 (I-35 UI, 2026-10-26 사용자 요청)

- `/api/work`의 task 항목 `claim: { owner, expiresAt, expired } | null`을 카드 맨 끝에 칩으로 표시한다(기존 자식 순서·테스트 계약 유지). 담당 중이면 청록 점선 "담당 {owner} · {시각}까지", 만료면 흐린 점선 "{owner} 담당 만료". 만료는 서버의 `expired`와 클라이언트 현재 시각 중 하나라도 해당하면 만료로 본다(캐시된 응답이 만료를 늦게 반영하는 것 방지).
- claim은 advisory다. 점선으로 표시하고 `title`에 "체크포인트를 잠그지 않는다"를 안내해 잠금처럼 보이지 않게 했다. owner는 `textContent`로만 표시.
- 좁은 화면(≤560px)에서는 카드 제목을 한 줄 전체로 두고 버튼을 아래로 내려 제목이 좁아지지 않게 했다.
- 테스트: 담당 칩이 리터럴 텍스트이고 잠금을 암시하지 않음, 보고 상태 라벨 위치 유지, 지난 expiresAt은 expired=false여도 만료로 표시, 미담당 카드는 칩 없음(`CONTROL_DASHBOARD_TEST_OK`).
- 실제 Chrome에서 1440px ko와 390px en 스크린샷 확인(실제 `claimTask`로 만든 담당 + 수동 fixture의 만료 claim).

### I-20 MCP 모드 배지 (2026-10-26)

- 커맨드 바에 `#modeChip`. `/api/mode-evidence`를 처음 로드할 때, 작업 기록 polling(30초), 새로고침, 탭 복귀 시 함께 읽는다(in-flight 1개).
- 표시 규칙: `evidence: "log"`이고 toolMode가 정해진 두 값일 때만 모드와 증거 시각을 표시한다(읽기 전용은 cyan, 읽기·쓰기는 주황). `stale`은 **모드 값을 숨기고** "확인 불가 · 이전 기록 {시각}"만 점선 칩으로 보여 준다. none, unsupported, 오류 code, 요청 실패, 예상 밖 값은 모두 "확인 불가". 터널 상태로 모드를 추정하지 않는다. `title`로 판정 기준을 안내.
- `work.mode` 문구를 4개 언어 모두 "배지는 실행 중 세션의 로그 증거가 있을 때만 표시"로 갱신하고 새 키 5개 추가.
- 테스트: stale + read_only가 모드 문구를 노출하지 않음, log는 노출, 예상 밖 toolMode와 null은 확인 불가(`CONTROL_DASHBOARD_TEST_OK`).
- 실제 Chrome: 1440px ko에서 log 상태(시뮬레이션), 390px en에서 stale 상태 스크린샷 확인. 실제 endpoint는 fixture(로그 없음)에서 `evidence: "none"`을 반환했고 배지는 확인 불가를 표시. 현재 production은 검증된 시작 시각이 없어 `log`를 반환하지 않으므로 사용자 화면에서는 stale 또는 확인 불가만 보인다(Codex I-38 기록 참고).

### I-37 체크포인트 상세 dialog (2026-10-26)

- `index.html`: `#taskDialog`(aria-labelledby, `role=status` 상태줄, 본문, 닫기). 위험 동작이 아니므로 위험 구역의 빨간 상단선 대신 주황 상단선.
- `app.js`: 작업 카드에 "상세" 버튼 → `openTaskDetail`이 `/api/work/task?id=`를 읽는다. 늦게 온 응답과 이미 닫힌 dialog는 token으로 버린다. 고정 code는 번역하고, 알 수 없는 code는 generic 문구로 대체(서버 문자열을 그대로 표시하지 않음). 본문은 모두 `textContent`. 근거는 완료·실패·취소, 종료 기록 없음, 조회 불가로 구분. claim은 null이 아니면 표시(10단계 후 대비). 언어를 바꾸면 열린 dialog를 다시 렌더링. 닫으면 연 버튼으로 포커스를 되돌리고, 버튼이 다시 만들어졌으면 목록 제목으로. 단축키는 열린 dialog가 있으면 무시(`dialog[open]`). 새 키 30개 × 4개 언어.
- `test-control-dashboard.mjs`: 상세 렌더러를 vm으로 실행해 HTML 리터럴, 보고 상태 문구, unsealed·unavailable 근거, 오류 code 번역과 알 수 없는 code의 대체를 검사.
- 검증: `CONTROL_DASHBOARD_TEST_OK`. 실제 Chrome(CDP)에서 실제 마우스 클릭으로 열기, 섹션 7개, 가로 넘침 없음, Esc로 닫기, 포커스 복귀를 1440px(ko)와 390px(en)에서 확인. not_found 오류와 열린 상태에서 일본어 전환도 확인. 스크린샷을 직접 확인했다.
