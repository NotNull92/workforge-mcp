# TASK-27 — 추가 아이디어 전수 목록

상태: **최종 (2026-10-26). 모든 항목 구현·대체 완료. 상세 설계는 TASK-28~31, 실행 순서는 HANDOFF-CODEX-TASK-28-31.md, 구현 기록은 각 TASK 문서 끝.**

## 역할과 범위

- 사용자 지시(2026-10-26): 추가 아이디어는 **전부 구현**한다. TASK-18~25 검수에서 보류·거절된 항목도 과거 판단만으로 제외하지 않는다.
- 상충하는 아이디어는 사용자 목적을 만족하는 구현 가능한 대안으로 재설계했다. 기존 보호를 약화시킬 수 있는 선택은 `D-*` 결정 항목으로 드러내고, 결정 전에는 **기본값 비활성(opt-in)** 으로 구현한다.
- 구현 의도는 공개 배포·라이선스·서명·실제 설치/터널/자격 증명 변경의 승인이 아니다.
- 담당: 게임 스타일 Control UI는 Claude(TASK-26). 이 목록의 미구현 항목은 Claude 설계 → Codex 구현. UI가 필요한 항목은 backend를 Codex, `control-ui/*` 변경을 Claude가 맡는다.

상태 표기: `완료`(현 소스에 구현·검증됨) / `대체 완료`(원 아이디어 대신 목적을 충족하는 대안을 구현) / `기본 비활성 D-x`(구현됐지만 켜는 것은 사용자 결정).

## A. 이미 구현된 아이디어 (중복 구현 금지)

| ID | 아이디어 | 출처 | 근거 |
| --- | --- | --- | --- |
| DONE-18-1 | 범위 읽기와 예산 잘림을 구분하는 최상위 `truncated` | TASK-18 M1 | `src/filesystem.ts` readTextFiles |
| DONE-18-2 | `characterLimited` / `nextStartLine` | TASK-18 M2 | `src/filesystem.ts`, `src/server.ts` 출력 스키마 |
| DONE-18-3 | 실제 읽은 바이트 기준 원본 예산, `SOURCE_BUDGET_EXCEEDED`, `source_budget_exhausted` | TASK-18 M3 | `src/filesystem.ts` |
| DONE-18-4 | surrogate 경계 보정, 항목 사이 취소, 오류 code·1,000자 상한, union 스키마 검증, 순서대로 예산 소진 안내, instructions 안내 | TASK-18 m1~m4, I1, I2 | TASK-18 §11 표 |
| DONE-19-1 | 종료 grace·강제 종료·`killConfirmed`, callback 예외 격리, 중단 플래그 우선, chunk 처리 순서 | TASK-19 I1~I4 | `src/process.ts`, `src/filesystem.ts` |
| DONE-19-2 | AbortSignal 전달, exit 2 부분 오류 의미, 결과 비결정성 명시, 긴 JSON 줄 경고, `--no-config`, `--null`, `stoppedBecause`, `elapsedMs` | TASK-19 m1~m4 | `src/filesystem.ts` searchFiles |
| DONE-20-1 | mtime 2단계 후보 선택, 고정 오류 code, `incomplete_start`, ISO 검증, 바이트·취소 필드, cwd lexical 필터 | TASK-20 결정 표 | `src/archive.ts` recentArchiveEntries, `src/shell.ts` listShellJobs |
| DONE-21-1 | 실패 edit 인덱스·원인, normalized needle 범위, 자기 겹침 유일성, UTF-16/UTF-8 예산 구분, `editsApplied` | TASK-21 R1/R2 | `src/filesystem.ts` replaceText |
| DONE-22-1 | 시작 stderr 모드 표시, `toolMode`, 모드별 instructions, `--no-show-signature`/`--no-pager`, read-only 9→11 도구 | TASK-22 v2 | `src/stdio.ts`, `src/server.ts` parseReadOnlyMode, `src/resume.ts` |
| DONE-22-2 | 빈 env 엄격 실패와 허용값 안내 메시지 | TASK-22 (빈 env를 미설정으로 보자는 안은 거절) | `parseReadOnlyMode` 오류 메시지. 목적(혼란 없는 시작 실패)은 메시지로 충족 → I-26 |
| DONE-23-1 | 경로형 env 제외, snapshot 상한·경고, 열린 PEM·경계 조각, `redactionCount`, responseFor closure, URL·고신뢰 prefix | TASK-23 결정 표 | `src/redaction.ts`, `src/server.ts` |
| DONE-24-1 | 예약명 거부, 128KiB 오류, 공용 archive helper, 비밀 저장 거부, `.gitignore`, `task_list` | TASK-24 결정 표 | `src/tasks.ts`, `src/archive.ts` |
| DONE-25-1 | 고정 code 응답, lazy import·busy, 30초 polling·20초 cache, 상태줄 aria-live, ownership_lost 표현, 재개 문구 복사, cwd 경로 치환 | TASK-25 결정 표 | `scripts/control-server.mjs` getWork, `control-ui/app.js` renderWork |

