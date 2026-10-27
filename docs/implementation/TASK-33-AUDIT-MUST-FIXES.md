# TASK-33 — 3중 감사 Must-fix 11건 구현 설계

상태: Claude 설계 → Codex 구현 인계 (2026-10-27)
근거: 2026-10-27 전체 레포 감사 3건(Claude 3개 에이전트, Codex pane, opencode pane)을 교차 검증한 결과.
기준 커밋: `9901352` (main = origin/main)

이 문서의 11건은 모두 재현 또는 코드 확인이 끝난 것이다. 각 항목은 **현상 → 원인 → 설계 → 테스트 → 완료 기준** 순서다.
설계는 "가장 작은 완전한 수정"을 기준으로 했다. 더 작은 방법을 찾으면 그쪽을 택하되, 완료 기준은 그대로 지킨다.

## 공통 규칙

- 항목마다 커밋 1개(`S1`…`S11` 순서 권장, 이 문서는 첫 커밋에 포함). 커밋 메시지에 항목 번호를 적는다.
- 커밋 이메일 `72366776+NotNull92@users.noreply.github.com` (Privacy Gate).
- `control-ui/app.js`는 LF 유지. `.ps1`은 저장소 규칙(CRLF 정규화)을 따른다.
- 이 PC에 portable 설치본을 만들거나 갱신하지 않는다. 실제 tunnel을 시작·정지하지 않는다. 테스트는 임시 루트(`WORKFORGE_PORTABLE_*` override, `%TEMP%\workforge-task33-*`)만 쓰고, 끝나면 임시 데이터를 삭제한다.
- 자격 증명·tunnel 프로필·레지스트리·로그·릴리스 아카이브를 커밋하지 않는다.
- push와 공개 배포는 사용자 승인 후. 커밋까지만 한다.
- 기존 테스트가 새 동작과 충돌하면 테스트 의도를 유지하는 쪽으로 고친다. 테스트를 지워서 통과시키지 않는다.

## 구현 순서

| 순서 | 항목 | 영역 | 위험 |
|---|---|---|---|
| 1 | S1 PowerShell CLIXML 오류 | control-server | 회귀(9901352 이전 e153d53에서 유입), 모든 Control 오류가 읽히지 않음 |
| 2 | S2 경로 정규식 ReDoS | src/filesystem | read-only에서도 서버 정지 |
| 3 | S3 Git lazy fetch 명령 실행 | src/inspect, src/resume | read-only 고정 명령 약속 위반 |
| 4 | S8 inspect_run Git 루트 검증 | src/inspect | 프로필 격리 우회 (S3와 같은 파일) |
| 5 | S9 UNC/디바이스 경로 우회 | src/workstation | 프로필 격리 우회 |
| 6 | S10 shell_output 페이지 단위 마스킹 | src/shell, src/server | 비밀값 노출 |
| 7 | S7 apply_patch CRLF | src/patch | 기능 실패 |
| 8 | S4 로컬 세션 탈취 | control-server | 다른 로컬 사용자가 tunnel·삭제 조작 |
| 9 | S5 PID 재사용으로 시작·정지·삭제 불가 | PowerShell runtime | 복구 불가 상태 |
| 10 | S6 finalizer가 실행 중 엔진을 반쯤 삭제 | uninstall-finalizer | 설치본 전체 고장 |
| 11 | S11 macOS CLI 제거 | scripts/macos | 고아 프로세스, 레지스트리 경쟁 |

---

## S1. Control이 PowerShell 오류를 CLIXML 원문으로 표시

**현상.** e153d53 이후 Control의 시작·정지·Doctor·업데이트·삭제 실패 메시지가
`#< CLIXML <Objs …><S S="Error">…_x000D__x000A_</S>` 형태로 보인다. Claude가 직접 재현했다.

**원인.** `scripts/control-server.mjs:327-336` `runPowerShell`이 `-EncodedCommand`로 바뀌었다. stderr가 리디렉션된
상태에서 `powershell.exe -EncodedCommand`는 error·progress 스트림을 CLIXML로 직렬화해 stderr에 쓴다
(`-OutputFormat Text`로도 막히지 않음). `runChildScript`(`:261-325`)는 이것을 그대로 오류 문자열로 쓴다.
`scripts/test-control-dashboard.mjs`의 `-Throw` 검사는 `includes('한글 예외')`만 확인해서 이스케이프된 문자열도 통과했다.

