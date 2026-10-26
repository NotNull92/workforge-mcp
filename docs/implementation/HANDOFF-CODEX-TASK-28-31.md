# Codex 구현 인계 — 추가 아이디어 TASK-28 ~ 31

작성: Claude (wW:p2), 2026-10-26. 받는 사람: Codex (wW:p1).
이 문서와 아래 참조 문서만으로 대화 기록 없이 시작할 수 있게 썼다.

## 목표

사용자 지시: TASK-18~25에서 나온 추가 아이디어를 **전부 구현**한다(보류·거절 항목은 목적을 지키는 대안으로 재설계됨). Claude가 설계했고 Codex가 구현한다. 게임 스타일 Control UI는 Claude가 별도로 직접 구현한다(TASK-26).

## 읽을 문서 (순서대로)

1. `AGENTS.md` — 저장소 불변 조건(no-startup, 자격 증명·생성물·절대 경로 커밋 금지, 공개 배포 등은 별도 승인).
2. `docs/implementation/TASK-27-IDEA-INVENTORY.md` — 전수 목록, 완료 근거(DONE-*), 결정 항목 D-1~D-6.
3. `docs/implementation/TASK-28-READ-SEARCH-EXTENSIONS.md` — I-01~I-09.
4. `docs/implementation/TASK-29-SHELL-HISTORY-AND-EDIT-EXTENSIONS.md` — I-10~I-19.
5. `docs/implementation/TASK-30-MODE-AND-REDACTION-EXTENSIONS.md` — I-21~I-30, posture 필드.
6. `docs/implementation/TASK-31-TASK-AND-CONTROL-EXTENSIONS.md` — I-31~I-39, I-20.

설계를 다시 추측하지 말고, 설계와 실제 코드가 맞지 않으면 구현을 멈추지 말고 **가장 작은 맞춤**을 한 뒤 해당 TASK 문서 끝 "구현 기록"에 이유를 남긴다. 핵심 계약(보호 약화·스키마 의미 변경)이 달라지면 Claude에게 재검수를 요청한다.

## 실행 순서

| 단계 | 항목 | 이유 |
| --- | --- | --- |
| 1 | I-18(mode 보존 버그), I-36(Control 비밀 snapshot), I-33(evidenceSummary) | 버그·보호 강화, 작음 |
| 2 | I-15 → I-17 → I-16 (replace_text 확장) | 서로 의존, 같은 함수 |
| 3 | I-10 + I-13 (shell_list 필터, `recentArchiveEntries.keep`) , I-01 | 사용성 핵심 |
| 4 | I-11 + I-12 (manifest v2) | I-14, I-29의 선행 |
| 5 | I-21 → I-22 → I-23 (posture 필드 먼저 도입) | I-38 증거 줄의 선행 |
| 6 | I-31 → I-34 → I-37 backend | I-32, I-35의 선행 |
| 7 | I-38 선행 조사 → endpoint (unsupported면 그대로 기록하고 종료) | 추측 금지 |
| 8 | I-02, I-06, I-07, I-08, I-09, I-05, I-03, I-04 | 검색·읽기 확장 |
| 9 | I-27, I-30 | 마스킹 확장 |
| 10 | 결정 게이트 항목(기본 비활성): I-14(D-1), I-32(D-6), I-35, I-29(D-5), I-28(D-4), I-24/I-25(D-3), I-19(D-2) | 보호를 약화시킬 수 있어 마지막. 기본값에서 등록·활성화되지 않음을 테스트로 고정 |

단계마다 build와 관련 테스트를 통과시킨 뒤 다음 단계로 간다. 큰 단계는 중간 커밋 대신 TASK 문서 "구현 기록"에 진행 상황을 남긴다(커밋은 사용자가 요청할 때만).

## 최종 도구 수 (smoke 기대값)

| 구성 | read-write | read-only |
| --- | --- | --- |
| 현재 | 17 | 11 |
| 기본값(모든 단계 완료, D-* env 미설정) | 25 (+read_text_stream, suggest_related_files, shell_prune, workstation_lock_read_only, task_history, task_delete, task_claim, task_release) | 14 (+read_text_stream, suggest_related_files, task_history) |
| D-2 env 켬 | +2 (replace_text_multi, apply_patch) | 변화 없음 |
| D-3 env 켬 | 변화 없음 | +2 (inspect_run, project_resume lite) |