## B. 미구현 아이디어 전수 목록

우선순위: P1(버그·보호 강화·작은 비용) / P2(사용성 핵심) / P3(확장) / P4(위험·대규모, 결정 필요).

| ID | 아이디어 | 원출처·과거 판정 | 상태 | 우선 | 선행 | 설계 문서 | 담당 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I-01 | 조건부 읽기 `ifSha256Differs` | TASK-18 I3 보류 | 완료 | P2 | — | TASK-28 | Codex |
| I-02 | 배치 안 같은 파일 원본 재사용 | TASK-18 I4 보류 | 완료 | P3 | — | TASK-28 | Codex |
| I-03 | 부분 읽기만으로 전체 해시 | TASK-18 I5 거절(불가능) | 대체 완료: 해시 없는 스트리밍 범위 읽기 `read_text_stream` | P3 | — | TASK-28 | Codex |
| I-04 | glob·관련 파일 자동 탐색 | TASK-18 I6 거절 | 완료: `read_text_files.select` + `suggest_related_files` | P3 | — | TASK-28 | Codex |
| I-05 | Buffer 구분자 기반 레코드 분리 | TASK-19 m5 보류 | 완료(동작 동일 리팩터) | P4 | — | TASK-28 | Codex |
| I-06 | 검색 `sort: "path"` | TASK-19 보류 | 완료 | P3 | — | TASK-28 | Codex |
| I-07 | path 검색 rg glob 사전 필터 | TASK-19 보류 | 완료: opt-in `match: "basename"` | P3 | — | TASK-28 | Codex |
| I-08 | JSON 대신 `--max-columns` 출력 형식 | TASK-19 보류 | 완료: opt-in `lineFormat: "columns"` | P3 | — | TASK-28 | Codex |
| I-09 | 검색 진단 통계 | TASK-19 거절 | 완료: opt-in `includeStats` | P4 | — | TASK-28 | Codex |
| I-10 | `shell_list` status 필터 | TASK-20 보류 | 완료 | P2 | — | TASK-29 | Codex |
| I-11 | 실행 label (명령 원문 미저장) | TASK-20 보류 | 완료: manifest v2 | P2 | — | TASK-29 | Codex |
| I-12 | 명령 기준 실행 찾기 | TASK-20 거절(cwd 포함 해시) | 대체 완료: v2 `commandSha256` + `shell_list.command` | P3 | I-11 | TASK-29 | Codex |
| I-13 | cwd 하위 경로 포함 필터 | TASK-20 보류 | 완료 `cwdScope` | P2 | — | TASK-29 | Codex |
| I-14 | shell 기록 보존 정리 | TASK-20 보류 | 완료(기본 비활성: dryRun 기본, 실제 삭제는 confirm 필요) D-1 | P4 | I-10 | TASK-29 | Codex |
| I-15 | edit별 새 파일 줄 범위 반환 | TASK-21 보류 | 완료 | P2 | — | TASK-29 | Codex |
| I-16 | `expectedCount` 다중 위치 교체 | TASK-21 보류 | 완료 | P2 | — | TASK-29 | Codex |
| I-17 | `dryRun` 편집 미리보기 | TASK-21 보류 | 완료 | P2 | I-15 | TASK-29 | Codex |
| I-18 | atomicReplace의 POSIX mode 보존 | TASK-21 별도 버그 | 완료(버그 수정, uid/gid 미보존) | P1 | — | TASK-29 | Codex |
| I-19 | 여러 파일 편집 / patch 문법 | TASK-21 거절 | 완료(기본 비활성: env 미설정 시 미등록) D-2 | P4 | I-16, I-17 | TASK-29 | Codex |
| I-20 | Control MCP 모드 배지 | TASK-22 보류 | 완료(증거 기반만, 현재 production은 stale/확인 불가만 표시) | P3 | I-38 | TASK-31 | Codex(API)+Claude(UI) |
| I-21 | argv `--read-only` 고정 모드 | TASK-22 보류 | 완료(런처는 옵션 추가만, 실제 설치 미적용) | P2 | — | TASK-30 | Codex |
| I-22 | 도구별 allowlist | TASK-22 거절 | 완료(축소 전용) | P3 | — | TASK-30 | Codex |
| I-23 | 세션 중 모드 전환 | TASK-22 거절 | 대체 완료: 단방향 `workstation_lock_read_only` | P3 | — | TASK-30 | Codex |
| I-24 | read-only 셸 allowlist | TASK-22 거절 | 완료(기본 비활성: 고정 argv preset `inspect_run`) D-3 | P4 | — | TASK-30 | Codex |
| I-25 | read-only에서 Git 상태(필터 허용 대신) | TASK-22 거절 | 대체 완료(기본 비활성: 필터 무력화 `project_resume` lite, submodule 제외) D-3 | P3 | — | TASK-30 | Codex |
| I-26 | 빈 env를 미설정 취급 | TASK-22 거절 | 대체 완료: 엄격 실패 + 안내(DONE-22-2) | — | — | 이 문서 | — |
| I-27 | 사용자 정의 마스킹 규칙 | TASK-23 보류 | 완료(정규식 없음, 리터럴·키 이름만) | P3 | — | TASK-30 | Codex |
| I-28 | 마스킹 해제(allow-raw) | TASK-23 거절 | 완료(기본 비활성: 시작 시 opt-out env만, 모델 경로 없음) D-4 | P4 | — | TASK-30 | Codex |
| I-29 | 디스크 로그 마스킹 | TASK-23 보류 | 완료(기본 비활성 opt-in, 64KiB 초과 줄은 통째 marker) D-5 | P4 | — | TASK-30 | Codex |
| I-30 | 고엔트로피 탐지 | TASK-23 거절 | 대체 완료: 대입문 문맥 한정 opt-in(512자 초과 값은 대상 아님) | P4 | — | TASK-30 | Codex |
| I-31 | checkpoint revision 이력 | TASK-24 보류 | 완료 `task_history`(history 결과 enum) | P2 | — | TASK-31 | Codex |
| I-32 | checkpoint 삭제·보존 | TASK-24 보류 | 완료(CAS + confirm 필요) D-6 | P3 | I-31 | TASK-31 | Codex |
| I-33 | 보고/실행 모순 플래그 | TASK-24 거절 | 대체 완료: 해석 없는 `evidenceSummary` | P2 | — | TASK-31 | Codex |
| I-34 | 자동 taskId | TASK-24 거절 | 대체 완료: 생략 시 서버 생성 후 반환 | P3 | — | TASK-31 | Codex |
| I-35 | multi-agent claim | TASK-24 거절 | 완료: advisory `task_claim`/`task_release`, UI 담당자 칩 | P4 | I-31 | TASK-31 | Codex |
| I-36 | Control env snapshot 마스킹 | TASK-25 보류 | 완료 | P1 | — | TASK-31 | Codex |
| I-37 | checkpoint 상세보기 | TASK-25 보류 | 완료: `/api/work/task` + 상세 dialog | P2 | — | TASK-31 | Codex(API)+Claude(UI) |
| I-38 | tunnel 로그 기반 모드 증거 | TASK-25 보류 | 완료(Windows는 검증된 tunnel 시작 시각으로 `log` 판정, macOS는 stale/none) | P3 | — | TASK-31 | Codex |
| I-39 | 모드 파일·heartbeat | TASK-25 거절 | 대체 완료: I-38 (read-only 무쓰기 계약 유지) | — | I-38 | TASK-31 | — |
| U-01~ | 게임 스타일 HUD·연출·단축키 | 2026-10-26 UI 조사 | 완료(TASK-26) | P2 | — | TASK-26 | Claude |

