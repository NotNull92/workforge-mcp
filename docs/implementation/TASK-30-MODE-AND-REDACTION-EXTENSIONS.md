# TASK-30 — 모드·마스킹 확장 (I-21 ~ I-30)

상태: **Claude 상세 설계 v1. Codex 구현 대상.** 공통 규칙은 TASK-28 머리말과 같다.

시작 시 설정은 모두 `src/stdio.ts`에서 **한 번** 읽어 `createServer(context, options)`로 넘긴다. env 값은 `parseReadOnlyMode`와 같은 엄격 파싱(정해진 값 외에는 시작 실패, 오류에 변수 이름과 허용값). 실행 중 env 변경은 반영하지 않는다.

`workstation_context` 출력에 다음 posture 필드를 추가한다(값만, 비밀·규칙 내용은 제외).

```text
toolMode: "read_only" | "read_write"          (기존)
toolModeSource: "default" | "env" | "argv" | "session_lock"
enabledTools: string[]                         (정렬)
redaction: "on" | "off"
redactionRules: { builtin: true, customLiterals: number, customKeyNames: number, entropy: boolean }
shellLogRedaction: "none" | "line"
multiFileEdit: boolean                         (TASK-29 I-19)
readOnlyExtras: boolean                        (I-24/I-25)
```

stdio는 기존 `WorkForge MCP tool mode: ...` 줄을 **그대로 두고**, 다음 줄에 `WorkForge MCP posture: {"toolMode":...,"toolModeSource":...,"redaction":...,"tools":N}` JSON 한 줄을 stderr로 쓴다(I-38 증거용, 비밀 없음).

---

## I-21 argv `--read-only` 고정 모드

**API** `node dist/stdio.js --profile <id> --read-only`.
- `parseProfileId`는 알 수 없는 인자를 거부하므로, stdio에서 `--read-only`를 먼저 분리하는 `parseBridgeArguments(argv) → { profileArgv, readOnlyFlag }`를 `src/profile.ts`에 추가하고 `loadProjectContextFromArgv`가 이를 쓴다. 중복 `--read-only`는 오류.
- 결정 규칙: `readOnly = readOnlyFlag || env === "1"`. argv가 있고 env가 `"0"`이면 **read-only가 이긴다**(안전 쪽) + stderr 한 줄 안내. `toolModeSource`는 argv가 있으면 `argv`, 아니면 env가 1이면 `env`, 아니면 `default`.

**런처** 선택 인자만 추가하고 실제 설치에는 적용하지 않는다(승인 경계).
- macOS `scripts/macos/configure-tunnel.mjs`: `--read-only` 옵션이 있으면 `--mcp-command` 문자열 끝에 ` --read-only`.
- Windows tunnel profile 생성 경로(`scripts/WorkForge.ProfileRuntime.ps1`에서 MCP 명령을 만드는 곳)와 `Configure Tunnel` 진입 스크립트: `-ReadOnly` switch → 같은 방식.
- Control에는 이번에 토글을 만들지 않는다(I-20은 증거 표시만).

**테스트** argv만, env만, 둘 다, argv+env=0 → read_only; 중복 플래그 오류; 알 수 없는 인자 여전히 거부; 생성된 명령 문자열에 플래그 포함(fixture, 실제 설치 미변경); stdio smoke를 `--read-only`로 한 번 실행해 11개 도구(TASK-28~31 반영 후 값은 HANDOFF 표 기준).

---

## I-22 도구 allowlist (축소 전용)

**API** env `WORKFORGE_MCP_TOOLS=read_text_file,search_files,...`
- 쉼표 구분, 공백 trim, 빈 항목·중복 거부. 각 이름은 **현재 모드에서 등록 가능한 도구**여야 한다(read-only에서 write 도구 이름 → 시작 실패). 즉 allowlist는 모드보다 넓힐 수 없다.
- `workstation_context`는 항상 등록(모드·revision 확인 경로). 목록에 없어도 자동 포함.
- 미설정이면 기존과 동일. `enabledTools`에 실제 등록 목록.

**구현** `createServer`의 각 `registerTool`/`if (!readOnly) registerTool` 분기를 `const enabled = (name) => toolSet.has(name)` 조건으로 감싼다. 모드별 후보 목록을 상수 배열 하나로 정의해 smoke·테스트가 같은 상수를 쓴다.

