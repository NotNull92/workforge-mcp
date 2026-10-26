# TASK-28 — 읽기·검색 확장 (I-01 ~ I-09)

상태: **Claude 상세 설계 v1. Codex 구현 대상.** 목록·결정 항목은 TASK-27, 실행 순서는 HANDOFF-CODEX-TASK-28-31.md.

공통 규칙
- 모든 새 입력은 `src/server.ts`의 zod 스키마와 `src/filesystem.ts`의 순수 함수 검증을 둘 다 둔다(기존 readTextFiles 관례).
- 응답은 기존 `register`/`responseFor` 경로로 TASK-23 redactor를 지난다. 새 필드는 **추가만** 하고 기존 필드 의미를 바꾸지 않는다.
- 새 읽기 도구는 `localReadAnnotations`, read-only 모드에서도 등록. 도구가 늘면 smoke 기대 목록·README 도구 수를 갱신한다.

---

## I-01 조건부 읽기 `ifSha256Differs`

**시나리오** 모델이 방금 읽은 파일을 다시 확인할 때, 바뀌지 않았으면 본문 없이 "변경 없음"만 받아 응답 예산을 아낀다.

**API**
- `read_text_file`과 `read_text_files.files[]`에 선택 입력 `ifSha256Differs: SHA256_SCHEMA`.
- 해시가 같으면 결과는 기존 객체에서 `text: ""`, `unchanged: true`, `characterLimited: false`, `nextStartLine: null`, `truncated: false`로 반환한다. `sha256`, `byteLength`, `totalLines`, `startLine`, `endLine`(요청 범위 기준 계산값)은 그대로 채운다.
- 해시가 다르면 기존과 같고 `unchanged: false`. 입력을 주지 않으면 `unchanged` 필드는 `false`.
- 출력 스키마에 `unchanged: z.boolean()` 추가(단일·배치의 `file` 객체, `project_resume.resumeDocuments` 공용 스키마 포함).

**처리** `readTextFile` 안에서 `readTextBytes` 직후 비교. 전체 해시가 필요하므로 **I/O는 줄지 않는다**(문서에 명시). 배치에서는 `unchanged`인 항목은 문자 예산을 0 소비한다.

**호환성** 추가 필드만. 기존 호출 결과는 `unchanged:false` 하나만 늘어난다.

**구현 단계** filesystem.ts readTextFile 시그니처에 `ifSha256Differs?: string` → server.ts 두 도구 스키마·설명 → resume.ts 영향 없음(입력 미전달).

**테스트** 같은 해시 → text 빈 문자열·unchanged true·예산 0 소비; 다른 해시 → 정상 본문; 잘못된 해시 형식 → 스키마 거부; 배치에서 unchanged 항목 뒤 항목이 예산을 그대로 쓰는지.

---

## I-02 배치 안 같은 파일 원본 재사용

**시나리오** 같은 파일의 서로 다른 범위를 한 배치로 읽을 때 원본을 한 번만 읽는다.

**설계**
- `readTextFiles` 안에 요청 한정 Map 캐시. 키: `resolveAuthorizedWorkstationPath` 결과를 `normalizePathForComparison`한 값.
- 값: `{ bytes, text, hasBom, sha256, lines, dev, ino, size, mtimeMs }`. 재사용 전에 `stat`으로 `dev/ino/size/mtimeMs`가 같은지 확인하고, 다르면 새로 읽는다(새로 읽은 값으로 교체).
- 원본 예산(`sourceBudget`)은 **실제로 읽은 경우에만** 차감. 재사용은 0 차감.
- 캐시는 요청이 끝나면 버린다(전역 캐시 금지). 최대 엔트리 20(배치 상한과 같음).
- `readTextFile` 본문을 `selectRange(source, input)` 순수 함수로 분리해 캐시 경로와 단일 경로가 같은 계산을 쓴다.

**신뢰 경계** 경로 검증은 항목마다 다시 수행(캐시가 권한을 대신하지 않음). 서로 다른 별칭 경로(심볼릭 링크)는 다른 키 → 각각 검증·읽기.

**테스트** 같은 파일 두 범위 → 원본 예산이 파일 크기만큼 한 번만 줄어듦(테스트용으로 `sourceBudget` 잔량을 결과에 노출하지 말고 spy/monkeypatch 대신 64MiB 근처 fixture 두 범위가 `SOURCE_BUDGET_EXCEEDED` 없이 성공하는지로 확인); 중간에 파일 변경 시 두 번째 결과 sha256이 새 값.

---

## I-03 (대체) 해시 없는 스트리밍 범위 읽기 `read_text_stream`