## 결정 항목 (사용자 확인 전 기본 비활성)

| ID | 질문 | 권고 기본값 |
| --- | --- | --- |
| D-1 | shell 기록 삭제 도구를 켤 것인가 | 도구는 등록하되 `dryRun` 기본, 실제 삭제는 매 호출 `confirm: "DELETE_SHELL_RECORDS"` |
| D-2 | 여러 파일 쓰기(최선형 rollback)를 허용할 것인가 | 구현하되 env `WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT=1` 일 때만 등록 |
| D-3 | read-only에서 외부 프로세스 표면(고정 git preset I-24, 필터 무력화 Git 상태 I-25)을 허용할 것인가 | env `WORKFORGE_MCP_READ_ONLY_EXTRAS=1` 일 때만 등록, 기본 미등록(TASK-22 결정 유지) |
| D-4 | 응답 마스킹을 시작 시 끌 수 있게 할 것인가 | env `WORKFORGE_MCP_REDACTION=off` 만 허용, stderr 경고·`redaction: "off"` 표시 |
| D-5 | shell 로그를 디스크에 쓸 때 마스킹할 것인가 | env `WORKFORGE_MCP_REDACT_SHELL_LOGS=1` opt-in |
| D-6 | checkpoint 삭제를 허용할 것인가 | 등록하되 CAS + `confirm` 필수, 이력은 보존 기간만큼 유지 |

