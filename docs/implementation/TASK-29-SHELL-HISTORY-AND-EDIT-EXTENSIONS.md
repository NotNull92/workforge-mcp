# TASK-29 — 실행 기록·편집 확장 (I-10 ~ I-19)

상태: **Claude 상세 설계 v1. Codex 구현 대상.** 공통 규칙은 TASK-28 머리말과 같다.

---

## I-10 / I-13 `shell_list` 필터 (status, cwd 하위 포함)

**API** `shell_list` 입력 추가
- `status: z.array(z.enum(["running","completed","failed","cancelled","ownership_lost"])).min(1).max(5).optional()`
- `cwdScope: z.enum(["exact","tree"]).default("exact")` (`cwd`가 있을 때만 의미. tree는 `isPathWithinOrEqual(filterCwd, job.cwd)`)

**후보 창 문제** 현재 `recentArchiveEntries`는 mtime 상위 `limit*2`만 남긴다. 필터가 있으면 일치 항목이 적어 결과가 비는 문제가 생긴다.
- `recentArchiveEntries`에 선택 인자 `keep`(기본 `limit*2`)를 추가한다. 필터가 하나라도 있으면 `keep = min(500, max(limit*10, 100))`.
- 후보를 mtime 순서로 검증하면서 필터 일치가 `limit`개가 되면 멈춘다. 검증 상한은 `keep`.
- 출력 추가: `filterApplied: boolean`, `inspectedCandidates: number`. 후보를 다 보기 전에 멈췄거나 `keep`에 닿았으면 `truncated: true`(기존 의미 유지: "더 있을 수 있음").

**테스트** failed만 필터해서 오래된 실패 기록이 최근 성공 기록 뒤에 있어도 찾음; tree 필터가 하위 디렉터리 포함, exact는 미포함; Windows 대소문자; 필터 없는 기존 결과 불변.

---

## I-11 / I-12 실행 label과 명령 기준 찾기 (manifest v2)

**목적** 같은 cwd의 build/test 실행을 구분하고, 명령 원문을 저장하지 않으면서 "이 명령으로 실행한 기록"을 찾는다.

**API**
- `shell_start` 입력 `label: z.string().min(1).max(120).optional()`. 저장 전에 `containsRedactionMarker` 또는 redactor `redactionCount > 0`이면 `SHELL_LABEL_SECRET`으로 **실행 전에** 거부(TASK-24의 CHECKPOINT_SECRET와 같은 방식). 제어 문자 거부.
- 서버가 `commandSha256 = sha256("workforge-shell-command:v1\0" + command)`를 계산해 저장. 명령 원문은 여전히 저장하지 않는다.
- `shell_list` 입력 `command: z.string().min(1).max(1024*1024).optional()` → 서버가 같은 방식으로 해시해 일치하는 기록만(I-10 후보 창 규칙 적용). `labelContains: z.string().min(1).max(120).optional()` (대소문자 무시 substring).
- 상태 출력(`shell_status`, `shell_list` 항목, start 응답)에 `label: string | null`, `commandSha256: string | null` 추가. v1 기록은 둘 다 null.

**저장·마이그레이션**
- `persistedShellStatusSchema`를 `version: 1 | 2`의 union으로 바꾼다. v2 = v1 필드 + `label: string|null` + `commandSha256: sha256`. 새 기록은 v2로 쓴다.
- `archiveStatus`의 start/terminal 일치 검사에 `version`, `label`, `commandSha256` 일치 추가.
- 하위 호환: 새 코드는 v1·v2를 모두 읽는다. **이전 엔진으로 되돌리면 v2 기록은 `manifest_invalid`로 보인다**(README 업그레이드 노트에 명시).

**신뢰 경계** commandSha256은 추측 가능한 짧은 명령을 확인하는 데 쓰일 수 있다(같은 OS 사용자 디스크 접근 전제). 명령에 비밀을 넣지 말라는 기존 안내를 유지하고, 고엔트로피 비밀은 해시로 복원되지 않음을 문서화.