**원 아이디어** 부분 읽기만으로 전체 해시 → 수학적으로 불가능. **목적**은 "64MiB를 넘는 로그나 거대한 파일의 앞부분·특정 줄 범위를 싸게 보는 것"이므로 해시를 포기한 별도 도구로 충족한다.

**API** 새 읽기 도구 `read_text_stream`
- 입력: `path`, `startLine`(1~100,000,000, 기본 1), `maxLines`(1~2,000, 기본 200), `maxCharacters`(1,024~100,000, 기본 30,000), `maxScanBytes`(64KiB~256MiB, 기본 64MiB).
- 출력: `path`, `text`, `startLine`, `endLine`, `characterLimited`, `nextStartLine`, `scannedBytes`, `reachedEof: boolean`, `scanLimited: boolean`, `hashAvailable: false`(literal), `editable: false`(literal).
- 설명에 "편집 전에는 반드시 read_text_file로 전체 해시를 얻으라"를 넣는다. `sha256` 필드는 **두지 않는다**.

**처리**
- `open` → 64KiB chunk 순차 읽기 → `TextDecoder("utf-8", { fatal: true, stream: true })` → `\r\n|\n|\r` 줄 분할(chunk 경계의 `\r` 보류 처리) → 필요한 줄만 모으고 `endLine`에 도달하면 즉시 종료.
- `maxScanBytes`에 닿으면 `scanLimited: true`로 지금까지의 결과 반환. 취소 신호는 chunk마다 확인.
- 잘못된 UTF-8은 기존과 같이 오류. surrogate 끝 보정은 readTextFile과 동일.

**호환성** 새 도구. 기존 도구 무변경. read-only 모드 등록.

**테스트** 70MiB fixture에서 100번째 줄 근처를 읽으면 `scannedBytes`가 파일 크기보다 훨씬 작음; CRLF가 chunk 경계에 걸린 경우 줄 수 일치; `maxScanBytes` 도달 시 scanLimited; 취소.

---

## I-04 glob 배치 읽기와 관련 파일 제안

**원 아이디어** glob 확장·자동 관련 파일 탐색. 명시성 원칙을 지키면서 두 부분으로 구현한다.

### I-04a `read_text_files.globs`
- `read_text_files`에 `files`와 **상호 배타**인 입력 `select: { root: PATH, globs: string[1..8], maxFiles: 1..20 (기본 10) }`.
- 처리: `rg --no-config --files --null` + 각 glob `--glob`, 기존 searchFiles의 runProcess 경로 재사용(결과 상한 `maxFiles + 1`에서 중단). 경로를 **사전순 정렬** 후 앞 `maxFiles`개를 기존 배치 읽기로 넘긴다(범위는 기본값).
- 출력에 `selection: { matched: number, truncated: boolean, stoppedBecause }` 추가. `results`는 기존 그대로.
- root는 `resolveAuthorizedWorkstationPath(..., "tree")`로 검증.

### I-04b `suggest_related_files` (읽기 도구)
- 입력: `path`(파일), `maxSuggestions` 1~20(기본 10).
- 규칙(결정적·설명 가능, 내용 실행 없음):
  1. 테스트 짝: `foo.ts` ↔ `foo.test.ts`/`foo.spec.ts`/`tests/foo.test.ts`/`__tests__/foo.test.ts` 등 존재하는 것.
  2. 상대 import: `.ts/.tsx/.js/.mjs/.cjs`에서 `from "./x"`, `import("./x")`, `require("./x")` 정규식으로 추출 → 확장자 후보 해석. 파이썬은 `from .x import`. 파일 앞 256KiB만 스캔.
  3. 같은 디렉터리의 같은 basename 다른 확장자(`.css`, `.md`).
- 출력: `suggestions: [{ path, reason: "test_pair" | "relative_import" | "same_basename" }]`, `truncated`.
- 각 제안 경로는 존재 확인 + 경계 검증 통과한 것만. 내용은 반환하지 않는다(필요하면 read_text_files로 읽음).

**테스트** glob 선택과 files 동시 지정 거부; 정렬·상한; 다른 프로필 경로 제외; import 추출 fixture; 존재하지 않는 import 제외.

---

## I-05 Buffer 구분자 기반 레코드 분리 (리팩터)

**목적** StringDecoder 누적 문자열 대신 Buffer에서 `0x0A`/`0x00`을 찾아 완전한 레코드만 decode → 동작 동일, 큰 출력에서 문자열 재연결 비용 감소.