## 최종 상태 (2026-10-26)

- B 표의 미구현 항목 I-01~I-39(I-26·I-39는 대체 완료)와 UI 항목(TASK-26, I-20·I-35·I-37 UI)이 모두 소스에 구현됐다. 단계별 구현 기록은 TASK-28~31 각 문서 끝, UI는 TASK-26 §11.
- D-1~D-6은 코드와 테스트만 있고 **기본 비활성**이다. 활성화는 사용자 결정으로 남는다.
- 도구 수(격리 stdio): 기본 25, read-only 14, D-3 env 켬 read-only 16, D-2 env 켬 read-write 27.
- 의존성: `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7 정확 고정, 전이 의존성 7개는 lock 갱신만(override 추가 없음). `npm ci` 후 `npm audit signatures` 통과, production audit 0건(moderate 포함). 개발용 audit 5건(vitest/vite 계열)은 별도 미해결로 TASK 기록에 명시. 라이선스 선언 diff 변화 없음. 공개 배포는 새 의존성 구성으로 라이선스 재승인이 필요하다.

독립 대조 검증 (Claude, Codex와 별도 실행)
- `npm run check:core` EXIT 0: Vitest 10 files, 113 passed / 3 skipped(플랫폼), `PLUGIN_PACKAGE_TEST_OK`, `MACOS_SETUP_TEST_OK`, `MACOS_TUNNEL_STATIC_TEST_OK`. Codex 보고 수치와 일치.
- `test:control-dashboard`, `scripts/test-control-work-api.mjs`, `smoke:stdio`, `test:security-invariants`, `test:privacy-invariants`, `audit:prod` 통과.
- `npm run build` 후 `node scripts/test-isolated-stdio.mjs`(Codex 추가, 임시 state·programs·registry env와 합성 manifest로 실제 설치 불변): stdio 14/16/27 + plugin 25, `ISOLATED_STDIO_TEST_OK`. Claude가 별도로 다시 실행해 같은 결과를 확인. 기본 25는 같은 스크립트의 기본 모드와 plugin 결과로 확인된다.
- **plugin smoke 경계**: 기본 `npm run smoke:plugin-stdio`는 플러그인 launcher가 `Resolve-WorkForgePortableEngine`으로 이 PC의 **실제 설치 엔진**(구버전, 도구 12개)을 찾으므로 소스 기대값 25와 불일치해 실패한다. 이는 예상된 환경 차이다. 실제 설치 갱신은 승인되지 않았으므로 건드리지 않았다. 소스 기준 플러그인 adapter 검증은 Codex가 새 dist와 현재 node_modules를 임시 portable v1 manifest·registry·profile에 연결한 격리 환경에서 25개 통과로 확인했다(설치 변경 없음).

미검증으로 남는 것: macOS 실기, 실제 ChatGPT 클라이언트에서의 새 스키마 호환, 터널을 거친 read-only env 전달, macOS 모드 증거의 `log` 판정, 스크린리더 실기 낭독.

## 유지 원칙

- no-startup, 로컬 인증·Host·CSP, 응답 마스킹, replay 금지, read-only 무쓰기 계약을 약화시키지 않는다. 약화가 필요한 항목은 위 D-*로만 존재한다.
- 새 도구가 생기면 `scripts/stdio-smoke.mjs`, `scripts/plugin-stdio-smoke.mjs`의 기대 목록과 README 도구 수를 함께 갱신한다. 쓰기 도구는 read-only에서 미등록이다.
- 모든 새 응답은 TASK-23 redactor를 지나는 `register`/`responseFor` 경로를 사용한다.