**설계.**
1. 래퍼 명령 맨 앞에 `$ProgressPreference = 'SilentlyContinue';`를 넣어 progress 레코드(Write-Progress, Invoke-WebRequest 등)를 없앤다.
2. `runChildScript`의 stderr 줄 처리(`handleStderrLine` 직전)에 CLIXML 디코더를 넣는다. 이 디코더는 `runPowerShell` 경로에만
   적용해도 되고, 모든 자식에 적용해도 무해하다(일반 텍스트 줄은 그대로 통과).
   - 줄이 정확히 `#< CLIXML`이면 버린다.
   - 줄이 `<Objs `로 시작하면 그 줄의 모든 `<S S="Error">…</S>`와 `<S S="warning">…</S>`(대소문자 무시) 본문을 꺼낸다.
     progress `<Obj S="progress">`와 그 밖의 객체는 버린다.
   - 꺼낸 본문은 XML 엔티티(`&lt; &gt; &amp; &quot; &apos;` 및 `&#N;`/`&#xH;`)를 먼저 풀고, 그 다음 `_xHHHH_`를 해당 문자로 바꾼다
     (`_x000D__x000A_` → CRLF). `_x005F_`는 `_`다.
   - 결과를 `\r?\n`으로 나누고, 끝 공백을 지우고, 빈 줄을 버린 뒤 각 줄을 원래 `handleStderrLine`에 넘긴다.
     `onStderrLine`(업데이트 진행률 `WORKFORGE_UPDATE_PROGRESS`)은 `[Console]::Error.WriteLine`으로 쓰여 CLIXML이 아니므로 영향이 없다. 그래도 테스트로 확인한다.
   - 한 `<Objs …>` 줄이 청크 경계로 잘려 와도 지금의 줄 버퍼(`stderrRemainder`)가 완성된 줄만 넘기므로 따로 처리할 필요는 없다. 확인만 한다.
3. Write-Error는 PowerShell 형식 꼬리(`At line:… + CategoryInfo …`)가 붙지 않는다. CLIXML에는 메시지 본문만 들어 있다. 이전 `-File` 시절보다 메시지가 짧아지는 것은 의도된 개선이다.

**테스트** (`scripts/test-control-dashboard.mjs`의 실제 PowerShell 어댑터 블록 확장).
- 기존 `-Throw`, `-Fail` 경우에 `assert(!message.includes('CLIXML') && !message.includes('_x000D_') && !message.includes('&lt;'))`.
- 픽스처에 `[switch]$WriteError`(`Write-Error '한글 <오류> & "따옴표"'; exit 3`)와 `Write-Warning` 경우를 추가한다.
  오류 메시지가 원문(`한글 <오류> & "따옴표"`) 그대로 나오고 종료 코드 3이 전파되는지 확인한다.
- 픽스처에 `Write-Progress -Activity x -PercentComplete 50` 한 줄을 추가해도 stderr가 비어 있는지 확인한다.
- `WORKFORGE_UPDATE_PROGRESS` 줄이 `onStderrLine`으로 그대로 오는 기존 검사를 유지한다.

**완료 기준.** 레지스트리가 없는 임시 상태에서 `/api/start`가 실패할 때, 오류 문자열이 `WorkForge profile registry is missing…` 문장으로 시작하고 XML 흔적이 없다.

---

## S2. `search_files` 경로 모드 정규식이 서버 전체를 멈춤 (ReDoS)

**현상.** `mode:"path", regex:true`에서 `(.+)+\u0000`은 경로 1개(34자)에 114초, `^(a+)+$`은 28자에 7초가 걸린다.
이 동안 `timeoutMs`·취소·다른 MCP 요청이 모두 멈춘다. 이 도구는 read-only에서도 등록된다.

**원인.** `src/filesystem.ts:196-203` `compilePathQuery`가 JS `RegExp(query, "iu")`를 만들고, `:250-256` `consumeRecord`가
ripgrep stdout 콜백 안에서 동기로 `test()`를 실행한다. JS 정규식은 역추적 엔진이라 시간 상한이 없다.
참고로 content 모드 정규식은 이미 ripgrep(Rust regex, 선형 시간)으로 평가된다. path 모드만 JS 문법을 쓰는 것도 불일치다.

**설계.** path 모드 + `regex:true`일 때만 정규식 평가를 두 번째 ripgrep 프로세스로 옮긴다. path 모드 리터럴 검색과 content 모드는 바꾸지 않는다.
1. **1단계(후보 수집).** 지금처럼 `rg --files --null`을 실행하되, path+regex일 때는 `consumeRecord`가 필터 없이 후보 경로만 모은다.
   상한은 기존 `MAX_SEARCH_OUTPUT_BYTES`(4 MiB)와 `stopOnOutputLimit` 그대로다. 출력 한도에 걸리면 지금처럼 `output_limit`로 보고한다.