도구 이름 목록은 `src/server.ts`의 모드별 상수 하나에서 나오게 하고(I-22), `scripts/stdio-smoke.mjs`·`scripts/plugin-stdio-smoke.mjs`가 같은 기대 목록을 쓰게 한다.

## 파일 소유 경계 (동시 작업 충돌 방지)

| 소유 | 파일 |
| --- | --- |
| Codex | `src/**`, `tests/**`, `scripts/control-server.mjs`, `scripts/stdio-smoke.mjs`, `scripts/plugin-stdio-smoke.mjs`, `scripts/macos/configure-tunnel.mjs`, `scripts/WorkForge.ProfileRuntime.ps1`(I-21 선택 인자만), 새 `scripts/test-control-work-api.mjs`, `package.json` scripts(새 테스트 등록), TASK-28~31 문서의 "구현 기록" 절 |
| Claude | `control-ui/index.html`, `control-ui/app.js`, `control-ui/style.css`, `scripts/test-control-dashboard.mjs`의 UI 렌더링 검사 블록, `docs/implementation/TASK-26-CONTROL-GAME-HUD.md` |
| 공동(절 단위) | `README.md`, `README.ko.md`, `docs/ARCHITECTURE.md` — Codex는 도구·env·보안 절, Claude는 Control 대시보드 절만 수정 |

- 새 Control API 테스트는 `scripts/test-control-dashboard.mjs`에 넣지 말고 `scripts/test-control-work-api.mjs`를 만들어 `check:windows`·`check:macos`에 추가한다(같은 파일 동시 편집 방지).
- UI가 필요한 항목(I-37 상세 dialog, I-20 배지)은 API를 먼저 완성하고 응답 예시 JSON을 Claude pane(wW:p2)에 전달한다. `control-ui/*`는 수정하지 않는다.
- 기존 미커밋 변경(TASK-18~25 전체)은 보존한다. 다른 작업자 파일을 되돌리지 않는다.

## 검증 명령

```powershell
npm run build
npm test
npm run smoke:stdio
npm run smoke:plugin-stdio
npm run test:plugin
npm run test:control-dashboard
node scripts/test-control-work-api.mjs
npm run test:security-invariants
npm run test:privacy-invariants
```
마지막에 `npm run check:core`. 전체 `check:windows`는 시간이 길므로 최종 1회. macOS 전용 검사는 소스 정적 검사(`test:macos-setup`, `test:macos-tunnel`)만 가능하며 실기 검증은 미검증으로 기록한다.

## 승인 경계 (이 인계로 승인되지 않는 것)

- 공개 배포·릴리스 생성, 라이선스·서명, 실제 설치 엔진·터널 재설정, 자격 증명 변경·조회.
- I-21의 런처 인자는 **스크립트 옵션 추가까지만**. 실제 설치 tunnel profile 재생성은 하지 않는다.
- D-1~D-6은 코드와 테스트만 구현하고 기본값은 비활성. 활성화는 사용자 결정.

## 남은 질문과 미검증 범위

- I-38: tunnel-client의 MCP stderr 기록 여부 미확인 → 선행 조사 결과에 따라 `unsupported`로 끝날 수 있다.
- I-23: SDK 1.29 `RegisteredTool.disable()`과 `tools/list_changed` 동작은 테스트로 확정(클라이언트 캐시와 무관하게 handler 방어 검사가 1차 보호).
- I-25: `git config --get-regexp`가 include된 설정까지 읽는지 Git 버전별 확인. 무력화 실패 시 실행하지 않는 쪽(unavailable)으로.
- macOS 실기, 실제 ChatGPT 클라이언트에서의 union/새 필드 호환성은 미검증.

## 완료 보고 형식

단계별로 Claude pane(wW:p2)에 `IDEAS-WAVE-<n>-DONE` 머리말로: 구현 ID, 변경 파일, 실행한 검증 명령과 결과(통과/실패 수), 설계와 달라진 점, 남은 위험.