**테스트** 축소 등록 확인(listTools); read-only에서 write 이름 → 시작 실패; 알 수 없는 이름 → 실패; 미설정 → 기존 목록.

---

## I-23 (대체) 단방향 세션 잠금 `workstation_lock_read_only`

**원 아이디어** 세션 중 모드 전환 → 모델이 다시 열 수 있으면 강제가 무의미. **목적**(작업 도중 더 이상 쓰지 않도록 조이기)을 단방향 래칫으로 충족한다. 해제 도구는 없다. 서버 재시작만이 해제다.

**API** read-write 모드에서만 등록되는 도구. 입력 `contextRevision`, `confirm: z.literal("LOCK_READ_ONLY")`. 출력 `{ toolMode: "read_only", toolModeSource: "session_lock", disabledTools: string[] }`.

**처리**
- SDK `registerTool`이 돌려주는 `RegisteredTool`을 이름별로 보관하고, 잠금 시 read-only에서 미등록인 도구 전부와 잠금 도구 자신을 `.disable()` (SDK가 `tools/list_changed` 알림 전송).
- 방어적으로 서버 상태 `sessionLocked = true`를 두고 모든 쓰기 handler 첫 줄에서 확인(`SESSION_LOCKED` 오류). 클라이언트가 옛 목록으로 호출해도 거부.
- 실행 중인 shell 작업은 취소하지 않는다(잠금은 새 변경 금지이지 진행 중 작업 중단이 아님. description에 명시). `shell_cancel`은 잠금 후에도 남긴다(진행 중 작업을 멈출 수단은 보호 강화이므로).
- `workstation_context.toolMode`가 이후 `read_only`, source `session_lock`. instructions는 초기화 때 고정이므로 바뀌지 않음을 문서화.

**테스트** 잠금 후 listTools에서 쓰기 도구 사라짐; 직접 호출 거부; 해제 경로 없음; read-only 모드에서는 도구 자체 미등록.

---

## I-24 / I-25 read-only 외부 실행 표면 (D-3)

둘 다 `WORKFORGE_MCP_READ_ONLY_EXTRAS=1`(엄격 파싱)이고 read-only 모드일 때만 등록. 기본 미등록이라 TASK-22 결정(read-only 9→현재 11 도구)을 기본값에서 바꾸지 않는다. read-write 모드에서는 이미 `shell_start`/`project_resume`이 있으므로 등록하지 않는다.

### I-24 고정 argv preset `inspect_run`
- 입력: `preset: enum`, `path`(repo 경로, tree 검증), preset별 인자.
- preset(셸 문자열 없음, `runProcess` + `makeSafeEnvironment({ GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" })`, timeout 15초, stdout 256KiB, 결과 redactor 통과):
  - `git_log`: `git --no-pager -c core.fsmonitor=false log --no-show-signature --no-color -n <1..100> --date=iso-strict --pretty=format:%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1e`
  - `git_show_stat`: `... show --no-show-signature --no-color --no-ext-diff --no-textconv --stat --format=%H%x1f%s <rev>` (rev: `^[0-9a-f]{4,64}$` 또는 `^HEAD(~[0-9]{1,3})?$`)
  - `git_branches`: `... branch --list --no-color --format=%(refname:short)`
  - `git_diff_commits_stat`: 두 rev 사이 `diff --stat --no-ext-diff --no-textconv <a> <b> --` (트리 대 트리, 작업 트리 미접근)
- 작업 트리 내용을 읽는 git 명령(status, worktree diff)은 preset에 넣지 않는다(clean filter 실행 경로). 그것은 I-25가 담당.
- 출력: `{ preset, exitCode, stdout, stderr(1,000자), truncated, timedOut }`.

