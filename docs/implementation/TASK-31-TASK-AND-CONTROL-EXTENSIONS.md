# TASK-31 — 작업 체크포인트·Control backend 확장 (I-31 ~ I-39, I-20)

상태: **Claude 상세 설계 v1. backend는 Codex, `control-ui/*`는 Claude.** 공통 규칙은 TASK-28 머리말과 같다.

파일 소유 경계: Codex는 `src/*`, `scripts/control-server.mjs`, smoke/테스트 스크립트를 수정한다. `control-ui/index.html`, `app.js`, `style.css`는 Claude(TASK-26)가 수정한다. Codex가 UI 변경이 필요하다고 판단하면 수정하지 말고 필요한 API·키 이름을 Claude에게 전달한다.

---

## I-31 checkpoint revision 이력 `task_history`

**저장** `artifacts/workforge-mcp/tasks/.history/<taskId>/<savedAtCompact>-<sha12>.json`
- `savedAtCompact` = 이전 checkpoint의 `savedAt`에서 `:`·`.` 제거. 파일 내용은 이전 checkpoint 바이트 그대로.
- `saveTaskCheckpoint` 갱신 경로(expectedSha256이 해시): 쓰기 **전에** `readCheckpoint`로 이전 바이트와 sha를 얻고, sha가 expectedSha256과 같을 때만 후보로 보관. `writeTextFile` 성공 **후에** 이력 파일을 `wx`로 생성. CAS 실패 시 이력도 쓰지 않음.
- 디렉터리 생성은 `prepareTaskRoot` 방식(segment마다 mkdir→lstat 비 symlink 확인, `assertSafeRuntimeRoot`)으로 `.history`, `<taskId>`까지.
- 보존: task당 최신 20개. 초과분은 가장 오래된 것부터 삭제(이력 디렉터리 안의 regular file만).
- `.history`는 `listTasks` 패턴(`.`으로 시작)에 걸리지 않으므로 목록에 섞이지 않는다.

**API**
- 읽기 도구 `task_history`: 입력 `taskId`, `limit` 1~20(기본 10). 출력 `revisions: [{ sha256, savedAt, title, reportedStatus }]`(최신 순), `errors: [{ name, code }]`.
- `task_resume` 입력 `revisionSha256?`: 주어지면 이력에서 그 sha의 파일을 찾아(바이트 해시 재계산으로 확인) 같은 출력 형태로 반환 + `revision: true`. 없으면 `found: false`.
- read-only 모드에서 둘 다 등록(디렉터리를 만들지 않음).

**테스트** 세 번 저장 → 이력 2개; CAS 실패 시 이력 미생성; 21번째에서 가장 오래된 것 삭제; revision 조회 해시 검증; symlink된 `.history` 거부; read-only에서 디렉터리 미생성.

---

## I-32 checkpoint 삭제 `task_delete` (D-6)

**API** 쓰기 도구(read-only 미등록, `contextRevision` 필수). 입력 `taskId`, `expectedSha256`(필수, CAS), `confirm: z.literal("DELETE_TASK")`, `keepHistory` boolean(기본 true).
- 처리: `filesystem.ts`에 `deleteFileWithCas({ context, path, expectedSha256 })`를 추가(기존 `withTargetWriteLease` + `readTextBytes` 해시 확인 + `rm`; hardlink·symlink 거부는 `resolveWriteTarget` 재사용). keepHistory면 삭제 전에 현재 바이트를 I-31 이력에 보관.
- keepHistory=false면 `.history/<taskId>` 디렉터리도 삭제(내부 regular file만, symlink 발견 시 중단).
- 출력 `{ taskId, deleted: true, historyKept: boolean }`. 불일치는 `CHECKPOINT_CONFLICT`.

**승인 경계** D-6. description에 "사용자 확인 후에만 confirm을 넣는다".

**테스트** CAS 불일치 거부; confirm 없으면 스키마 거부; 이력 보존/삭제; read-only 미등록.

---

## I-33 (대체) `evidenceSummary`

**원 아이디어** "보고 completed인데 실패 기록 있음" 모순 플래그 → 이전 실패 후 성공 같은 정상 흐름을 오해시킴. **대안**: 해석 없이 집계만.

**API** `task_resume` 출력 `evidenceSummary: { total, completed, failed, cancelled, unsealed, unavailable, latestUpdatedAt: string | null, latestStatus: string | null }`. `unsealed`는 `ownership_lost`, `latest*`는 updatedAt이 가장 최근인 기록. 문구로 판정하지 않는다.

**테스트** 혼합 evidence 집계; evidence 없음 → total 0, latest null.

---

## I-34 (대체) 서버 생성 taskId