**테스트** label 저장·조회·필터; label에 synthetic token → 실행 전 거부, 디렉터리 미생성; 같은 명령 두 번 → command 필터로 둘 다; v1 fixture 읽기 호환; start/terminal label 불일치 → manifest 오류 code.

---

## I-14 shell 기록 정리 `shell_prune` (D-1)

**API** 쓰기 도구(read-only 미등록, `contextRevision` 필수, `localWriteAnnotations`)
- 입력: `olderThanDays` 1~3650(필수), `keepLatest` 0~1000(기본 50), `maxDeletes` 1~500(기본 100), `keepReferencedByTasks` boolean(기본 true), `dryRun` boolean(기본 **true**), `confirm: z.literal("DELETE_SHELL_RECORDS").optional()` — `dryRun:false`일 때 필수.
- 출력: `dryRun`, `candidates: [{ id, updatedAt, trackingState, reason }]`(최대 maxDeletes), `deleted: string[]`, `skipped: [{ id, code }]`, `scannedEntries`, `scanLimited`.

**대상 규칙**
- 현재 프로세스 `jobs` map에 있는 ID는 절대 제외.
- `archived_terminal`: `updatedAt < now - olderThanDays`.
- `ownership_lost`: 다른 프로세스에서 아직 실행 중일 수 있으므로 추가 조건 `createdAt + timeoutMs + 1시간 < now`도 만족해야 한다(최대 timeout 24시간 → 실행 중인 작업은 대상이 될 수 없음).
- mtime 최신 `keepLatest`개는 항상 보존.
- `keepReferencedByTasks`: `listTasks`와 같은 탐색으로 checkpoint의 `shellJobIds`를 모아(최대 checkpoint 1,000개) 보존.

**삭제 절차** 기록마다 `assertSafeArchivedJobRoot` 재검사 → runtime root 안에서 `.prune-<uuid>`로 rename → `rm -r`. rename 실패는 `skipped`(code `busy`/`unsafe`). 하나의 실패가 다른 기록 삭제를 막지 않는다. 취소 신호는 항목 사이에 확인.

**승인 경계** 실행 증거를 지우는 기능. D-1 결정 전에도 구현·등록은 하되, 실제 삭제는 매 호출 `confirm` 문자열이 필요하다. 모델이 `confirm`을 넣기 전에 사용자 확인을 받으라는 문장을 description에 넣는다.

**테스트** dryRun은 아무것도 지우지 않음; confirm 없이 dryRun:false 거부; 최근 ownership_lost 보존; task가 참조하는 기록 보존; keepLatest 보존; symlink된 job 디렉터리 skip; read-only 미등록.

---

## I-15 edit별 새 파일 줄 범위

**API** `replace_text` 출력 `ranges: z.array(z.object({ index: z.number(), startLine: z.number(), endLine: z.number() }))`. 입력 순서(index)대로. 단일 형태는 index 0 하나.
- startLine = 교체 결과가 시작하는 줄(1-based), endLine = 교체 결과의 마지막 줄. 빈 newText는 `endLine = startLine - 1`(삭제를 뜻함).
- 계산: 원본 범위를 start 순으로 정렬해 누적 오프셋 차이를 적용한 새 텍스트 위치를 구하고, 새 텍스트에서 그 위치 앞의 줄바꿈(`\r\n|\n|\r`)을 한 번의 순회로 센다. reader와 같은 줄 분할 규칙.

**테스트** 여러 edit의 줄 번호가 read_text_file로 읽은 실제 줄과 일치; CRLF 파일; 삭제 edit.

---

## I-16 `expectedCount` 다중 위치 교체