### I-25 필터 무력화 Git 상태 `project_resume` (read-only lite)
- read-only에서 `project_resume`을 같은 이름·스키마로 등록하되 실행 경로를 바꾼다. 출력에 `filtersNeutralized: true`, `accuracyNote` 추가(read-write에서는 false/null).
- 처리: `git config --get-regexp "^filter\..+\.(clean|smudge|process)$"`(설정 읽기만, 실행 없음)로 driver 이름을 모은다. driver 이름은 `filter.` 뒤부터 **마지막** `.` 앞까지. 각 driver마다 `-c filter.<name>.clean= -c filter.<name>.smudge= -c filter.<name>.process= -c filter.<name>.required=false`를 모든 git 호출 앞에 붙인다. 이름 개수 상한 64, 넘으면 `unavailable`(필터를 다 끌 수 없으면 실행하지 않음).
- 기존 `-c core.fsmonitor=false`, `--no-pager`, `--no-show-signature`, `--no-ext-diff --no-textconv`, `GIT_OPTIONAL_LOCKS=0` 유지.
- 정확도 한계: LFS 같은 필터 대상 파일이 modified로 보일 수 있다 → `accuracyNote: "filters_disabled"`.
- `resumePaths` 문서 읽기는 기존 reader 그대로.

**핵심 테스트** 임시 repo에 `filter.evil.clean = node -e "require('fs').writeFileSync('PWNED','')"`와 `.gitattributes` `* filter=evil`을 설정하고 파일을 수정 → read-only lite `project_resume` 실행 후 `PWNED`가 **생기지 않음**. 같은 테스트로 read-write `project_resume`은 기존 동작(필터 실행 가능)임을 대조하지 않는다(위험한 실행을 테스트에서 일부러 일으키지 않음 — read-write 경로는 변경 없음 확인만).

**승인 경계** D-3. 기본 미등록. 사용자가 env를 켜야 등록.

---

## I-27 사용자 정의 마스킹 규칙

**API** env `WORKFORGE_MCP_REDACTION_RULES=<절대 경로>`. 시작 시 1회 읽기.
- 파일: UTF-8 JSON, 64KiB 이하, regular file·non-symlink(`readBoundedArchiveFile`와 같은 검사). 스키마 `{ "version": 1, "literals": string[], "keyNames": string[] }`.
  - `literals`: 8~4,096자, 최대 256개, 합계 64KiB(기존 snapshot 한도와 **합산**). exact 매칭 목록에 합류.
  - `keyNames`: `^[A-Za-z][A-Za-z0-9_-]{1,63}$`, 최대 64개. 대입문 규칙의 키 목록에 escape된 리터럴로 추가.
  - **정규식은 받지 않는다**(ReDoS 방지).
- 오류(경로 상대, 없음, 형식 오류, 한도 초과) → 시작 실패. 값은 오류·로그에 출력하지 않는다.
- `createRedactor(knownSecrets, { extraKeyNames })` 시그니처 확장. tasks/shell label의 비밀 거부 검사도 같은 redactor를 쓴다.

**테스트** literal 마스킹; keyName `deploy_phrase=...` 마스킹; 정규식 문법이 들어 있어도 리터럴로 처리; 한도 초과 시작 실패; 파일 내용이 오류 메시지에 없음.

---

## I-28 마스킹 끄기 (D-4)

**원 아이디어** allow-raw 도구/마스킹 해제. 모델이 원문을 요청하는 경로는 만들지 않는다(거절 유지). 목적(사용자가 신뢰 환경에서 원문을 다뤄야 할 때)은 **시작 시 사용자 선택**으로만 충족한다.

**API** env `WORKFORGE_MCP_REDACTION` = 미설정 또는 `on` → 켜짐, `off` → 꺼짐, 그 외 시작 실패.
- off일 때: 응답 redactor를 항등 함수로 바꾸고 `_meta.redactionCount`는 0. **marker guard(쓰기 거부)는 유지**. stderr `WorkForge MCP redaction: off` 경고, `workstation_context.redaction: "off"`, instructions 첫 줄에 "responses are not redacted" 명시.
- tasks/label 비밀 저장 거부는 유지(디스크 보호는 응답 마스킹과 별개).

**승인 경계** D-4. 보호를 약화시키는 설정이므로 README에 경고와 함께, 기본은 on.

**테스트** off에서 synthetic token이 응답에 그대로; context에 off; marker 쓰기 거부 유지; 잘못된 값 시작 실패.

---

## I-29 shell 로그 디스크 마스킹 (D-5, opt-in)