**설계** `searchFiles`의 `onStdoutChunk`를 `Buffer[]` pending + `indexOf(delimiterByte)`로 교체. 레코드 decode는 `toString("utf8")`. 동작·출력 계약은 **완전히 동일**해야 한다.

**테스트** 기존 searchFiles 테스트 전부 + chunk를 1바이트씩 쪼개 넣는 단위 테스트(한글·이모지 경계)로 이전/이후 결과 동일. 성능 수치는 약속하지 않는다.

---

## I-06 검색 정렬 `sort`

**API** `search_files` 입력 `sort: z.enum(["none", "path"]).default("none")`. `path`이면 rg에 `--sort path` 추가(rg가 단일 스레드가 됨을 설명에 명시). 출력에 `sorted: boolean`.

**테스트** 같은 fixture에서 두 번 실행 결과가 동일 순서; none은 기존과 같음.

---

## I-07 path 검색의 basename 사전 필터

**API** `search_files` 입력 `match: z.enum(["path", "basename"]).default("path")` (path 모드에서만 의미, content 모드에서 basename이면 거부).
- `basename` + `regex:false`: rg에 `--iglob "**/*<escaped query>*"` 추가(glob 메타문자 `*?[]{}!\` escape) 후 JS에서 `basename(path)` 대소문자 무시 substring 재확인.
- `basename` + `regex:true`: rg 사전 필터 없이 JS에서 basename에만 정규식 적용.
- 기본 `path`는 현재 의미(절대 경로 substring) 그대로.

**테스트** 디렉터리 이름에만 query가 있는 파일은 basename 모드에서 제외; glob 메타문자 포함 query escape; content+basename 거부.

---

## I-08 긴 줄에 강한 content 출력 형식

**API** `search_files` 입력 `lineFormat: z.enum(["json", "columns"]).default("json")` (content 모드 전용).
- `columns`: `rg --no-config --null --line-number --column --no-heading --color never --max-columns 1024 --max-columns-preview` (+ 기존 hidden/ignore/glob/fixed-strings). 레코드: `path\0line:column:text\n`.
- 파서: 레코드를 `\n`으로 나눈 뒤 첫 `\0` 앞을 path, 뒤를 `^(\d+):(\d+):(.*)$`로 분해. 매치 실패 레코드는 무시. text는 기존처럼 1,024자 slice.
- 비 UTF-8 경로·내용은 U+FFFD 치환을 허용(문서화). json 모드는 기존 그대로.

**테스트** 5,000자 줄 fixture에서 columns 모드는 결과를 내고 출력 예산에 걸리지 않음; 일반 fixture에서 json과 columns의 (path,line,column) 집합 동일.

---

## I-09 검색 진단 통계 (opt-in)

**API** `search_files` 입력 `includeStats: z.boolean().default(false)`. json 모드에서 true이면 rg `--stats`를 붙이고 마지막 `summary` 이벤트의 `stats`에서 `{ searches, searchesWithMatch, bytesSearched, matchedLines }`만 추출해 출력 `stats` 필드(nullable)에 담는다. 조기 종료 등으로 summary가 없으면 `null`.
- columns 모드·path 모드에서는 `stats: null`.

**테스트** 완료된 검색에서 stats 존재·숫자; result_limit 조기 종료에서 null; 기본값에서 출력에 `stats: null`.

---

## 완료 조건 (TASK-28 전체)

- `npm run build`, `npm test`(vitest 전체), `node scripts/stdio-smoke.mjs`, `node scripts/plugin-stdio-smoke.mjs` 통과. 새 도구(read_text_stream, suggest_related_files) 반영 후 도구 수: 일반 19 / read-only 13 (TASK-29~31의 새 도구는 각 문서에서 추가 반영).
- README en/ko 도구 목록·수, docs/ARCHITECTURE.md의 읽기·검색 절 갱신.

## 구현 기록

2026-10-26 — Wave 3: I-01 ifSha256Differs implemented in single/batch reads and shared output schema. Matching hashes suppress text only (full file I/O still required). Build and related tests passed.
2026-10-26 — Wave 8: I-02/I-03/I-04/I-05/I-06/I-07/I-08/I-09 implemented. New src/reading.ts keeps bounded streaming and related-file heuristics separate from writer code. Request cache revalidates dev/ino/size/mtime and authorization; split lines cached too. Search Buffer record parser tested byte-by-byte Unicode, sort/basename literal-glob escaping/columns/stats. Glob selection reuses sorted bounded search. Build passed; filesystem/resume 45 passed + 1 POSIX skip; Control dashboard/API passed. Streaming provides no edit hash; regex import suggestions are heuristic; columns replacement decoding and sorted single-thread rg are explicit.