**API** `edits[]`(및 단일 형태)에 `expectedCount: z.number().int().min(1).max(1000).default(1)`.
- 1이면 기존 유일성 의미 그대로.
- N>1이면 needle의 **겹치지 않는 모든 위치**를 찾고(자기 겹침 발생 시 `edits[i]: overlapping occurrences` 오류), 개수가 정확히 N이어야 한다. 아니면 `edits[i]: expected N occurrences, found M`(M은 N+1에서 셈 중단).
- CRLF/LF 변형 선택: exact 개수가 N이면 exact, 아니면 기존 순서대로 변형 중 개수가 N인 첫 변형.
- 각 위치가 별도 범위가 되고 기존 edit 간 겹침 검사를 그대로 거친다. `editsApplied`는 edit 수, 출력 `replacementsApplied`(위치 수) 추가. ranges(I-15)는 위치마다 하나씩, 같은 index 반복.

**테스트** 이름 바꾸기 3곳; 개수 불일치 오류 메시지; 자기 겹침; 다른 edit과 겹침 거부.

---

## I-17 `dryRun` 편집 미리보기

**API** `replace_text` 입력 `dryRun: z.boolean().default(false)`. 출력 `dryRun: boolean`.
- true면 lease 없이 원본을 읽어 expectedSha256 확인 → 모든 검증·조합 → **쓰지 않고** `{ path, previousSha256, sha256(예상), byteLength, editsApplied, replacementsApplied, ranges, dryRun: true }` 반환.
- contextRevision 요구는 동일(쓰기 도구 계약 일관성). marker guard도 동일.

**테스트** dryRun 후 파일 바이트 불변·예상 sha256이 실제 적용 결과와 같음; 검증 실패는 실제 적용과 같은 오류.

---

## I-18 atomicReplace의 POSIX mode 보존 (버그)

**문제** `atomicReplace`가 임시 파일을 `0o600`으로 만들고 rename하므로 POSIX에서 기존 파일의 권한(실행 비트·그룹 읽기)이 사라진다. `write_text_file`, `replace_text`, task checkpoint 쓰기가 모두 영향.

**수정** `src/filesystem.ts` atomicReplace에서 임시 파일 sync 후, rename 전에:
```ts
if (process.platform !== "win32") {
  const { mode } = await stat(path);
  await chmod(temporaryPath, mode & 0o7777);
}
```
- 소유자(uid/gid)는 보존하지 않는다(권한 없는 chown 불가) — ARCHITECTURE에 명시.
- 새 파일 생성(`writeNewFileExclusive`)의 0o600 정책은 이번 범위에서 바꾸지 않는다.

**테스트** POSIX 전용(Windows skip): 0755 파일을 replace_text·write_text_file 후 0755 유지; 0644 유지.

---

## I-19 여러 파일 편집과 patch (D-2)

**목적** 관련된 여러 파일 변경을 한 번에 검증·적용. 파일시스템 수준의 진짜 트랜잭션은 불가능하므로 **검증은 전부 먼저, 적용은 최선형 rollback**으로 설계하고 그 한계를 계약에 드러낸다.

**등록 조건** `WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT`가 `1`일 때만, read-write 모드에서만 등록. 값은 `parseReadOnlyMode`와 같은 엄격 파싱(미설정/0/1, 그 외 시작 실패). `workstation_context`에 `multiFileEdit: boolean` 추가.

### `replace_text_multi`
- 입력: `contextRevision`, `files: [{ path, expectedSha256, edits: (replace_text edits와 동일, expectedCount 포함) }]` 1~10개, 같은 실제 경로 중복 금지(resolveWriteTarget 후 비교), 전체 oldText+newText UTF-8 합계 16MiB.
- 처리:
  1. 모든 경로 검증·`resolveWriteTarget`(hardlink 거부) → 실제 경로 정렬 순서로 lease 획득(교착 방지).
  2. 각 파일 읽기·해시 확인·edit 검증·새 바이트 계산(파일별 16MiB). 하나라도 실패하면 아무것도 쓰지 않고 `files[i].edits[j]: ...` 오류.
  3. 백업: `engineRoot/runtime/multi-edit/<operationId>/<n>.orig`에 원본 바이트 저장 + `journal.json`(경로, 원본 sha, 새 sha).
  4. 모든 임시 파일 쓰기·sync(I-18 mode 보존 포함) → 각 파일 최신 해시 재확인 → 순서대로 rename.
  5. k번째 rename 실패 시 이미 바뀐 파일들을 백업에서 같은 atomic 방식으로 복원하고 `rollback: "complete"`; 복원도 실패하면 `rollback: "failed"`와 journal 경로를 오류에 포함(자동 재시도·재생 없음).
  6. 성공 시 백업 디렉터리 삭제.