**원 아이디어** 자동 taskId 추론 → 명시 선택 원칙과 충돌. **대안**: 생성 시에만 서버가 ID를 만들어 **반환**하고, 이후에는 그 ID를 명시적으로 쓴다.

**API** `task_checkpoint`의 `taskId`를 optional로. 생략은 `expectedSha256: "absent"`일 때만 허용(갱신에서 생략하면 스키마 오류).
- 생성: `slug(state.title)` = NFKD 후 ASCII 소문자·숫자만 남기고 나머지를 `-`로, 연속 `-` 축약, 앞뒤 `-` 제거, 최대 40자, 비면 `task`. + `-` + base36 6자(crypto random). `taskIdSchema`·예약명 검사. `CHECKPOINT_EXISTS`면 최대 3회 재생성.
- 출력은 기존 `taskId` 필드에 생성값. 설명에 "반환된 taskId를 사용자에게 알려라".

**테스트** 한글 제목 → `task-xxxxxx`; 영문 제목 slug; 갱신에서 생략 거부; 충돌 재시도(테스트 hook로 난수 고정).

---

## I-35 advisory claim `task_claim` / `task_release`

**목적** 여러 에이전트가 같은 task를 동시에 이어 쓰지 않도록 **알림**한다. 쓰기 자체를 막지는 않는다(CAS가 실제 충돌 방지).

**저장** `tasks/<taskId>.claim.json` = `{ version:1, taskId, claimId(uuid), owner(1~64자, 비밀 검사), claimedAt, expiresAt }`. 파일명에 `.`이 있어 `listTasks` 패턴에 걸리지 않는다.

**API** (쓰기 도구, read-only 미등록, contextRevision 필수)
- `task_claim`: `taskId`, `owner`, `ttlMinutes` 1~1440(기본 60). 기존 claim이 없거나 만료면 새로 생성(`writeTextFile` CAS: 없으면 `absent`, 만료 claim이면 그 sha). 유효한 claim이 다른 owner면 `CLAIM_HELD: <owner> until <expiresAt>`. 같은 owner면 갱신.
- `task_release`: `taskId`, `claimId`. 일치하면 `deleteFileWithCas`.
- `task_resume`·`task_list` 출력에 `claim: { owner, expiresAt, expired } | null`.

**테스트** 다른 owner 차단, 만료 후 인수, 같은 owner 갱신, 잘못된 claimId release 거부, owner에 비밀 → 거부.

---

## I-36 Control env snapshot 마스킹

`scripts/control-server.mjs` 맨 앞 `delete process.env.CONTROL_PLANE_API_KEY` **직전**에:
```js
const controlKnownSecrets = [process.env.CONTROL_PLANE_API_KEY].filter(value => typeof value === 'string' && value.length >= 8);
```
`getWork`(및 I-37/I-38 endpoint)의 `redaction.createRedactor()`를 `createRedactor(controlKnownSecrets)`로 바꾼다. 자격 증명 파일(`.env.local`)을 Control이 직접 읽지 않는다(자격 증명 취급 경계).

**테스트** test-control-dashboard에서 env로 synthetic key를 주고 그 값이 들어간 task 제목 fixture → `/api/work` 응답에 원문 없음.

---

## I-37 checkpoint 상세 `/api/work/task`

**API** `GET /api/work/task?id=<taskId>` (기존 Host·session 검사 통과 후, POST 405 분기보다 앞).
- `tasks.taskIdSchema`로 검증, 실패 → `200 { ok:true, available:false, code:"invalid_id" }`.
- `getWork`와 같은 lazy module·context·busy·5초 예산·고정 code 규칙. 캐시 없음, 동시 요청 1개(in-flight 공유는 같은 id끼리만).
- 성공 응답:
```json
{ "ok": true, "available": true, "observedAt": "...",
  "task": { "taskId", "title", "objective", "reportedStatus", "plan", "completedSteps", "blockers",
            "nextAction", "projectPath", "relatedPaths", "savedAt" },
  "evidence": [{ "id", "status", "trackingState", "exitCode", "updatedAt", "available" }],
  "evidenceSummary": { ... I-33 ... },
  "claim": null }
```
- 경로 필드는 `sanitizeText`, 전체는 I-36 redactor. 명령·로그 본문 없음. `found:false`면 `code:"not_found"`.
- 활동 로그에 기록하지 않는다.

**UI(Claude)** 작업 목록 항목의 "상세" 버튼 → 접근 가능한 `<dialog>`로 표시. 키: `work.detail.*`.

**테스트** 인증 없음 401; 잘못된 id; not_found; 성공 응답에 synthetic token 없음; objective 등 본문은 이 endpoint에서만 노출되고 `/api/work`는 여전히 요약만.

---