2. **2단계(필터).** 후보 목록을 `match` 옵션에 따라 레코드로 만든다. `path`면 `resolve(cwd, record)`의 전체 경로, `basename`이면 basename이다.
   레코드들을 NUL로 이어 stdin으로 넘기고 다음을 실행한다.
   `rg --no-config --null-data --line-number --ignore-case --color never --no-heading -e <query> -`
   - `--null-data`는 레코드 구분자를 NUL로 만든다. `--line-number`가 돌려주는 번호는 1부터 시작하는 레코드 순번이므로 후보 배열로 되돌린다.
     출력 형식(`N:content\0`)과 `^`/`$` 앵커가 레코드 단위로 동작하는지 먼저 확인한다. 다르게 동작하면 `--json` 출력의 `line_number`를 쓴다.
   - 상한: `timeoutMs`는 1단계와 2단계가 **공유**한다(남은 시간 = 전체 − 1단계 경과). `maxResults`에 도달하면 `onStdoutChunk`에서 true를 돌려 즉시 멈춘다(`result_limit`).
   - 정규식 문법 오류(rg 종료 코드 2)는 지금과 같이 `stoppedBecause:"error"`, `truncated:true`, `warning`에 rg stderr를 담는다.
     기존 테스트 `tests/filesystem.test.ts:424`(`query:"["`)가 계속 통과해야 한다.
3. `compilePathQuery`의 regex 분기는 삭제한다. 리터럴 분기는 그대로 둔다.
4. 도구 설명(`src/server.ts`의 `search_files` description)과 README의 path regex 설명이 JS 문법을 가정하면 "ripgrep(Rust) regex 문법, 대소문자 무시"로 고친다.
   역참조·lookaround는 지원하지 않는다고 적는다.

**테스트** (`tests/filesystem.test.ts`).
- `a`×40 + `!` 이름의 파일을 만들고 `query:"^(a+)+$"`와 `"(.+)+\\u0000"`(두 패턴 모두)로 path regex 검색을 한다. 2초 안에 끝나고 결과가 0건이다.
  타이머 기반 단언은 CI 편차를 고려해 넉넉하게 잡는다.
- 정상 경로: `query:"search\\.txt$"`, `match:"basename"`, 대소문자 다른 쿼리(`SEARCH`)가 기존처럼 일치한다.
- `maxResults` 경계: 후보 3개 중 `maxResults:2`이면 `result_limit`.
- 1단계와 2단계를 합쳐 `timeoutMs`를 넘지 않는다. 가능하면 `runProcess` spy로 두 번째 호출의 `timeoutMs`가 남은 시간인지 본다.

**완료 기준.** 병적 패턴이 서버 이벤트 루프를 막지 않는다. 기존 검색 테스트 전부 통과.

---

## S3. read-only Git 도구가 partial clone에서 저장소 설정 속 명령을 실행

**현상.** partial clone(`--filter=blob:none`)에서 `inspect_run`의 `git_show_stat`/`git_diff_commits_stat`(그리고 `project_resume`)이
빠진 객체를 원격에서 지연 다운로드(lazy fetch)한다. 그 과정에서 `.git/config`의 `remote.<name>.uploadpack`이나 `core.sshCommand`가 실행된다.
감사 에이전트가 표식 파일이 생기는 것으로 재현했다. 다운로드는 `.git`에도 쓴다.

**원인.** `src/inspect.ts:24-27`과 `src/resume.ts:72-81`(`runGit`)이 fetch 계열을 막는 설정 없이 Git을 실행한다.

**설계.**
1. 두 파일이 같은 고정 Git 인수를 쓰도록 공용 상수를 하나 둔다. 위치는 `src/resume.ts`나 새 작은 모듈 중 기존 import 방향을 해치지 않는 쪽.
   - 인수: `["--no-pager", "-c", "core.fsmonitor=false", "-c", "protocol.allow=never"]`
   - 환경 변수: `GIT_NO_LAZY_FETCH: "1"`, 기존 `GIT_OPTIONAL_LOCKS: "0"`, `GIT_TERMINAL_PROMPT: "0"`
   - `protocol.allow=never`가 실제 차단 장치다(모든 transport 거부). `GIT_NO_LAZY_FETCH`는 Git 2.44+에서만 듣지만 무해하니 함께 둔다.
2. `inspect.ts`는 기존 `-c diff.ignoreSubmodules=all`을 유지한다.
3. 객체가 없어서 실패하면 Git은 0이 아닌 종료 코드와 stderr를 낸다. 지금처럼 `exitCode`/`stderr`로 돌려준다. 실패를 숨기지 않는다.

**테스트** (`tests/resume.test.ts` 또는 inspect 테스트 파일).
- 원본 저장소 A(커밋 2개) → `git clone --filter=blob:none --no-checkout file://A B`로 partial clone을 만든다.
- B의 `remote.origin.uploadpack`을 표식 파일을 만드는 스크립트로 설정한다. Git for Windows는 sh로 실행하므로 `sh -c 'touch MARKER; exec git-upload-pack "$@"' --` 형태를 쓴다.
  플랫폼별로 필요하면 분기한다.
- B에서 `inspectRun({ preset:"git_show_stat", revision:<A의 커밋> })`과 `getProjectResume`(readOnlyExtras lite 경로)을 호출한다.
  표식 파일이 생기지 않아야 한다. 결과는 오류여도 된다.
