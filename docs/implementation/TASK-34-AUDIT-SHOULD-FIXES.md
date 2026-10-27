# TASK-34 — 3중 감사 2단계(Should-fix) 18건 구현 설계

상태: Claude 설계 (2026-10-27). 구현 담당과 시점은 사용자 지시를 따른다.
근거: 2026-10-27 전체 레포 감사 3건(Claude 3개 에이전트, Codex pane, opencode pane)의 교차 검증. TASK-33(Must-fix 11건)은 `9653794`까지 반영됐다.
기준 커밋: `9653794` (main = origin/main). 아래 줄 번호는 이 커밋 기준이다.

18건 모두 코드에서 위치를 다시 확인했다. 각 항목은 **현상 → 원인 → 설계 → 테스트 → 완료 기준** 순서다.
"가장 작은 완전한 수정"이 원칙이다. 더 작은 방법을 찾으면 그쪽을 택하되 완료 기준은 지키고, 달라진 점을 보고한다.

## 공통 규칙

TASK-33과 같다.
- 항목마다 커밋 1개. 이 문서는 첫 커밋에 포함한다.
- 커밋 이메일은 `72366776+NotNull92@users.noreply.github.com`.
- `control-ui/app.js`는 LF, `.ps1`은 CRLF 정규화를 따른다.
- 이 PC에 portable 설치본을 만들지 않고, 실제 tunnel을 시작·정지하지 않는다.
- 테스트 임시 데이터는 `%TEMP%\wf34-*`에 둔다(경로가 짧아야 PowerShell 오류 줄바꿈 문제가 없다). 끝나면 삭제한다.
- push·공개 배포는 사용자 승인 후. 커밋까지만 한다.

**CI 교훈 (TASK-33):**
- 테스트에서 경로를 비교할 때는 `realpath`로 정규화한다. macOS는 `/var`→`/private/var`, Windows CI는 8.3 짧은 이름 때문에 같은 경로가 다르게 보인다.
- 오류 문구 단언은 플랫폼별 실제 출력으로 확인한다.
- 로컬 확인은 짧은 이름 TEMP(`(New-Object -ComObject Scripting.FileSystemObject).GetFolder(<긴 경로>).ShortPath`)로 한 번 돌려 본다.

## 구현 순서와 묶음