## I-38 / I-20 tunnel 로그 기반 모드 증거와 배지 (I-39 대체)

**선행 조사(Codex, 구현 전 필수)** tunnel-client가 MCP 자식 프로세스의 stderr를 어느 파일에 남기는지 확인한다(Windows `tunnel-status.ps1 -Snapshot`가 아는 로그 경로, macOS `tunnel-common.mjs`). **남기지 않는다면 이 항목은 `unsupported`로 끝내고** UI는 unknown을 유지한다. 추측으로 경로를 하드코딩하지 않는다.

**API** `GET /api/mode-evidence` (session 필요)
```json
{ "ok": true, "evidence": "log" | "stale" | "none" | "unsupported",
  "toolMode": "read_only" | "read_write" | "unknown",
  "redaction": "on" | "off" | "unknown", "tools": number | null,
  "observedAt": "로그 줄 시각 또는 로그 파일 mtime", "source": "tunnel_log" }
```
- 로그 끝 256KiB만 읽고(`readBoundedArchiveFile` 계열, symlink 거부) TASK-30의 `WorkForge MCP posture: {...}` 줄의 **마지막** 항목을 파싱(JSON 실패 시 none). posture 줄이 없고 기존 `tool mode:` 줄만 있으면 그 값만.
- 현재 tunnel 상태 snapshot의 시작 시각보다 로그 줄이 오래됐거나 tunnel이 정지 상태면 `stale`.
- 캐시 20초, 실패는 고정 code, 활동 로그 미기록.

**UI(Claude)** 배지: `log`이면 "MCP 모드: 읽기 전용 · 로그 증거 14:02", `stale`이면 흐리게 "마지막 기록", 그 외 "MCP 모드 확인 불가". 터널 상태로 추정하지 않는다.

**I-39** 모드 파일·heartbeat는 read-only 무쓰기 계약과 충돌 → I-38로 대체, 별도 구현 없음.

**테스트** fixture 로그로 log/stale/none 판정; symlink 로그 거부; 로그 없음 → none; 지원 불가 플랫폼 → unsupported.

---

## 완료 조건 (TASK-31 전체)

- build·전체 테스트·두 smoke·`npm run test:control-dashboard` 통과.
- 새 도구: `task_history`(읽기), `task_delete`·`task_claim`·`task_release`(쓰기). 도구 수는 HANDOFF 표에 최종 반영.
- README en/ko, ARCHITECTURE에 이력 보존 20개, 삭제 CAS·confirm, claim이 advisory임, 모드 증거의 출처와 한계.

## 구현 기록

2026-10-26 — Wave 1: I-33: task_resume aggregates evidenceSummary, including unavailable/unsealed and latest manifest timestamp. I-36: Control snapshots its startup control-plane key before deletion and masks work responses. Dedicated test-control-work-api avoids Claude-owned dashboard tests.
2026-10-26 — Wave 6: I-31/I-34/I-37 backend implemented. Claude approved history response refinement with four conditions: history saved/not_applicable/failed; fixed historyErrorCode; pre-CAS safe directory preparation; identical EEXIST is saved; prune-only failure retains saved; next update uses returned hash (no checkpoint retry needed). Implemented all conditions, optional staging not adopted. task_history retains 20 previous revisions; task_resume supports revisionSha256. Generated IDs returned explicitly, bounded collision retries. Detail API sent to Claude for UI. Build passed; filesystem/tasks 40 passed + 1 POSIX skip; authenticated Control work API passed, diff check clean.
2026-10-26 — Wave 7: I-38/I-20 backend implemented. Upstream v0.0.10 105e17a79a36e4e5c897fd698ed2b8dbf935b144 and v0.0.11 8d55683eeef80bc5e360d95abf4692454fafc615 pkg/mcpclient/stdio_command.go:95 sets cmd.Stderr=os.Stderr. Windows Get-WorkForgeTunnelRuntimePaths + tunnel-supervisor.ps1 and macOS runtimePaths + tunnel-supervisor.mjs redirect it to tunnel.stderr.log. Read tail capped 256KiB; symlink/hardlink/redirected ancestors rejected. Snapshot lacks verified tunnel start time: Claude APPROVE for conservative stale/none endpoint. Optional PID ancestry proposal not adopted now: Windows executes through cmd.exe, so ppid is not tunnel PID and verified ancestry needs separate lifecycle contract. Pure parser covers log/stale/none but production intentionally never attests current session yet. macOS source/static only. Build, mode evidence 2 tests, authenticated HTTP tests passed.