- 로컬 `file://` clone이 filter를 지원하지 않는 환경이면 `uploadpack.allowFilter=true`를 A에 설정한다.

**완료 기준.** read-only 추가 도구가 어떤 경우에도 transport를 띄우지 않는다.

---

## S8. `inspect_run`이 실제 Git 루트의 프로필 경계를 검증하지 않음

**현상.** `project_resume`은 `git rev-parse --show-toplevel`로 얻은 실제 루트를 `resolveAuthorizedWorkstationPath(…, "tree")`로 검증한다
(`src/resume.ts:283-291`). `inspect_run`은 요청 경로만 검증한다(`src/inspect.ts:24`). 상위 폴더(예: 사용자 홈)에 `.git`이 있으면
Git이 위로 올라가 다른 프로필을 포함한 저장소의 이력을 보여 줄 수 있다.

**설계.**
1. `resume.ts`의 루트 해석·검증 부분(빈 루트 거부 → `realpath` → `resolveAuthorizedWorkstationPath(context, root, "tree")` →
   작업 디렉터리가 루트 안에 있는지 확인)을 작은 함수 `resolveAuthorizedRepositoryRoot(context, workingDirectory, signal?)`로 뽑는다.
   `project_resume`은 기존 `unavailableResult` 형태를 유지해야 하므로, 함수는 루트를 반환하거나 사유를 담은 결과를 돌려주는 형태로 설계한다.
2. `inspectRun`은 preset 실행 전에 이 함수를 호출한다. 실패하면 Git preset을 실행하지 않고 오류를 던진다
   (기존 inspect 오류 처리와 같은 방식). `rev-parse`에도 S3의 고정 인수와 환경 변수를 쓴다.

**테스트.** 바깥 디렉터리에 `git init`을 하고, 그 안에 primary 프로필 루트와 foreign 프로필 루트를 둔다
(primary에는 자체 `.git` 없음). `inspectRun({ path: primary, preset:"git_log" })`이 cross-profile 거부로 실패하고 Git 출력이 반환되지 않는다.
primary가 자체 저장소면 기존처럼 동작한다.

---

## S9. UNC·디바이스 경로로 다른 프로필 차단을 우회

**현상.** `C:\…\<다른 프로필 루트>\package.json`은 거부되는데 `\\localhost\C$\…\<다른 프로필 루트>\package.json`은 읽힌다.
읽기 전용 모드의 읽기 도구 포함 모든 경로 도구에 해당한다.

