# TASK-25 — Control의 작업·실행 기록 패널

상태: **Claude REVISE 수신 및 아래 최종 v2 구현·소스 검증 완료.**

## 목적과 디자인

사용자가 Control에서 최근에 무엇을 작업했고 어떤 실행 기록이 남았는지 확인한다. 터널 연결 상태와 작업의 성공 여부를 섞지 않는다.
frontend-design 스킬을 적용하되 기존 검정/주황 Control의 산업용 제어판 톤과 spacing/type/badge를 재사용한다. 화면 전체를 다시 디자인하지 않는다.
기존 상태 영역 뒤·Control 활동 로그 앞에 하나의 넓은 패널을 넣고, 작업 체크포인트와 실행 기록을 두 열로 배치한다. 좁은 화면에서는 한 열. 각 목록은 최대5개, 긴 제목·경로는 줄바꿈한다.

## 데이터와 권한

- 기존 로컬 HTTP/session/Host 검증을 통과한 `GET /api/work`만 추가한다. 쓰기·실행·삭제·replay 버튼 없음.
- Control 서버에서 해당 엔진의 dist/profile, dist/shell, dist/tasks, dist/redaction을 import해 검증된 현재 프로필 context로 listShellJobs/listTasks를 재사용한다. 새로운 MCP 서버를 만들거나 터널 연결을 추가하지 않는다.
- Windows는 기존 Launch-Control의 WORKFORGE_MCP_PROFILE_REGISTRY 경로를 사용한다. macOS는 기존 loadInstallation의 검증된 registryPath를 사용한다. 임의 UI 경로 입력을 받지 않는다.
- 별도 프로세스이므로 살아있는 MCP jobs map에 접근할 수 없다. started-only는 ownership_lost 그대로이며 '실행 중일 수 있음 / 상태 확인 불가'로 표시한다. PID로 실행·성공을 추정하지 않는다.
- task reportedStatus는 '보고된 상태'로 명확히 표시한다. completed를 테스트 통과나 작업 성공으로 단정하지 않는다.
- 목록에는 taskId/title/reportedStatus/savedAt, shell id/cwd/status/trackingState/exitCode/createdAt/updatedAt/출력 바이트만 제공한다. 명령·출력·checkpoint objective/plan 본문은 보내지 않는다.
- 서버가 redactor로 모든 응답 문자열을 처리한다. Control은 connector key 삭제 전에 bounded snapshot을 만들고 기존 삭제 동작 유지. 오류는 고정 unavailable 코드로 응답하여 원문 파일 내용 노출 방지.

## 캐시와 실패

- 최대5개 각 목록, underlying scan은 기존 최대20,000개/후보10개. 5초 캐시와 in-flight promise로 중복 스캔 방지. AbortController로 최대5초 조회 예산, 후보 검사 사이 취소.
- 응답은 available, observedAt, tasks, jobs, partial, diagnosticCount, toolMode:'unknown'. partial은 truncation/scan cap/개별 오류가 있음을 뜻한다. 오류 원문 목록은 UI로 보내지 않는다.
- 모드 증거가 없으므로 Control 환경을 보고 MCP read-only라고 표시하지 않는다. 실제 모드는 ChatGPT의 workstation_context.toolMode에서 확인하라는 안내만 둔다.
- missing/old engine/invalid registry/timeout은 패널 내 '작업 기록을 조회할 수 없음'. 터널 시작·중지 및 기존 status UI는 계속 동작한다. 없는 archive는 정상 빈 상태.
- UI는 기존 status refresh와 별도로 refreshWork를 호출하여 status 실패가 기록 조회까지 막지 않게 한다. 화면 숨김/작업 중 polling 조건은 기존 패턴 재사용. 중복 fetch 방지.
- 로딩/빈 목록/조회 실패/일부 기록만 표시/이전 결과 stale 상태를 구분한다. 갱신 실패 시 지난 목록을 최신처럼 보이지 않게 명시한다.

## 접근성과 언어

- en/ko/ja/zh 네 사전의 동일 키 집합 유지, 기존 language switch 시 목록도 다시 렌더한다.
- textContent/createElement 사용, archive 제목/경로를 HTML로 삽입하지 않음. 상태는 색뿐 아니라 번역 문자열로 표시.
- 목록 영역 aria-live=polite, 짧은 상태 메시지와 time element. 기존 Refresh 버튼이 두 데이터 영역을 함께 갱신한다.
- 불필요한 애니메이션·외부 폰트·새 프레임워크 없음.

## 영향 범위와 검증