2026-10-26 — Wave 10: I-32/I-35 implemented. task_delete requires exact SHA and DELETE_TASK; keeps history by default, safely validates history deletion targets. task_claim/task_release use CAS, random claim IDs, bounded TTL, expiry takeover and explicit owner/conflict checks; claims remain advisory. Claude completed task detail UI (I-37), mode badge (I-20), and TASK-26 HUD. I-26 remains fulfilled by strict env validation; I-39 is fulfilled through I-38 without a writable heartbeat.

### Final validation (2026-10-26)

- check:core: 113 tests passed, 3 platform skips; plugin package and macOS source/static checks passed. macOS live tunnel test skipped on Windows.
- Isolated source stdio: default 25 tools, argv read-only 14, read-only extras 16, multi-file/log-masking opt-in 27. Isolated portable plugin adapter: 25 tools. Temporary fixtures only; installed engine and credentials untouched.
- Windows full chain passed all functional, install-fixture, dashboard/API, privacy/security and recovery checks before its final production audit reported 8 existing dependency vulnerabilities. Those production findings were then corrected as described below; relevant checks rerun after update. The entire Windows chain was not repeated.
- No commit, public release, signing, real installation/tunnel reset, credential change or startup change performed.
- Production mode evidence intentionally remains stale/none until verified session-start evidence is available. Actual macOS hardware and ChatGPT client compatibility remain unverified.

### Production dependency audit remediation — Claude reviewed

Claude approved the exact-version update plan with five conditions. Adopted bounded lock updates without new overrides, registry signatures, lock-based clean reinstall, targeted security/schema checks, and license-declaration delta records. Alternative SDK patch fallback was not needed. SDK release-tag pages could not be fetched; compatibility was checked against installed SDK source and runtime tests (registerTool/outputSchema, disable/list_changed, stdio, zod v4 and response _meta).

- SDK 1.29.0 → 1.32.2; zod 4.4.3 → 4.6.7. Transitive packages updated only within declared ranges. npm ci --ignore-scripts passed.
- npm audit --omit=dev: 0 vulnerabilities (including moderate). npm audit signatures: 141 verified registry signatures, 35 verified attestations.
- Full development-tree audit still reports 5 findings in vitest/@vitest/mocker/vite/nanoid/source-map-js (3 high, 2 moderate). Development-tool upgrades are outside this production remediation; do not treat the complete dependency tree as audit-clean.
- Production package version/license declaration changes below. No package additions/removals or license-expression changes observed. This is a declaration comparison, not approval of redistribution. Existing third-party release approval does not cover this changed dependency set; explicit review/approval remains required.

| Package | Before | After | License before → after |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.29.0 | 1.32.2 | MIT → MIT |
| `body-parser` | 2.3.0 | 2.4.0 | MIT → MIT |
| `body-parser/node_modules/content-type` | 2.0.0 | 2.1.0 | MIT → MIT |
| `fast-uri` | 3.1.5 | 3.1.9 | BSD-3-Clause → BSD-3-Clause |
| `hono` | 4.13.0 | 4.13.14 | MIT → MIT |
| `ip-address` | 10.4.0 | 10.7.5 | MIT → MIT |
| `proxy-addr` | 2.0.7 | 2.0.8 | MIT → MIT |
| `qs` | 6.15.3 | 6.16.1 | BSD-3-Clause → BSD-3-Clause |
| `zod` | 4.4.3 | 4.6.7 | MIT → MIT |


### Reproducing isolated source/plugin smoke (Windows)

```powershell
npm run build
node scripts/test-isolated-stdio.mjs
```

The script creates temporary `workspace`, `state`, and `programs/versions/<package version>` directories. It sets `WORKFORGE_MCP_PROFILE_REGISTRY=<temp>/state/profile_registry.json`, `WORKFORGE_PORTABLE_STATE_ROOT=<temp>/state`, and `WORKFORGE_PORTABLE_PROGRAMS_ROOT=<temp>/programs` only in child processes. It copies built dist, the contract and Node executable, links the current dependency tree, and creates synthetic legacy install-manifest/pointer fixtures. It does not start a tunnel or install a release. It validates source stdio 25/14/16/27 tools and portable plugin adapter 25 tools, then removes only its verified temporary root. Latest run: ISOLATED_STDIO_TEST_OK.

`npm run smoke:plugin-stdio` without these overrides intentionally inspects the real installed engine. On this machine that older engine reports 12 tools, so comparison to the source's 25 fails. This is a known installed/source mismatch, not a passing live-install test; no installation update was made. The smoke command now explains this distinction before connecting.

Claude independently reproduced check:core (113 passed/3 skipped), dashboard/API, source stdio, security/privacy invariants, and production audit 0. Post-update focused filesystem/task tests passed (50 passed/1 platform skip), including schema-error non-disclosure, session lock rejection, and claim identity/expiry. No production dependency or source regression was found.