| 순서 | 항목 | 영역 | 왜 이 순서인가 |
|---|---|---|---|
| 1 | T1 레포 실행 시 레지스트리 기본값 | control-server | 이 PC 화면(작업 기록, 모드 배지)에 바로 보이는 문제 |
| 2 | T2 새로고침 후 버튼 고착 | app.js | Control 조작 불능 |
| 3 | T3 모드 배지 정확도 | stdio, server, control-server, app.js | 배지가 사실과 다르게 보임 |
| 4 | T4 둥근 따옴표 경로 | control-server | 특정 사용자 폴더에서 Control 전체 실패 |
| 5 | T5 CRLF 파일 줄바꿈 유지 | src/filesystem | 모든 줄이 바뀐 diff |
| 6 | T6 apply_patch 새 폴더 안 새 파일 | src/filesystem | 정상 패치 거부 |
| 7 | T7 apply_patch 빈 맥락 줄 | src/patch | 정상 패치 거부 |
| 8 | T8 shell_output 서로게이트 경계 | src/shell | 깨진 문자 |
| 9 | T9 read_text_stream 요청 범위만 디코딩 | src/reading | 불필요한 실패 |
| 10 | T10 shell_prune 범위 | src/shell, src/archive, src/tasks | 디스크 무한 증가 |
| 11 | T11 업데이트·롤백의 supervisor 판정 | WorkForge.Update, WorkForge.Portable | 옛 supervisor 잔존 |
| 12 | T12 Start-Process 핸들 고정 | tunnel-supervisor, start-tunnel | 종료 코드 소실, PID 재사용 오살 |
| 13 | T13 업데이트·삭제 동시 실행 잠금 | Update, Uninstall, Portable-Runtime | 두 Control 창 경쟁 |
| 14 | T14 실패한 삭제 재실행 | Uninstall | 복구 불가 |
| 15 | T15 Install.ps1 프로필 상한 | Install | 계약 불일치 |
| 16 | T16 macOS 상태 폴링의 원격 doctor | scripts/macos, control-server | 5초마다 키체인·원격 요청 |
| 17 | T17 Setup 도구 수 문구 | Setup | 오래된 정보 |
| 18 | T18 PowerShell 파일 I/O 헬퍼 통합 + flush | scripts/*.ps1, 플러그인 생성기 | 중복 5벌 + 정전 시 빈 파일 |

---

## T1. 레포(소스) 실행에서 작업 기록과 MCP 모드 배지가 뜨지 않음

**현상.** 레포의 `WorkForge Control.cmd`로 열면 "작업 기록을 조회할 수 없습니다"와 "MCP 모드 확인 불가"가 뜬다. 2026-10-27 미리보기 화면에서 실제로 확인했다.
이 PC는 레포 실행 방식이다.

**원인.** `scripts/control-server.mjs` 세 곳이 Windows에서 `process.env.WORKFORGE_MCP_PROFILE_REGISTRY`가 없으면 바로 `registry_invalid`를 돌려준다.
- 작업 기록 `:450-453`
- 모드 증거 `:494-495`
- 작업 상세 `:530-533`

이 환경 변수는 portable 실행에서만 설정된다(`Launch-Control.ps1:22`, `profile-registry.ps1:16`).
그런데 `loadProjectProfile`은 `registryPath`가 없으면 `<engineRoot>/runtime/profile_registry.json`을 기본값으로 쓴다(`src/profile.ts:145-147, :160-164`). PowerShell 런타임(`Get-WorkForgeRunsRoot`)도 같은 기본값을 쓴다.

**설계.**
1. 세 곳에서 Windows 분기는 환경 변수 값을 그대로 넘긴다. 값이 없으면 `undefined`로 넘겨 `loadProjectProfile`이 기본값을 쓰게 한다.
   - `registryPath`가 정의돼 있는데 절대 경로가 아니면 지금처럼 `registry_invalid`다. 이 검사는 `loadProjectProfile`도 하므로 중복 검사는 지워도 된다.
   - 구현: `const registryPath = isMacOS ? <기존 macOS 경로> : process.env.WORKFORGE_MCP_PROFILE_REGISTRY;` 다음에 `loadProjectProfile(profileId, registryPath ? { registryPath } : {})`.
2. `engineRoot`는 `dist/profile.js`의 `DEFAULT_ENGINE_ROOT`(= `toolRoot`)로 정해진다. 레포 실행에서 `toolRoot/runtime/profile_registry.json`이 실제 레지스트리인지 확인한다(이 PC 기준 맞음).
3. 레지스트리 파일이 없으면 지금처럼 `registry_invalid`로 끝나야 한다. 예외가 `unavailable(failureCode)`로 잡히는지 확인한다.

**테스트** (`scripts/test-control-work-api.mjs`). 환경 변수를 **설정하지 않은** 상태에서 다음을 확인한다.
- 임시 engineRoot의 `runtime/profile_registry.json`에 테스트 프로필을 두고 서버를 띄운다. 이렇게 하려면 `control-server.mjs`의 `toolRoot`와 dist 경로를 임시 루트로 바꿀 수 있어야 한다. 기존 테스트가 쓰는 방식이 있으면 따르고, 없으면 dist를 임시 engineRoot에 복사해 실행한다.
- `/api/work`가 `available: true`.
- `/api/mode`가 `registry_invalid`가 아님.
- 환경 변수가 상대 경로면 `registry_invalid`.

**완료 기준.** 이 PC의 레포 Control에서 작업 기록이 보이고, tunnel이 실행 중이면 모드 배지가 `log` 증거로 표시된다. 이것은 사용자 확인 항목으로 남긴다.

---

## T2. 작업 중에 새로고침하면 버튼이 계속 비활성으로 남음

**현상.** Doctor·Start·업데이트·삭제 미리보기가 서버에서 도는 중에 페이지를 새로고침하면 모든 버튼이 계속 비활성으로 남는다. 다시 새로고침해야 풀린다.
업데이트가 실패한 뒤라면 800ms 업데이트 폴링도 멈추지 않는다.

**원인.** `control-ui/app.js:1710-1719` `refreshStatus`가 서버의 `activeAction`을 보고 `setBusy(true)`를 호출한다. 이것이 로컬 플래그 `actionInFlight`(`:1168`, `:1266`)를 켠다.
그런데 5초 폴링(`:2106-2108`)과 탭 복귀 처리(`:2135-2137`)는 `actionInFlight`가 켜져 있으면 건너뛴다. 그래서 서버 작업이 끝나도 이 플래그를 끌 경로가 없다.

**설계.**
1. 서버가 알려 준 작업은 별도 변수 `serverAction`(문자열 또는 null)으로 둔다. `actionInFlight`는 "이 페이지가 직접 시작한 작업"에만 쓴다.
2. `refreshStatus`는 `serverAction = payload.activeAction || null`로 저장하고 표시를 갱신한다. `setBusy`를 호출하지 않는다.
3. 바쁨 표시와 버튼 비활성 조건을 `actionInFlight || serverAction`으로 바꾼다.
   - `updateButtons`(`:1272-1283`)
   - busy 배지(`setBusy` 안의 표시 부분을 `renderBusy()`로 분리)
   - 라벨 우선순위: 로컬 작업 라벨이 있으면 그것, 없으면 `labelState(serverAction)`
4. 폴링·탭 복귀·키보드 단축키의 가드는 `actionInFlight`만 본다. 서버 작업 중에도 상태를 계속 받아야 끝난 것을 알 수 있다.
5. 업데이트 진행 폴링(`:1821` 근처)은 진행 상태가 `completed`·`failed`이거나 서버 작업이 없어지면 `clearInterval`하는지 확인하고, 아니면 고친다.

**테스트** (`scripts/test-control-dashboard.mjs`의 vm 기반 렌더 테스트 패턴).
- `refreshStatus`에 `activeAction:'doctor'`를 주면 버튼이 비활성이고 `actionInFlight === false`다.
- 다음 응답에서 `activeAction:null`이면 버튼이 다시 활성이다.
- 폴링 가드가 `serverAction` 때문에 막히지 않는다.

---

## T3. MCP 모드 배지가 실제 세션과 다르게 보임

**현상 A.** `workstation_lock_read_only`로 세션을 잠가도 배지는 계속 "읽기·쓰기 · 도구 N개"다. 시작 시 기록된 posture 줄만 남아 있기 때문이다(Codex 감사).

**현상 B.** Start/Stop 직후 최대 약 50초 동안 배지가 이전 상태를 보여 준다.
- 서버 캐시가 20초다(`control-server.mjs:485`).
- UI 갱신 주기는 30초다(`app.js:2109-2111`).
- `runAction`이 모드 증거를 다시 읽지 않는다(`:1726-1745`).

**설계 A.**
1. `createServer`(`src/server.ts`)의 options에 `onSessionLock?: (posture: { toolMode: "read_only"; toolModeSource: "session_lock"; redaction: "on" | "off"; tools: number }) => void`를 추가한다.
   `workstation_lock_read_only` 핸들러(`:250-261`)가 도구를 비활성화한 뒤 `toolSet.size`로 호출한다.
2. `src/stdio.ts:43`의 posture 출력과 같은 형식으로 `onSessionLock`에서 `console.error("WorkForge MCP posture: " + JSON.stringify(...))`를 한 줄 쓴다.
   stderr 출력은 파일 쓰기가 아니다. 따라서 read-only 무쓰기 계약(I-39)과 충돌하지 않는다.
3. `parseModeEvidence`(`src/mode-evidence.ts:4-27`)는 이미 **마지막** posture 줄을 쓴다(`reverse().find`). `toolModeSource`는 무시하는데, 그대로 두거나 UI 표시에 쓰려면 반환값에 추가한다.
4. 한 tunnel에 MCP 세션이 여러 개면 마지막 줄이 이긴다. 배지 설명(tooltip/문구)에 "가장 최근 세션 기준"이라고 적는다.

**설계 B.**
1. `performAction`(`control-server.mjs:631-662`)의 `finally`에서 `modeEvidenceCache = null`.
2. `app.js` `runAction`의 마지막(성공·실패 모두)에서 `refreshModeEvidence()`를 호출한다.

**테스트.**
- `tests/server*.test.ts` 또는 기존 서버 테스트: `onSessionLock` 콜백이 `read_only`와 줄어든 도구 수로 호출된다.
- `tests/mode-evidence.test.ts`: read_write 줄 다음에 read_only 줄이 있으면 `toolMode: "read_only"`다.
- 대시보드 테스트: start 후 `/api/mode`가 캐시를 쓰지 않는다. 서버 테스트 모드에서 확인하기 어렵다면 코드 리뷰로 대신한다.

---

## T4. 설치 경로에 둥근 따옴표(`’`)가 있으면 Control 동작이 모두 실패

**현상.** PowerShell은 U+2018–U+201B를 작은따옴표로 취급한다. `C:\Example\O’Brien` 같은 경로에서는 `scriptPath` 인용이 깨져서 모든 동작이 실패한다.
감사에서 `'x’; Write-Output INJECTED; ’'`가 `INJECTED`를 출력하는 것까지 재현했다. 지금 인수 값은 상수와 검증된 profileId뿐이라 실제로 주입할 수 있는 경로는 경로 문자열 하나다.

**원인.** `scripts/control-server.mjs` `runPowerShell`의 `literal = value => \`'${String(value).replaceAll("'", "''")}'\``.

**설계.** `String(value).replace(/['\u2018-\u201B]/gu, '$&$&')`로 바꾼다. PowerShell 작은따옴표 문자열 안에서 이 문자들은 두 번 써서 이스케이프한다.

**테스트.** `test-control-dashboard.mjs`의 실제 PowerShell 어댑터 픽스처 파일 이름에 `’`를 넣고(예: `한글 ’ ' output.ps1`), 인수 값에도 `’; Write-Output INJECTED; ’`를 넣는다. 출력이 원문 그대로이고 `INJECTED`가 실행되지 않는지 확인한다.

---

## T5. CRLF 파일을 다시 쓰면 줄바꿈이 LF로 바뀜

**현상.**
- `read_text_file`은 줄을 나눠 LF로 이어서 돌려준다(`src/filesystem.ts:409`). 모델이 그 텍스트를 고쳐 `write_text_file`로 쓰면 CRLF 파일이 LF가 된다. diff에서 모든 줄이 바뀐 것으로 보인다.
- `replace_text`에서 `oldText`가 한 줄이고 `newText`가 여러 줄이면 CRLF 파일에 LF가 섞인다(`two\nextra\r\n`).

**원인.**
- `writeTextFile`(`:584-624`)은 입력을 그대로 인코딩한다.
- `replacementForCurrentText`(`:626-660`)의 CRLF 보정(`:649-655`)은 `oldText`에 줄바꿈이 있을 때만 동작한다.

**설계.** 공용 함수 하나를 둔다.
```ts
// A CRLF-only file keeps CRLF: model text arrives LF-joined from read_text_file.
function matchCrlf(currentText: string, text: string): string {
  return currentText.includes("\r\n") && !/(?<!\r)\n/u.test(currentText) ? text.replace(/(?<!\r)\n/gu, "\r\n") : text;
}
```
1. `writeTextFile`의 기존 파일 갱신 경로에서 `encodeUtf8(matchCrlf(current.text, input.content), current.hasBom)`.
2. `replacementForCurrentText`에서 `oldText`에 줄바꿈이 없을 때도 `newText`에 `matchCrlf(currentText, newText)`를 적용한다. 기존 CRLF 보정 분기는 그대로 둔다.
3. 혼합 줄바꿈이나 LF 파일은 바꾸지 않는다. 새 파일(`absent`)은 입력 그대로 쓴다.
4. `write_text_file`과 `replace_text`의 description에 "Line endings follow an existing CRLF-only file."를 한 줄 추가한다.
5. `replace_text_multi`·`apply_patch`도 같은 `replacementForCurrentText`를 쓰는지 확인한다. 쓰면 자동으로 적용된다.

**테스트** (`tests/filesystem.test.ts`).
- CRLF 파일 → `read_text_file` → 한 줄 수정 → `write_text_file`. 결과 바이트가 수정한 줄만 다르고 전부 CRLF다.
- 한 줄 `oldText`를 여러 줄 `newText`로 바꾼다. 결과에 bare `\n`이 없다.
- 혼합 줄바꿈 파일과 LF 파일은 입력이 그대로 기록된다.

---

## T6. `apply_patch`로 없는 폴더 안에 새 파일을 만들면 ENOENT

**현상.** `+++ b/newdir/file.ts`처럼 아직 없는 하위 폴더에 새 파일을 만드는 패치는 ENOENT로 실패한다(opencode 감사). Git이 만드는 일반적인 패치 형식이다.

**원인.** `resolveWriteTarget`(`src/filesystem.ts:524-535`)의 새 파일 경로가 `realpath(dirname(path))`를 부른다. 부모 폴더가 없으면 실패한다.
`writeTextFile`은 `createParents` 옵션으로 미리 `mkdir`하지만(`:592`), `replaceTextMulti`(apply_patch 경로)는 그런 단계가 없다.

**설계.**
1. `resolveWriteTarget`의 새 파일 분기는 `canonicalizeExistingAncestor(dirname(path))`(`src/path-policy.ts:23`)로 실제 부모 경로를 계산한다. `actualPath = resolve(canonicalParent, basename(path))`.
   경계 검증은 이미 `resolveAuthorizedWorkstationPath`가 조상 정규화로 했다.
2. `replaceTextMulti`의 커밋 단계에서, 새 파일 앞에 없는 부모 폴더가 있으면 다음 순서로 처리한다.
   1. 모든 검증이 끝난 뒤 `mkdir(parent, { recursive: true })`.
   2. 만든 뒤 `realpath(parent)`가 1에서 계산한 실제 부모와 같은지 다시 확인한다. 생성 도중 심볼릭 링크를 끼워 넣는 경쟁을 막기 위해서다.
   3. 다르면 그 파일을 쓰지 않고 실패한다.
   4. 롤백할 때는 이번 호출이 **새로 만든** 폴더만, 깊은 것부터 `rmdir`(비재귀)로 지운다. 비어 있지 않으면 남긴다.
3. 이 동작은 apply_patch에만 적용한다. `write_text_file`은 기존 `createParents` 옵션 의미를 유지한다.
   apply_patch description에 "creates missing parent directories for new files"를 추가한다.

**테스트.**
- `newdir/sub/file.ts` 새 파일 패치가 성공하고 폴더가 생긴다.
- 같은 패치의 다른 파일이 해시 불일치로 실패하면 새로 만든 폴더가 남지 않는다.
- 부모 경로가 다른 프로필을 가리키는 junction이면 거부한다(기존 경계 테스트 방식).

---

## T7. `apply_patch`가 빈 맥락 줄을 거부

**현상.** 빈 맥락 줄을 공백 한 칸(`" "`)이 아니라 빈 문자열(`""`)로 쓴 diff가 `Unsupported hunk record`로 실패한다. 모델 출력과 일부 도구가 이렇게 만들고, GNU patch는 받아들인다.

**원인.** `src/patch.ts:39-40`이 줄의 첫 글자가 `" " "+" "-"` 중 하나가 아니면 거부한다. `:33`은 "패치 마지막 빈 줄"만 따로 처리한다.

**설계.** hunk 본문 루프에서, 줄이 `""`이고 **패치의 마지막 줄이 아니면** `" "`(빈 맥락 줄)로 취급한다. 그 판단은 `:33`의 마지막 줄 처리 바로 다음에 둔다.
줄 수 집계(`oldCount`/`newCount`)가 그대로 맞으면, 잘못 해석한 경우는 이미 있는 "Hunk line counts do not match"로 걸러진다.

**테스트.**
- 빈 맥락 줄을 `""`로 쓴 패치가 `" "`로 쓴 패치와 같은 결과를 낸다.
- 줄 수가 맞지 않는 패치는 계속 거부된다.
- CRLF로 전달된 같은 패치도 성공한다(S7과 함께).

---

## T8. `shell_output` 페이지 경계에서 이모지가 반쪽으로 잘림

**현상.** `maxCharacters` 경계가 서로게이트 쌍(이모지 등) 사이에 오면 `"😀\ud83d"`처럼 짝 없는 서로게이트가 응답에 들어간다. Claude가 재현했다.

**원인.** `src/shell.ts:1004-1008` `pageText`는 단순 `slice`다. `read_text_file`(`src/filesystem.ts`)과 `read_text_stream`(`src/reading.ts:69`)은 끝의 상위 서로게이트를 지운다.

**설계.** `pageText`에서 `selected`가 상위 서로게이트(`\uD800-\uDBFF`)로 끝나고, 그 뒤에 글자가 더 있으면 마지막 한 글자를 빼고 `nextOffset`을 그만큼 앞으로 당긴다. 다음 페이지가 그 서로게이트부터 시작하므로 이모지가 온전히 넘어간다.
`maxCharacters`가 1이고 첫 글자가 상위 서로게이트면 빈 페이지가 무한 반복될 수 있다. 이 경우에는 한 글자를 더 포함해(쌍 전체 반환) 진행을 보장한다.

**테스트** (`tests/shell.test.ts`). 이모지 여러 개를 출력하는 작업을 실행한다.
- `maxCharacters: 1, 2, 3`으로 이어 읽은 결과를 합친 것이 원문과 같다.
- 어떤 페이지에도 짝 없는 서로게이트가 없다.

---

## T9. `read_text_stream`이 요청하지 않은 뒤쪽 깨진 바이트 때문에 실패

**현상.** 첫 줄만 요청해도, 같은 64 KiB 읽기 덩어리 뒤쪽에 잘못된 UTF-8 바이트가 있으면 첫 줄도 돌려주지 못하고 오류가 난다. Codex가 재현했다.

**원인.** `src/reading.ts:45-52`가 64 KiB 버퍼 전체를 `TextDecoder("utf-8", { fatal: true })`(`:18`)로 한 번에 디코딩한 뒤 `consume`한다. 요청 범위가 끝났어도(`done`) 이미 디코딩 단계에서 예외가 난다.

**설계.** 읽은 버퍼를 `0x0A`(LF) 바이트 경계로 잘라 조각마다 `decoder.decode(piece, { stream: true })` 후 `consume`한다. 각 조각 뒤에 `done`이면 즉시 멈춘다.
- LF 바이트는 UTF-8 다중 바이트 문자 안에 나타나지 않으므로 이렇게 잘라도 안전하다. 스트리밍 디코더라 문자 경계도 유지된다.
- 요청 범위 **안**에 잘못된 바이트가 있으면 지금처럼 오류다.
- `scannedBytes`는 실제로 읽은 바이트 기준을 유지한다. 의미가 바뀌지 않게 한다.

**테스트** (`tests/filesystem.test.ts` 또는 reading 테스트).
- `"first\n" + 잘못된 바이트 + "\nthird\n"`에서 `startLine:1, maxLines:1`은 `first`를 돌려준다.
- `startLine:2`는 오류다.
- 긴 파일(64 KiB 초과)에서 경계를 넘는 다중 바이트 문자가 제대로 이어진다.

---

## T10. `shell_prune`이 가장 오래된 기록에 닿지 못함 (+ 체크포인트 1000개 상한)

**현상 A.** `recentArchiveEntries`(`src/archive.ts:55-84`)는 **최신** 2000개만 남기고 오래된 것을 버린다. `pruneShellJobs`(`src/shell.ts:962-1000`)는 그 안에서만 지울 대상을 찾는다.
작업 폴더가 2000개를 넘고 최신 2000개가 모두 보존 기간 안이면, 오래된 기록은 영원히 지워지지 않아 디스크가 계속 늘어난다.

**현상 B.** `referencedShellJobs`(`src/tasks.ts:118-129`)는 체크포인트가 1000개를 넘으면 `TASK_REFERENCES_UNAVAILABLE`을 던진다. 그래서 기본값(`keepReferencedByTasks` 켜짐)에서 `shell_prune`이 항상 실패한다.

**설계.**
1. `recentArchiveEntries`에 `order: "newest" | "oldest"` 인수를 추가한다(기본 `"newest"`, 기존 호출 불변). `"oldest"`면 정렬 방향만 반대로 해서 가장 오래된 `keep`개를 남긴다.
   지금 코드는 항목마다 배열 전체를 정렬한다(최대 2만 번 × 2000개 정렬). 이참에 "길이가 keep을 넘을 때만 마지막 하나를 버리는 삽입" 정도로 줄여도 된다. 필수는 아니다.
2. `pruneShellJobs`:
   - `keepLatest > 0`이면 `order:"newest", keep:keepLatest`로 한 번 스캔해 **보호 ID 집합**을 만든다.
   - 삭제 후보는 `order:"oldest", keep:2000`으로 스캔하고 오래된 것부터 본다. 보호 집합·실행 중(`jobs`)·참조된 ID는 건너뛴다.
   - 나머지 조건(cutoff, ownership_lost 유예, tombstone 삭제)은 그대로다.
   - 결과의 `scanLimited`는 두 스캔 중 하나라도 제한되면 true다.
3. `referencedShellJobs`는 체크포인트 이름 목록을 상한 없이 끝까지 본다. 체크포인트 파일 수는 `task_delete`로 관리되므로 `opendir` 순회 비용만 든다.
   다만 `scannedEntries` 2만 개 상한(`archive.ts:68`)에 걸리면 지금처럼 `TASK_REFERENCES_UNAVAILABLE`이 맞다(안전 쪽). 1000이라는 별도 상한만 없앤다.

**테스트** (`tests/shell.test.ts`).
- 작업 기록 2050개를 만든다. 실제 작업 대신 기존 테스트의 archive 픽스처 방식으로 만든다.
- 가장 오래된 50개만 보존 기간 밖이게 mtime과 status를 맞춘다.
- `dryRun` 후보가 그 50개다.
- 체크포인트 1001개가 있어도 `shell_prune`이 동작하고 참조 ID를 보호한다.

---

## T11. 터널이 재시도 대기 중일 때 업데이트하면 옛 supervisor가 남음

**현상.** supervisor가 재시도 대기(backoff, 2/10/30초)나 시작 중(최대 20초)일 때 Apply하면 옛 supervisor가 정지되지 않는다.
- 그 상태에서는 프로필이 "실행 중 아님"으로 판정되기 때문이다.
- 옛 supervisor는 `versions\<old>`에서 tunnel을 계속 재시작한다.
- 새 버전의 stop/start는 "does not match the tunnel supervisor"로 실패한다. supervisor 스크립트 경로가 버전마다 다르기 때문이다.

**원인.**
- `scripts/WorkForge.Update.ps1:178-186` `Get-WorkForgeUpdateTunnelRunning`이 `$Snapshot.running`(tunnel 프로세스 생존)만 본다.
- `Invoke-WorkForgePortableRollback`(`scripts/WorkForge.Portable.ps1:377-386`, `Portable-Runtime.ps1 -Action Rollback`)은 tunnel을 전혀 확인하지 않는다.

**설계.**
1. `Get-WorkForgeUpdateTunnelRunning`은 `([bool]$Snapshot.running -or [bool]$Snapshot.supervised)`를 돌려준다. 업데이트의 정지·재시작 경로가 supervisor만 살아 있는 경우도 정상적으로 정지하는지 `stop-tunnel.ps1` 흐름으로 확인한다.
2. `Invoke-WorkForgePortableRollback`은 활성화 전에 등록된 모든 프로필(`Get-WorkForgeUpdateProfileRecords`와 같은 열거)에 대해 같은 판정을 한다. 하나라도 실행 중이면 `throw "Stop all WorkForge tunnels before rolling back."`
   `WorkForge.Portable.ps1`은 플러그인으로 복제되는 독립 모듈이다(T18 참고). 그래서 판정 함수를 직접 부르지 말고, 롤백 진입점(`Portable-Runtime.ps1`)에서 검사하는 쪽이 의존성상 맞다. 둘 중 의존성을 덜 늘리는 쪽을 택하고 보고한다.

**테스트.**
- `scripts/test-update.ps1`의 가짜 tunnel-status(`:64-66`)에 `running:false, supervised:true` 경우를 추가한다. 업데이트가 그 프로필을 정지 대상으로 잡는지 확인한다.
- 롤백 테스트에 같은 상태를 주면 거부된다.

---

## T12. supervisor가 띄운 프로세스의 핸들을 잡지 않음

**현상.** `Start-Process -PassThru`에 출력 리디렉션을 함께 쓰면 반환 객체가 OS 핸들을 갖지 않는다. 감사에서 확인했다: `haveProcessHandle=False`, `ExitCode` 비어 있음, `$p.Handle` 접근 후에는 정상.

결과는 세 가지다.
1. `recovery.json`의 `lastExitCode`가 항상 null이고, 로그가 "exited with code ;"로 찍힌다.
2. `HasExited`가 매번 PID로 프로세스를 다시 연다. tunnel PID가 재사용되면 죽은 tunnel을 살아 있다고 보고 복구하지 않는다(`tunnel-supervisor.ps1:230`).
3. 정지 때 재사용된 PID에 `taskkill /T /F`를 실행해 무관한 프로세스 트리를 죽일 수 있다(`:242-244`, `:253-255`, `start-tunnel.ps1:111, :139-140`).

**설계.** 다음 두 곳에 `$null = $Process.Handle` 한 줄을 넣는다. 이유를 한 줄 주석으로 남긴다: `# Pin the OS handle so ExitCode survives and the PID cannot be reused under us.`
- `scripts/tunnel-supervisor.ps1:213`의 `Start-Process ... -PassThru` 직후 (`$TunnelProcess`)
- `scripts/start-tunnel.ps1:94` 직후 (`$SupervisorProcess`)

**테스트** (`scripts/test-recovery-policy.ps1` 또는 작은 새 테스트). 같은 형태의 `Start-Process -RedirectStandardOutput ... -PassThru`로 `exit 3` 하는 PowerShell을 띄운다. `$null = $p.Handle` 뒤 종료를 기다리면 `ExitCode`가 3이다. 기존 supervisor 테스트가 `lastExitCode`를 검사하면 그 값이 null이 아닌지도 추가한다.

---

## T13. 업데이트와 삭제가 동시에 돌 수 있음

**현상.** "작업 중" 플래그는 Control 서버 프로세스마다 따로 있고, Control을 열 때마다 새 서버가 뜬다. 그래서 Control 창 두 개에서 Apply를 누르면 둘 다 통과한다.
B 창의 롤백이 A 창의 tunnel을 멈추고 **옛 버전**을 다시 활성화하는데, A 창은 "업데이트 성공"을 보고한다. 삭제와 업데이트가 겹쳐도 같은 문제가 생긴다.

**설계.**
1. 이름 있는 뮤텍스 `Local\WorkForgeMcp-Engine` 하나를 업데이트 적용, 롤백, 삭제가 함께 쓴다.
   - 잡는 곳:
     - `Invoke-WorkForgeTransactionalUpgrade`(`WorkForge.Update.ps1:208`) 시작
     - `Portable-Runtime.ps1 -Action Rollback`
     - `Uninstall.ps1` 본문 시작(WhatIf·미리보기는 제외)
   - `WaitOne(0)`로 즉시 시도한다. 실패하면 `throw "Another WorkForge update, rollback or uninstall is running."`
   - `finally`에서 `ReleaseMutex()`와 `Dispose()`를 한다. `AbandonedMutexException`은 획득으로 본다. 기존 `Enter-WorkForgeTunnelOperationLock`(`WorkForge.TunnelRuntime.ps1:114-145`)이 같은 방식이다.
2. 세 진입점의 모듈 의존성이 서로 다르다. `Update`는 Portable만, `Uninstall`은 profile-registry를 쓴다. 그래서 공용 함수는 T18의 새 공용 모듈에 둔다. T18보다 먼저 구현한다면 각 진입점에 6줄 인라인으로 두고 T18에서 합친다.
3. Control 서버는 지금처럼 자체 `activeAction` 검사를 유지한다(같은 창 연타 방지). 뮤텍스는 창 사이 경쟁만 막는다.

**테스트** (`scripts/test-update.ps1`, `scripts/test-uninstall.ps1`). 테스트 안에서 같은 이름의 뮤텍스를 먼저 잡은 뒤 다음을 확인한다.
- 업데이트 적용과 삭제가 즉시 위 메시지로 실패한다.
- 임시 portable 루트가 그대로다.
- 뮤텍스를 놓으면 정상 진행한다.

---

## T14. 중간에 실패한 삭제를 다시 실행할 수 없음

**현상.** 4단계(프로필 레지스트리 제거, `Uninstall.ps1:378-380`)가 6단계(로컬 데이터 삭제, `:389-408`)보다 먼저 실행된다.
6단계에서 편집기나 터미널이 폴더를 잡고 있어 실패하면, 오류 화면은 "다시 실행하세요"라고 한다. 그런데 다시 실행하면 `Get-WorkForgeProfile`(`:340`)이 "registry missing / not registered"로 실패한다. 남은 데이터와 엔진을 도구로는 더 이상 지울 수 없다.

**설계.** 사전 검증을 느슨하게 하지 **않는다**. 대신 **되돌릴 수 없는 등록 해제를 가능한 한 마지막으로** 미룬다. 재실행 시 사전 검증(매니페스트·마커·레지스트리)이 그대로 통과하게 만드는 것이다.

1. 단계 순서:
   - 지금: 1 확인 → 2 동의 → 3 tunnel 정지 → 4 레지스트리 → 5 바로가기 → 6 로컬 데이터 → 7 엔진
   - 바꾼 뒤: 1 → 2 → 3 → **4 로컬 데이터** → **5 바로가기** → **6 레지스트리** → 7 엔진
   - 단계 이름과 번호 표시(`Start-WorkForgeStage -Number`)를 함께 바꾼다.
2. 로컬 데이터 단계 안에서는 프로필 매니페스트와 마커를 **가장 마지막에** 지운다.
   - **KeepWorkspace**: `ArtifactDirectory`(로그·증거, 잠기기 쉬움)를 먼저, `ProfileDirectory`(매니페스트 포함)를 마지막에 지운다.
   - **RemoveEverything**: 작업 공간의 하위 항목 중 `tools\workforge-mcp`와 `workstation.marker`를 제외한 나머지를 먼저 지운다. 그다음 `tools\workforge-mcp`, 마지막으로 마커와 작업 공간 루트를 지운다.
     각 삭제는 기존 `Remove-UninstallPath`의 안전 검사를 그대로 거친다.
3. 마지막 프로필일 때의 공유 런타임 정리(`.env.local`, `SharedRuntimeRoot`)는 레지스트리 단계 **뒤**로 옮긴다. 레지스트리 파일이 공유 런타임 안에 있으면 순서가 특히 중요하다.
4. 재실행 시 이미 지워진 경로는 `Remove-UninstallPath`가 "없음"으로 건너뛰는지 확인한다. 없으면 건너뛰게 한다.
5. 남는 위험: 레지스트리 쓰기 자체가 데이터 삭제 **뒤에** 실패하면 재실행이 매니페스트 검사에서 막힌다. 원자적 JSON 쓰기 한 번이라 드물다. 그 경우의 오류 메시지에 수동 복구 방법을 한 줄 넣는다(레지스트리에서 해당 항목 제거).

**테스트** (`scripts/test-uninstall.ps1`).
- KeepWorkspace에서 `ArtifactDirectory` 안 파일을 열린 상태(쓰기 핸들)로 두고 삭제를 실행하면 실패한다. 이때 레지스트리 항목과 매니페스트가 그대로 남아 있다.
- 핸들을 닫고 재실행하면 완료된다.
- RemoveEverything도 같은 시나리오로 확인한다.
- 단계 golden/출력 단언이 있으면 새 순서로 갱신한다.

---

## T15. Install.ps1만 프로필 상한이 256

**현상.** 계약(`workforge-contract.json:5`), `src/profile.ts:37`, `WorkForge.ProfileRuntime.ps1:401`, macOS setup은 모두 최대 128이다. 그런데 `scripts/Install.ps1:205, :255`만 256이다.
129번째 프로필 설치가 "성공"하지만, 결과 레지스트리를 모든 로더가 거부해서 전체 프로필이 멈춘다.

**설계.** 두 곳의 `256`을 `$script:WorkForgeContract.MaxProfiles`로 바꾼다. `Install.ps1`은 이미 `WorkForge.Contract.ps1`을 dot-source한다(`:41`).

**테스트.** `scripts/test-install-modes.ps1` 또는 `test-multi-profile`에 다음을 추가한다. 기존 레지스트리에 128개가 있을 때 129번째 설치가 레지스트리를 바꾸지 않고 "too many profiles"로 실패한다. 픽스처 생성 비용이 크면 `Merge-ProfileRegistry`만 직접 호출하는 단위 검사로 대신한다.

---

## T16. macOS 상태 폴링이 5초마다 키체인과 원격 doctor를 실행

**현상.** `scripts/macos/tunnel-status.mjs:33-37`은 tunnel이 로컬 ready면 매 호출마다 키체인에서 키를 읽고 `tunnelDoctor`(원격 control plane 요청, 최대 10초)를 실행한다.
대시보드는 5초마다 상태를 요청한다(서버 캐시 3초). 대시보드를 켜 두는 동안 원격 인증 요청과 프로세스 생성이 계속 쌓인다. Windows는 로컬 `/healthz`·`/readyz`만 본다.

**설계.** macOS의 `ready`는 "로컬 ready && control plane 건강"이라는 의미를 유지한다. `scripts/test-macos-tunnel.mjs:216`이 인증 실패 시 `ready:false`를 기대하므로 그대로 둔다. 다만 원격 확인 **빈도**만 줄인다.
1. `tunnel-status.mjs`에 `--skip-control-plane` 인수를 추가한다. 주면 `tunnelDoctor`를 건너뛰고 `controlPlaneHealthy: null`을 출력한다.
2. `control-server.mjs`의 macOS 상태 경로는 control plane 결과를 `{ value, at, pid }`로 캐시한다.
   - 캐시가 60초 이내이고 tunnel pid가 같으면 `--skip-control-plane`으로 호출한다. 이때 `ready = localReady && cached.value`.
   - 그렇지 않으면 전체 호출로 갱신한다.
   - Start/Stop/Doctor 뒤에는 캐시를 지운다.
3. 사용자가 누르는 Doctor는 지금처럼 항상 원격 확인을 한다.

**테스트** (`scripts/test-macos-tunnel.mjs`, macOS CI에서만).
- `--skip-control-plane` 호출이 키체인과 doctor를 부르지 않는다. 가짜 `security`/tunnel-client 호출 횟수로 확인한다.
- 인증 실패 시 첫 상태는 `ready:false`(기존 단언 유지).
- 대시보드로 상태를 연속 3번 요청하면 원격 doctor는 1번만 호출된다.

---

## T17. 설치 완료 화면의 도구 수가 "12"로 오래됨

**현상.** `scripts/Setup.ps1:265` `Tools = "12 available after connection"`. 지금 기본은 25개이고 옵션에 따라 달라진다.

**설계.** 숫자를 빼서 다시 낡지 않게 한다. `Tools = "Available after connection (see workstation_context)"`.
`tests/golden`과 setup 출력 단언에 이 문구가 없음을 확인했다(`rg "available after connection"` 결과는 Setup.ps1뿐). 다국어 UI 문자열이면 `WorkForge.UI.ps1`의 문구 체계를 따른다.

---

## T18. PowerShell 파일 I/O 헬퍼 통합 + 디스크 flush

**현상 A (중복).** 거의 같은 원자적 쓰기 함수가 5벌 있다.
- `WorkForge.Portable.ps1:131` `Write-WorkForgePortableAtomicJson`
- `Uninstall.ps1:96` `Write-UninstallAtomicJson`
- `Install.ps1:92` `Write-AtomicUtf8`
- `WorkForge.Update.ps1:188` `Write-WorkForgeUpdateAtomicBytes`
- `tunnel-supervisor.ps1:30` `Write-RecoveryState` 안의 원자적 쓰기

SHA-256(`Portable.ps1:94`, `ProfileRuntime.ps1:3`)과 엄격한 UTF-8 JSON 읽기(`Install.ps1:76`, `Portable.ps1:76`, `ProfileRuntime.ps1:63`)도 겹친다. 한 곳을 고치면 다섯 곳을 같이 고쳐야 한다.

**현상 B (정전).** 원자적 쓰기는 임시 파일을 쓴 뒤 디스크로 flush하지 않고 `File.Replace`/`rename`한다. 업데이트·설치 직후 정전되면 `current.json`이나 레지스트리가 0바이트가 될 수 있다.
`profile-registry.ps1:10-11`과 `Setup-Entry.ps1:65`가 `current.json`을 무조건 읽기 때문에, 그렇게 되면 새로 받은 Setup도 실패한다.

**설계.**
1. 새 모듈 `scripts/WorkForge.FileIO.ps1`에 다음 세 함수를 둔다.
   - `Get-WorkForgeFileSha256`
   - `Read-WorkForgeStrictJson` (UTF-8 BOM 없음 엄격, 크기 상한, 링크 거부. 기존 세 구현의 가장 엄격한 조건을 합친다)
   - `Write-WorkForgeAtomicBytes` (임시 파일을 `FileStream`으로 쓰고 `Flush($true)` → `File.Replace` 또는 `Move`. 실패 시 임시 파일 정리)
   - JSON용 `Write-WorkForgeAtomicJson`은 `ConvertTo-Json` 후 위 함수를 부르는 한 줄 래퍼로 둔다.
2. 의존성 그래프. 모든 진입점이 이 모듈을 갖게 하려면 다음 두 곳에서 dot-source한다.
   - `WorkForge.Contract.ps1`: Install과 profile-registry 경유로 Uninstall·supervisor·runtime이 쓴다.
   - `WorkForge.Portable.ps1`: Update와 플러그인이 쓴다.
   - 두 번 로드돼도 함수 재정의만 일어나므로 무해하다.
3. `WorkForge.Portable.ps1`은 플러그인으로 복제된다(`scripts/Generate-Plugin.mjs:76`).
   - `Generate-Plugin.mjs`가 `bin/WorkForge.FileIO.ps1`도 내보내게 한다.
   - `Portable.ps1`의 dot-source 경로가 플러그인 `bin`에서도 맞는지 확인한다(`$PSScriptRoot` 기준이면 맞다).
   - `test-plugin-package.mjs --check`가 새 파일을 검사하는지 확인한다.
4. 릴리스에도 반영한다.
   - `Build-Release.ps1`의 `$RuntimeScripts`
   - `test-release-package.ps1` 필수 목록
   - `test-security-invariants.ps1` 파일 목록
5. 기존 함수는 지우고 호출부를 새 이름으로 바꾼다. 동작 차이가 있으면 더 엄격한 쪽을 택하고 보고한다.
   - 예: 한 구현만 BOM을 거부했다면 모두 거부.
   - 단, 기존 사용자 파일을 읽지 못하게 만드는 변경이면 멈추고 보고한다.
6. `uninstall-finalizer.ps1`은 의도적으로 독립 실행 스크립트다. 자체 SHA 함수를 유지한다.

**테스트.**
- `check:windows` 전체 통과
- 플러그인 생성 검사 통과
- 릴리스 패키지 필수 목록 갱신
- 새 모듈 단위 검사 1개: 원자적 쓰기 도중 예외가 나면 원본이 그대로 남고 임시 파일이 없다.

**완료 기준.** 원자적 쓰기·SHA·엄격 JSON 읽기 정의가 저장소에 각각 1개다(finalizer 예외). `rg "^function .*Atomic" scripts`로 확인한다.

---

## 최종 검증

1. `npm run build` → `npm test` → `npm run check:windows`. PowerShell 테스트는 UTF-8 콘솔에서 돌린다.
2. 짧은 이름 TEMP로 vitest를 한 번 더 돌린다(TASK-33 CI 교훈).
3. 다음 항목은 새 테스트가 **수정 전 코드에서 실패**하는지 확인한다: T2, T4, T5, T6, T7, T8, T9, T10, T15.
4. `git status`가 깨끗하고 `%TEMP%\wf34-*`가 남지 않는다.
5. 보고 형식: 항목별로 다음을 적는다.
   - 커밋 해시
   - 바꾼 파일
   - 추가 테스트
   - 설계와 달라진 점(있으면 이유)

   끝에 `check:windows` 요약과 남은 위험을 붙인다.

## 범위 밖 (TASK-35 후보, 이번에 하지 않음)

감사에서 나온 나머지 작은 항목이다.
- `tunnel.log`·`runtime\logs\*.jsonl`·옛 `versions\*`·남은 staging 폴더가 계속 커짐(이 PC의 `tunnel.log`는 3.6MB)
- `NUL`·`aux.json`·끝이 점·공백인 Windows 파일 이름 생성 허용
- 크래시 뒤 PID 재사용으로 쓰기 잠금이 영구 고착됨
- 셸 기록 저장이 실패하면 작업이 영원히 미완료로 남음
- 재시도 상태(`backoff` 등)가 ko/ja/zh로 번역되지 않음
- 최근 활동에 같은 오류가 반복해서 쌓임
- 스크린리더가 5초마다 최근 활동을 다시 읽음
- 숨긴 탭에서 유휴 종료된 뒤 안내가 부족함
- 업데이트할 것이 없을 때 Apply가 "완료" 화면을 보여 줌
- 삭제 확인 문구 입력란에서 Enter를 누르면 대화상자가 닫힘
- 0바이트 자격 증명 파일을 Configure-Tunnel로 복구할 수 없음