- scripts/control-server.mjs: authenticated endpoint, bounded import/query/cache/redaction, 기존 control security gate 유지.
- control-ui/index.html/app.js/style.css: 패널·두 목록·상태 표시·번역·갱신.
- scripts/test-control-dashboard.mjs: auth 없는 /api/work 거부, missing profile fixed failure, 네 언어 키, 렌더링 fixture의 HTML injection 방지.
- 격리 임시 프로필/fixture 기록으로 endpoint 성공, completed report vs ownership_lost, empty/partial, credential 제목 마스킹, 기존 터널 동작 미호출 검증.
- 로컬 브라우저에서 desktop/mobile과 한국어 UI 확인. 실제 설치 Control/터널을 변경하거나 시작하지 않는다.
- README en/ko와 ARCHITECTURE 설명. 소스 빌드/전체 테스트/Control 테스트 후 정리.

## 검수 요청

신뢰할 수 없는 live ownership/모드 표시, 캐시·실패 상태, 기존 UI 폴링·다국어 영향, 원문 비밀/스크립트 삽입, 과도한 조회 I/O를 중점 검수한다. taskId 복사, 상세 checkpoint 열기, 실제 모드 attestation, 실시간 heartbeat는 필요성/비용을 평가해 채택·보류를 결정한다.

## 검수·아이디어 결정과 확정 v2

| 의견/아이디어 | 결정 | 반영 |
| --- | --- | --- |
| 조회 실패의 공통500/활동 로그 오염 | 채택 | handler 내부 고정 code, HTTP200 ok:true/available:false, 활동 로그 기록 안 함 |
| lazy import, update/uninstall busy | 채택 | import promise 캐시/실패 재시도; busy에서는 조회 시작하지 않음 |
| 5초 조회 반복 I/O | 채택 | work polling30초/cache20초, 명시적 Refresh force; 조회 예산5초 유지 |
| 전체목록 aria-live 및 재렌더 | 채택 | 상태줄만 polite, data가 같으면 목록 DOM 유지, 언어 변경은 재렌더 |
| ownership_lost 표현 | 채택 | 종료 기록 없음(진행 중이거나 비정상 종료), 터널상태에서 추정 안 함 |
| taskId/재개 문구 복사 | 채택 | 사용자 클릭 시 clipboard, task_resume의 명시적 ID 선택을 도움 |
| cwd의 사용자 경로 치환 | 채택 | 기존 sanitizeText 정책 재사용 |
| Control env snapshot | 보류 | dist lazy import와 기존 key 삭제 유지. 새 endpoint는 패턴 redactor 적용; 명령/로그 본문 미노출 |
| checkpoint 상세보기 | 보류 | 첫 화면은 요약과 재개 ID 제공 |
| tunnel 로그 모드 증거 | 보류 | 실제 stderr 전달/시각 확인 전 unknown 유지 |
| 모드 파일/heartbeat | 거절 | 읽기 전용 디스크 미생성 계약과 충돌·불필요한 생명주기 비용 |

v1의5초 polling/cache 및 전체목록 aria-live는 위 결정으로 대체한다. 빈/불가/partial/stale를 구분하고 캐시 만료와 force에도 in-flight는 공유한다. Control이 오래된 dist 때문에 시작 실패하지 않도록 새 기능 module import는 요청 안에서만 한다. Windows direct Control에서 registry env가 없으면 registry_invalid로 표시하고 추측한 경로를 사용하지 않는다. macOS는 기존 loadInstallation 사용.

## 구현·검증 결과

인증된 /api/work, lazy import/cache/busy/fixed failure, summary masking, 두 목록·재개 문구 복사·4개 언어·stale 표시를 구현했다. 모든 archive 내용은 textContent로 삽입한다. 기존 Refresh와 새30초 poll은 별개이며 종료/업데이트 시 함께 정리한다.
Control dashboard 테스트에서 인증401, missing profile200/availablefalse, 격리 registry에서 task/shell summary와 unknown mode, 비밀 prefix 마스킹, objective/command 미노출, DOM injection/stale/동일 데이터 재사용을 검증했다. security/privacy invariants와 control UX 통과. 한국어 Chrome desktop/mobile390px에서 패널과 copy toast, 단일열과 가로 넘침 없음을 확인했다. 모바일 viewport 변경 직후 캡처에 compositor artifact가 있었고 reload 후 실제 화면을 다시 검증했다.
실제 설치 Control/터널은 변경하거나 시작하지 않았다. macOS는 static/setup 테스트만 수행했고 실기 화면은 미검증이다.