- 출력: `files: [{ path, previousSha256, sha256, byteLength, editsApplied, ranges }]`, `operationId`.

### `apply_patch`
- 입력: `contextRevision`, `patch`(unified diff, 최대 4MiB), `expectedSha256: Record<path, sha256>`(패치가 건드리는 모든 파일, 새 파일은 `"absent"`).
- 파서: `--- a/x`/`+++ b/x`/`@@` hunk만 지원. 각 hunk를 `oldText = 문맥+삭제줄`, `newText = 문맥+추가줄`, `expectedCount: 1` edit로 변환(줄 번호는 무시하고 내용으로 위치 결정 → 문맥이 유일해야 함). 새 파일은 write로, 파일 삭제·rename·binary hunk는 거부.
- 변환 결과를 `replace_text_multi` 엔진으로 적용.

**승인 경계** D-2 결정 전에는 env가 없으므로 등록되지 않는다. 사용자가 env를 켜는 것은 설치/런처 변경이 아니라 실행 환경 선택이며, 실제 설치 적용은 별도 승인.

**테스트** 두 파일 중 하나의 edit 실패 → 둘 다 불변; rename 중간 실패 주입(테스트 hook) → rollback complete로 원본 복원; lease 충돌; env 미설정 시 도구 미등록; patch 문맥 중복 → 오류; 새 파일 생성; 삭제 hunk 거부.

---

## 완료 조건 (TASK-29 전체)

- build·전체 테스트·두 smoke 통과. 새 도구: `shell_prune`(쓰기), D-2 env가 켜진 경우만 `replace_text_multi`·`apply_patch`. 기본 도구 수에는 D-2 도구를 세지 않는다.
- README en/ko·ARCHITECTURE에 manifest v2 하위 호환, prune 규칙, multi-file의 비트랜잭션 한계 명시.

## 구현 기록

2026-10-26 — Wave 1: I-18: atomicReplace preserves POSIX mode before rename; both writer paths have 0755/0644 regression coverage (Windows skip). uid/gid are not preserved.
2026-10-26 — Wave 2: I-15/I-17/I-16 implemented: output ranges, lease-free dryRun, expectedCount with overlap checks. Output byte budget checked while composing to prevent repeated-edit expansion before allocation. Build passed; filesystem tests 26 passed / 1 POSIX skip. CRLF trailing newline belongs to the preceding line in range output.
2026-10-26 — Wave 3: I-10/I-13 status and cwdScope filters, bounded wider keep window, filterApplied/inspectedCandidates implemented. Build passed; filesystem/shell/resume 55 passed / 2 platform skips; Control API passed.

2026-10-26 — Wave 4: I-11/I-12 manifest v2 labels and command fingerprints; v1 compatibility and start/terminal identity matching. Build passed; shell/tasks 25 passed, 1 platform skip. Secret labels rejected before archive creation.

2026-10-26 — Wave 10: I-14/I-19 implemented. shell_prune defaults to dryRun, requires per-call DELETE_SHELL_RECORDS for deletion, skips retained/referenced/active/recent uncertain jobs. Multi-file edits and unified patches are disabled unless explicitly opted in; validate all inputs before sorted leases and staged publication, retain recovery journal on failure and attempt reverse rollback. New-file publication uses exclusive hardlink, with exclusive-write fallback and publicationWarnings on unsupported filesystems. Journal cleanup failures return fixed cleanupWarning plus journalPath. Tests cover partial rename rollback, ambiguous patches, new files, deletions rejected, and unsupported hardlink fallback. This is best-effort recovery, not a cross-file transaction; recovery journals may contain original secrets.