**원인.** `src/workstation.ts:87-103` `assertManagedProjectBoundary`는 어휘(prefix) 비교다. UNC 경로와 그 `realpath`
(`canonicalizeExistingAncestor`, `src/path-policy.ts:23`)는 `C:\` 형태가 아니므로 prefix 비교에 걸리지 않는다.
`\\?\C:\…`(장경로 접두사)도 같은 방식으로 빠질 수 있다. 구현 전에 재현으로 확인한다.

**설계.** `resolveAuthorizedWorkstationPath`(`:118-128`)에서, Windows이고 현재 프로필 외 managed 프로필이 하나라도 등록돼 있으면,
요청 경로나 정규화 경로 중 하나라도 `\\`로 시작할 때 거부한다. 대상은 UNC, `\\?\`, `\\.\`이다.
- 오류 문구: `Cross-profile path denied: UNC and device paths are not allowed while other WorkForge profiles are registered.`
- 다른 프로필이 없으면(단일 프로필) 기존 동작을 유지한다. 네트워크 공유 작업을 막지 않기 위해서다.
- 정규화 경로도 검사해야 junction·symlink가 UNC를 가리키는 경우까지 막는다.
- 이 함수를 거치는 모든 호출(읽기·검색·쓰기·셸 cwd·inspect)에 자동 적용된다. 이 함수를 거치지 않는 경로 처리가 있는지 `rg "resolveWorkstationPath\("`로 확인한다.

**테스트** (`tests/workstation.test.ts`, Windows 전용 `it.runIf`).
- 다른 프로필이 등록된 픽스처에서 `\\?\<foreign>\file`이 거부되는지 확인한다. 공유 없이도 항상 재현 가능하다.
- `\\localhost\C$\<foreign 경로>`는 접근 가능할 때만 검사한다. 관리 공유가 꺼진 CI면 skip 사유를 남긴다.
- 단일 프로필 픽스처에서 `\\?\<primary>\file` 읽기가 기존대로 되는지(또는 의도적으로 막는다면 그 결정을 문서화).

---

## S10. `shell_output`을 작은 페이지로 읽으면 비밀값 마스킹이 우회됨

**현상.** `maxCharacters:1`(또는 5)로 오프셋을 옮겨 가며 읽으면 `ghp_…` 토큰과 알려진 환경 비밀값이 마스킹 없이 나온다. read-only에서도 오래된 로그로 가능하다.

**원인.** `src/shell.ts:1004-1008` `pageText`가 원문을 먼저 자르고, `src/server.ts:173`의 `redact`(`responseFor`)가 잘린 조각마다 따로 마스킹한다.
조각에는 비밀값 패턴 전체가 없으니 걸리지 않는다. 로그 파일 자체는 D-5(디스크 로그 마스킹)가 꺼져 있으면 원문이다.

**설계.**
1. `getShellOutput`(`src/shell.ts:1010`)에 선택 인수 `redactText?: (text: string) => string`을 추가한다. stdout·stderr 전체 문자열을 **먼저** `redactText`로 바꾼 다음 `pageText`에 넘긴다.
2. `src/server.ts`의 `shell_output` 핸들러는 `redactText: (text) => redact(text).value`를 넘긴다. `redaction === "off"`(D-4)면 지금 정의대로 identity가 된다.
   `responseFor`의 기존 마스킹은 그대로 두어 이중 안전장치로 쓴다. 이미 마스킹된 마커는 다시 바뀌지 않는다는 것을 확인한다.
3. 오프셋과 `totalCharacters`는 **마스킹된 텍스트 기준**이 된다. 같은 프로세스에서 마스킹은 결정적이므로 페이지가 일관된다.
   `shell_output` description에 "offsets refer to the redacted text"를 추가한다.
4. 성능: 마스킹 대상은 스트림당 최대 32 MiB(`MAX_LOG_BYTES_PER_STREAM`)다. 페이지마다 전체를 마스킹하는 비용이 문제되면,
   완료된(archived_terminal) 작업에 한해 `(id, stdoutSha256, stderrSha256)` 키로 마지막 1건만 메모리에 캐시한다. 측정 후 필요할 때만 넣는다.
5. 경계: 페이지 끝이 마스킹 마커 중간에서 잘리는 것은 허용한다. 마커는 비밀이 아니다.

**테스트** (`tests/shell.test.ts`).
- 환경 비밀값과 `ghp_` 형태 토큰을 출력하는 셸 작업을 실행한다(기존 테스트의 knownSecrets 주입 방식을 쓴다).
- `maxCharacters:1`과 `5`로 처음부터 끝까지 이어 읽은 문자열에 비밀값 원문이 없어야 한다. 한 번에 읽은 결과와 이어 읽은 결과가 같아야 한다.
- 실행 중(attached)과 완료(archived) 양쪽에서 확인한다.

---

## S7. `apply_patch`가 CRLF로 전달된 패치를 항상 거부

**현상.** `"--- a/a.txt\r\n+++ b/a.txt\r\n@@ -1,1 +1,1 @@\r\n-x\r\n+y\r\n"`이 `Invalid unified hunk header.`로 실패한다. Claude가 `dist/patch.js`로 재현했다.
Windows에서 만들어진 diff와, CRLF로 텍스트를 보내는 모델 출력이 모두 실패한다.

**원인.** `src/patch.ts:6` `patch.split("\n")`. 파일 헤더만 `\r`을 지우고(`headerPath`), hunk 헤더·본문·`\ No newline at end of file` 비교는 `\r`이 남은 채 실패한다.

**설계.** 파싱 전에 `patch.replace(/\r\n/gu, "\n")`로 줄 끝을 정규화한다. 파일 내용의 CRLF는 적용 단계(`replaceTextMulti` → `src/filesystem.ts:619-626`의
CRLF 인지 매칭)가 처리한다. 따라서 대상 파일의 줄 끝은 유지된다. `headerPath`의 `\r` 제거는 남겨도 되고 지워도 된다(정규화 후 무의미).

**테스트** (`tests/filesystem.test.ts`의 apply_patch 블록).
- LF 파일에 CRLF 전송 패치를 적용하면 성공하고, 결과는 LF다.
- CRLF 파일에 LF 전송 패치와 CRLF 전송 패치를 각각 적용하면 둘 다 성공하고, 결과 파일은 CRLF를 유지한다(바이트 비교).
- `\ No newline at end of file`가 들어간 CRLF 패치도 성공한다.

---

## S4. 같은 PC의 다른 프로세스가 대시보드 세션을 얻음

**현상.** `GET /`가 누구에게나 세션 쿠키를 준다(`scripts/control-server.mjs:721-722, 739`). 브라우저가 아닌 클라이언트가 `GET /` 후
위조 `Origin`으로 POST하면 Host·Origin·세션 검사를 모두 통과한다. 같은 PC의 다른 Windows 사용자도 루프백 포트를 스캔해
tunnel 시작이나 `RemoveEverything`을 실행할 수 있다. 확인 문구 게이트는 클라이언트가 보내는 값이라 막지 못한다. 감사 에이전트가 재현했다.

**설계.**
1. 서버 시작 시 `launchToken = randomBytes(32).toString('base64url')`를 만든다. 브라우저를 여는 URL과 stdout의 ready 줄에 `/?k=<launchToken>`을 붙인다.
   macOS는 `/usr/bin/open`, Windows는 `cmd /c start "" <url>`이다. `k` 값에 cmd 특수문자가 없는지 확인한다(base64url은 `-_`만 씀).
2. `GET /` 처리:
   - `k`가 `launchToken`과 같으면(`timingSafeEqual`) 세션 쿠키를 설정하고 `303 Location: /`로 보낸다. 주소창과 기록에서 토큰을 지우기 위해서다.
     토큰은 **1회용**으로 즉시 무효화한다.
   - 유효한 세션 쿠키가 이미 있으면 index를 그대로 준다(새로고침).
   - 둘 다 아니면 index 대신 짧은 401 HTML을 준다. 4개 언어 정적 문구가 필요 없도록 영어 한 문장으로 쓴다:
     "Open WorkForge Status from its launcher." 응답 헤더와 CSP는 기존 `commonHeaders`를 쓴다.
3. 쿠키에서 `Max-Age=1800`을 뺀다(세션 쿠키). 서버가 꺼지면 토큰도 사라지므로 수명 제한이 필요 없다. 감사에서 따로 나온
   "30분 뒤 모든 요청 401" 문제도 이것으로 함께 해결된다.
4. 정적 자산(`/app.js`, `/style.css`, 이미지)은 비밀이 아니므로 세션 없이 두어도 된다. `/api/*`는 지금처럼 세션이 필요하다.
5. `lastRequestAt = Date.now()`(`:729`)를 `requireLocalHost`·세션 검사를 통과한 요청에서만 갱신하도록 옮긴다. 인증 안 된 요청이 유휴 종료를 막지 못하게 하기 위해서다.
6. `Launch-Control.ps1`, `WorkForge Control.cmd`, `WorkForge Control.command`, macOS 런처가 URL을 직접 조립하지 않는지 확인한다.
   직접 조립한다면 토큰이 붙은 URL을 쓰도록 맞춘다.
7. 테스트 모드 READY 줄(`WORKFORGE_CONTROL_TEST_READY`)에 `launchToken`을 포함한다. 기존 테스트의 `GET /` 쿠키 획득을 `GET /?k=…`로 바꾼다.

**테스트** (`scripts/test-control-dashboard.mjs`, `scripts/test-control-work-api.mjs`).
- 토큰 없는 `GET /`: 401, `Set-Cookie` 없음.
- 잘못된 토큰: 401.
- 올바른 토큰: 303 + `Set-Cookie`(Max-Age 없음, HttpOnly, SameSite=Strict). 같은 토큰을 두 번째로 쓰면 401.
- 쿠키 없는 `POST /api/start`(Origin 위조 포함): 401.
- 인증 안 된 요청이 `lastRequestAt`을 갱신하지 않는다. 테스트 모드 유휴 시간(30초)으로 검증할 수 있으면 넣고, 비용이 크면 코드 리뷰로 대신한다.

**완료 기준.** 브라우저 런처 외의 로컬 프로세스는 `/api/*`를 호출할 수 없다. 사용자는 기존처럼 Control을 열면 바로 쓸 수 있다.

---

## S5. 비정상 종료 뒤 남은 PID 파일과 재사용된 PID 때문에 시작·정지·삭제가 막힘

**현상.** 정전·크래시 뒤 `supervisor.pid`/`tunnel.pid`가 남는다. 재부팅 뒤 그 번호를 다른 프로세스가 쓰고 있으면 다음 둘 중 하나가 된다.
- 보호 프로세스(lsass 등)는 Windows가 경로·명령줄을 숨긴다. 그래서 "metadata not exposed" 예외가 난다.
- 일반 프로세스는 identity가 맞지 않는다. 그래서 "does not match" 예외가 난다.

어느 쪽이든 `start-tunnel.ps1:52/62`, `stop-tunnel.ps1:173/196`, `Uninstall.ps1:370`이 실패하고, UI로는 빠져나올 방법이 없다.

**원인.** `scripts/WorkForge.TunnelRuntime.ps1:186-226`(tunnel), `:228-272`(supervisor)의 검증 함수가 "PID 파일보다 나중에 시작된 프로세스"를 구분하지 않는다.

**설계.** 두 함수에서 `$Process`를 얻은 직후, **메타데이터 공백 검사보다 먼저** 다음을 넣는다.
```powershell
# A PID file is always written after its process starts, so a newer process means the PID was reused.
if ($Process.CreationDate -and $Process.CreationDate -gt (Get-Item -LiteralPath $RecordedPidPath).LastWriteTime) { return $null }
```
- `CreationDate`는 보호 프로세스에서도 노출된다(감사에서 확인). CIM 객체에서 `DateTime`인지 문자열인지 확인하고, 필요하면 변환한다.
- supervisor PID는 supervisor가 자기 PID를 쓴다(`tunnel-supervisor.ps1:171`). tunnel PID는 tunnel-client가 `--pid.file`로 쓴다.
  둘 다 "프로세스 시작 → 파일 기록" 순서다. 구현 전에 이 순서를 코드로 다시 확인한다.
- 일치하지 않는 경우를 일괄 `$null`로 돌리면 **안 된다**. 다른 버전에서 실행 중인 정상 supervisor를 놓치고 두 번째 supervisor를 띄우게 된다. 시간 비교로만 stale을 판정한다.
- `$null`을 받은 호출자가 stale PID 파일을 지우고 "실행 중 아님"으로 진행하는지 모든 호출자(`start-tunnel`, `stop-tunnel`, `tunnel-status`, `tunnel-supervisor`, `Uninstall`, `WorkForge.Update`)에서 확인한다.

**테스트** (`scripts/test-recovery-policy.ps1` 또는 새 `scripts/test-pid-reuse.ps1`을 `check:windows`에 연결).
- 임시 runtime 경로에 PID 파일을 만들고, 그 PID로 무해한 프로세스(`powershell -NoProfile -Command Start-Sleep 30`)를 띄운다.
  파일의 `LastWriteTime`을 1시간 전으로 바꾸면 두 검증 함수가 `$null`을 돌려준다(예외 아님).
- 같은 프로세스에 대해 `LastWriteTime`을 프로세스 시작 뒤로 두면 지금처럼 "does not match" 예외가 난다(보호 유지).
- 테스트 프로세스는 `finally`에서 반드시 종료한다.

---

## S6. 삭제 finalizer가 실행 중인 portable 엔진을 반쯤 지움

**현상.** finalizer는 삭제 도구 자신의 프로세스만 기다린다. Codex·Claude 플러그인의 `node.exe`(`plugins/workforge/bin/workforge-stdio.ps1:15`)나
두 번째 Control 창이 `versions\X`에서 돌고 있으면 `Remove-Item -Recurse`가 하위 파일을 먼저 지운 뒤 잠긴 exe에서 실패한다.
`dist\stdio.js`는 사라지고 `current.json`과 잠긴 `node.exe`가 남는다. 이후 모든 진입점이 해시 검사에서 실패한다.
화면에는 이미 "UNINSTALL COMPLETE"가 떠 있다. 감사 에이전트가 같은 배치로 재현했다.

**원인.** `scripts/uninstall-finalizer.ps1:111`이 삭제 전에 `$PortableProgramsRoot` 아래 실행 중인 프로세스를 확인하지 않는다.

**설계.** `:111`의 `Remove-Item` 직전에 다음을 넣는다.
1. 최대 30초 동안 500ms 간격으로 `Get-CimInstance Win32_Process`를 조회한다. `ExecutablePath`가 `$PortableProgramsRoot` 아래인 프로세스를 찾는다(대소문자 무시, 경로 경계 `\` 확인). finalizer 자신(System32 PowerShell)은 해당하지 않는다.
2. 남은 프로세스가 없으면 진행한다.
3. 시간이 지나도 남아 있으면 **아무것도 지우지 않고** 예외를 던진다. 메시지는 `Portable engine is still in use by: node.exe (PID 1234), …. Close WorkForge plugins and Control windows, then run Uninstall again.`이다.
   기존 `catch`가 `Write-FinalizerResult -State failed -Detail`로 남긴다.
4. 이 finalizer는 의도적으로 독립 실행 스크립트다(다른 모듈을 dot-source하지 않음). 헬퍼를 가져오지 말고 안에 짧게 구현한다.
5. "UNINSTALL COMPLETE / Engine scheduled" 문구는 finalizer 결과를 기다리지 않는 구조라 그대로 둔다. 실패 결과 파일 경로를 사용자가 찾을 수 있게 안내하는 문구가
   `Uninstall.ps1`에 이미 있는지 확인하고, 없으면 "엔진 삭제는 백그라운드로 진행되며 실패 시 `<경로>`에 기록됩니다" 한 줄을 추가한다.

**테스트** (`scripts/test-uninstall.ps1`).
- 임시 portable 루트의 `versions\X\` 아래에 복사한 실행 파일(예: `powershell.exe`나 작은 sleep 프로그램 복사본)을 실행해 둔다. 그 상태에서 finalizer를 돌리면
  `state:"failed"`, 상세에 PID가 있고, `current.json`·`dist`·모든 파일이 **그대로** 남는다.
- 프로세스를 끝낸 뒤 다시 돌리면 완료된다. 대기 시간은 테스트에서 줄일 수 있도록 인수(예: `-InUseTimeoutSeconds`, 기본 30)로 받는다.

---

## S11. macOS CLI 제거가 tunnel을 멈추지 않고, 레지스트리를 잠금 없이 덮어씀

**현상.**
- `npm run uninstall:macos`(`scripts/macos/uninstall.mjs`)는 실행 중인 supervisor·tunnel-client를 멈추지 않는다. 그 상태에서 키체인 키와 runtime 폴더를 지워서 고아 프로세스가 남는다.
  남은 프로세스가 지워진 폴더에 `status.json`을 다시 만들 수 있다.
  대시보드 경로(`control-server.mjs`)는 먼저 `stop-tunnel.mjs`를 부른다. CLI만 빠졌다.
- 레지스트리를 `registerProfile`(`scripts/macos/setup-support.mjs:182-206`)과 같은 잠금 없이 읽고 `writeFileSync`로 덮어쓴다.
  동시에 다른 프로필이 등록되면 그 등록이 사라진다.
- 등록되지 않은 profileId도 조용히 "unregistered"를 출력한다.

**설계.**
1. `setup-support.mjs`에 `unregisterProfile(registryPath, profileId)`를 추가한다. `registerProfile`의 `acquireRegistryLock` → `readRegistry` → 대상 제거 → `validateRegistry` → `atomicWrite` 흐름을 그대로 쓴다.
   - 대상이 없으면 `Error("WorkForge macOS profile is not registered: <id>")`.
   - 남은 프로필이 0개면 잠금 안에서 레지스트리를 지운다. 이때 `validateRegistry`가 0개를 거부하므로 그 검증은 건너뛴다. 반환값으로 "마지막 프로필이었는지"를 알려 준다.
2. `uninstall.mjs`의 순서는 다음과 같다.
   1. `--what-if` 처리
   2. 프로필 등록 여부 확인. 없으면 실패.
   3. `node <engine>/scripts/macos/stop-tunnel.mjs --profile <id>`를 `spawnSync`로 실행한다. `process.execPath`를 쓰고 stdio는 inherit한다. 0이 아니면 **아무것도 지우지 않고** 종료한다.
   4. supervisor PID 레코드로 프로세스가 남아 있지 않은지 확인한다(`tunnel-common.mjs`의 `readPidRecord`/`processMatches` 재사용).
   5. 키체인 키 삭제
   6. runtime 폴더 삭제
   7. `unregisterProfile`
   8. 마지막 프로필이면 `current.json` 삭제
3. `JSON.parse(readFileSync(...))` 대신 `tunnel-common.mjs`와 `setup-support.mjs`의 검증된 읽기(크기·symlink 검사)를 쓴다.

**테스트.**
- `unregisterProfile` 단위 테스트: 플랫폼 무관하게 Windows CI에서도 돌 수 있으면 그쪽에 둔다. 확인할 경우:
  - 대상 제거
  - 미등록 거부
  - 마지막 프로필에서 파일 삭제
  - 잠금 파일이 있으면 대기 후 실패
- macOS 게이트(`scripts/test-macos*.mjs`)에 "실행 중 tunnel에서 CLI uninstall → supervisor가 사라진 뒤 상태가 지워짐" 경우를 추가한다. macOS CI에서만 돈다.

---

## 최종 검증 (모든 커밋 후)

1. `npm run build` 다음 `npm test`(vitest 전체), `npm run check:windows`. PowerShell 테스트는 UTF-8 콘솔(`chcp 65001`)에서 돌린다.
2. 새·변경 테스트가 **수정 전 코드에서 실패**하는지 최소 S1, S2, S7, S10은 확인한다(되돌린 상태로 한 번 실행, 또는 커밋 순서상 테스트 먼저).
3. `git status`가 깨끗하고, `%TEMP%\workforge-task33-*`가 남지 않는다.
4. 보고 형식: 항목별 `커밋 해시 · 바꾼 파일 · 추가 테스트 · 설계와 달라진 점(있으면 이유)`. 그리고 끝에 `check:windows` 결과 요약과 남은 위험.

## 범위 밖 (이번에 하지 않음)

감사 2단계 항목은 TASK-34로 따로 다룬다.
- 레포 실행 시 레지스트리 기본값 누락
- 프로필 상한 256
- 이모지 잘림
- 새 폴더 안 새 파일 patch
- read_text_stream 첫 줄
- read-only 잠금 후 배지
- macOS 5초 doctor
- 새로고침 후 버튼 고착
- 업데이트 시 supervisor 판정
- 프로세스 핸들
- 동시 업데이트 뮤텍스
- 삭제 재실행
- CRLF 파일 쓰기
- shell_prune 범위
- 빈 맥락 줄
- 둥근 따옴표
- Setup 도구 수
- 중복 헬퍼

S4에서 쿠키 Max-Age를 없애는 것과 S1에서 progress를 끄는 것처럼 같은 줄을 만지는 경우만 함께 처리한다.