**API** env `WORKFORGE_MCP_REDACT_SHELL_LOGS=1`.
- `src/shell.ts`의 stdout/stderr 처리에서 스트림별 줄 버퍼(최대 64KiB, 넘으면 그 지점에서 강제 flush)를 두고 줄 단위로 redactor를 적용한 뒤 `writeBounded`·메모리 chunk에 저장. 프로세스 종료 시 남은 부분 flush.
- PEM 상태 기계: `BEGIN ... PRIVATE KEY` 줄을 본 뒤 `END` 줄까지 모든 줄을 marker로(줄바꿈 유지).
- 바이트 카운터·잘림·SHA-256은 **저장된(마스킹된) 바이트** 기준 → 기존 무결성 검증과 일치. 원문은 남지 않는다.
- manifest v2(TASK-29 I-11)에 `logRedaction: "none" | "line"` 추가, status 출력에도 포함.
- 줄 버퍼 때문에 `shell_output`의 실시간성이 줄 단위로 늦어질 수 있음을 문서화.

**테스트** 토큰을 출력하는 명령 → 로그 파일에 원문 없음; 해시 검증 통과; 줄바꿈 없이 끝나는 출력 flush; PEM 여러 줄; 기본값에서는 기존 동작.

---

## I-30 (대체) 대입문 문맥 고엔트로피 탐지 (opt-in)

**원 아이디어** 일반 고엔트로피 탐지 → 해시·ID 오탐으로 도구 계약 손상(거절 이유). **대안**: 키 대입 문맥에서만, 명백한 해시 형태를 제외하고 탐지.

**API** env `WORKFORGE_MCP_REDACT_ENTROPY=1`.
- 규칙: `([A-Za-z_][A-Za-z0-9_.-]{0,63})[ \t]*[:=][ \t]*["']?([A-Za-z0-9+/_=-]{24,512})` 에서 값이
  - Shannon 엔트로피 ≥ 4.0 bits/char,
  - `^[a-f0-9]{40}$`, `^[a-f0-9]{64}$`, `^shell_[a-f0-9]{32}$`, UUID 형태가 **아니며**,
  - 이미 marker가 아니면 값만 마스킹.
- 독립 문자열(대입 문맥 없음)은 건드리지 않으므로 `sha256`·`id` 메타데이터 필드는 안전.

**테스트** `API_SIGNING=Zx8...`(고엔트로피) 마스킹; `commit=<40hex>` 미마스킹; sha256 필드 미변경; 기본값 비활성.

---

## 완료 조건 (TASK-30 전체)

- build·전체 테스트·smoke(기본, `--read-only`, extras env) 통과.
- README en/ko에 env 표(이름·허용값·기본값·보호 영향), ARCHITECTURE에 posture 필드와 D-3/D-4/D-5 경계.
- `test:security-invariants`, `test:privacy-invariants` 통과(새 env가 기본값에서 보호를 약화시키지 않음).

## 구현 기록

2026-10-26 — Wave 5: I-21/I-22/I-23 implemented with shared tool mode catalog, shrinking allowlist, startup posture, and irreversible session lock (shell_cancel retained). Windows/macOS command-generation options only; live installation unchanged. Build passed; filesystem/profile 38 passed + 1 POSIX skip; isolated stdio argv/env/normal smoke 11/11/18 tools passed; Windows command fixture passed; macOS tunnel static passed, live skipped.
2026-10-26 — Wave 9: I-27/I-30 implemented. Startup-only bounded safe rules file, merged literal budget, literal-only custom keys, assignment-only opt-in entropy with hash/ID exclusions. Same options flow to checkpoint/label persistence guards. Build passed; redaction/tasks/filesystem 52 passed + 1 POSIX skip. Redaction remains best-effort; no general high-entropy standalone masking.

2026-10-26 — Wave 10: I-24/I-25/I-28/I-29 implemented behind startup opt-ins. Fixed Git argv presets validate revisions; read-only project snapshots enumerate included filter drivers, neutralize all clean/smudge/process commands and required flags, and fail closed for unsafe/failed/oversized enumeration. Regression covers malicious included filter and >64 drivers without execution. Disk log masking handles split UTF-8/tokens, PEM, final partial lines and oversized-line suppression; manifests report suppressedLongLines. Response masking defaults on; opting out does not disable secret persistence guards. SDK instructions now describe read-only extras accurately. No live launcher/tunnel configuration changed.
