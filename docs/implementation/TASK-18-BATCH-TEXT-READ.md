# TASK-18 — 여러 파일 일괄 읽기

상태: **구현 및 소스 검증 완료 — Claude 1차 REVISE 및 보완 재검수 APPROVE 반영.**

## 진행 계약

이 업그레이드는 사용자가 지정한 다음 절차를 항목마다 적용한다.

1. 현재 코드와 영향을 받는 호출자·스키마·테스트·문서를 조사한다.
2. 상세 기획과 설계 초안을 작성한다.
3. 사용자가 지정한 현재 Herdr Claude pane에 검수를 요청한다.
4. 문제점, 보완점, 추가 기능 아이디어를 받고 각각 채택·수정 채택·보류·거절 및 이유를 기록한다.
5. 채택한 내용으로 최종 설계를 확정한다. 핵심 계약이 달라지거나 차단 문제가 남으면 Claude에게 재검수를 요청한다.
6. Codex가 구현하고 필요한 검증을 완료한다.
7. 결과와 남은 한계를 기록한 뒤 다음 우선순위로 이동한다.

다른 모델의 내부 검토나 Codex 자체 검토로 지정된 Claude pane 검수를 대체하지 않는다.
Claude는 읽기 전용 설계 검수자이며, 제품 코드 구현은 Codex가 담당한다.
설계 검수는 릴리스·라이선스·서명에 대한 승인으로 취급하지 않는다.

| 순서 | 항목 | 상태 |
| --- | --- | --- |
| 1 | 여러 파일 일괄 읽기 | 구현 및 소스 검증 완료 |
| 2 | 검색 조기 종료와 중단 이유 | TASK-19 구현·검증 완료 |
| 3 | 최근 실행 작업 조회 | TASK-20 구현·검증 완료 |
| 4 | 한 파일의 여러 변경을 한 번에 적용 | TASK-21 구현·검증 완료 |
| 5 | 서버가 강제하는 읽기 전용 모드 | TASK-22 구현·검증 완료 |
| 6 | 도구 응답의 비밀값 마스킹 | TASK-23 구현·검증 완료 |
| 7 | 작업 체크포인트와 재개 | TASK-24 구현·검증 완료 |
| 8 | Control의 작업 현황 | TASK-25 구현·검증 완료 |

## 1. 문제와 사용자 가치

관련 소스·설정·테스트를 함께 조사할 때 현재 `read_text_file`은 파일마다 MCP 호출이 필요하다.
사용자는 여러 파일을 한 요청에서 읽되 각 파일의 경로, 범위, 최신 해시와 실패 여부를 구분할 수 있어야 한다.
응답량을 파일별 제한뿐 아니라 요청 전체의 텍스트 예산으로 제어한다.

예시: 구현 파일 100줄, 테스트 80줄, 설정 파일 40줄을 요청하고 한 번의 응답으로 받는다.
파일 하나가 없더라도 다른 허용된 파일은 읽을 수 있다.
후속 수정에는 해당 파일의 반환된 SHA-256을 그대로 사용한다.

성공 기준은 호출 수 감소와 명확한 부분 결과다. 실제 지연 감소 수치는 측정하기 전 약속하지 않는다.

## 2. 현재 구현과 재사용

- `src/filesystem.ts`의 `readTextFile`: 경로 권한 검사, UTF-8 디코딩, 전체 원본 SHA-256, 줄 범위 및 텍스트 제한.
- `resolveAuthorizedWorkstationPath`: 등록된 다른 프로필 경계를 요청 경로 및 canonical 경로에서 확인.
- `src/server.ts`: Zod 입력·출력 스키마와 `responseFor`의 text/structuredContent 반환.
- 기존 입력 경로는 프로필의 default working directory 기준이며, 절대 경로도 허용한다.
- 기존 읽기는 원본 전체를 메모리에 읽어 해시·줄 수를 계산한다. 현재 파일별 제한은 64 MiB다.
- 앞서 추가한 `project_resume.resumePaths`는 별도 목적의 명시적 문서 선택이다. 이번 항목에서 이를 제거하거나 자동 변환하지 않는다.

새 라이브러리, 범용 작업 실행기, 전역 캐시가 필요하지 않다.

## 3. 범위

포함:

- 새 읽기 전용 MCP 도구 `read_text_files`.
- 요청당 명시적 파일 1~20개, 파일별 읽기 범위, 전체 텍스트 예산.
- 입력 순서대로 결과 반환, 파일별 성공·오류·예산 소진 건너뜀 구분.
- 전체 원본 해시 및 기존 파일 메타데이터 보존, 정확한 이어 읽기 힌트 추가.
- 기존 경로 보호 재사용, 테스트·stdio smoke·한영 사용법 갱신.

제외:

- glob 확장, 자동 관련 파일 탐색, 디렉터리·이미지 혼합 읽기.
- 파일 간 동일 시점 스냅샷, 읽기 잠금, 새 파일 감시 기능.
- 병렬 파일 읽기, 캐시, 부분 원본만으로 전체 해시를 추정하는 읽기.
- 파일 수정, 자동 비밀값 마스킹, 세션 기록. 이들은 별도 우선순위다.

## 4. 입력 계약 초안

```json
{
  "files": [
    { "path": "src/filesystem.ts", "startLine": 313, "maxLines": 40 },
    { "path": "tests/filesystem.test.ts", "startLine": 1, "maxLines": 80 }
  ],
  "maxTotalCharacters": 60000
}
```

| 필드 | 제한 / 기본값 |
| --- | --- |
| `files` | 1~20개, 빈 배열 거부 |
| `files[].path` | 기존 PATH_SCHEMA, 1~32,768자 |
| `files[].startLine` | 1~100,000,000, 기본 1 |
| `files[].maxLines` | 1~5,000, 기본 400 |
| `files[].maxCharacters` | 1,024~200,000, 기본 60,000 |
| `maxTotalCharacters` | 1,024~200,000, 기본 60,000 |

기존 단일 파일 도구의 입력·출력 계약은 유지한다.
상대 경로는 기존 단일 파일 읽기와 동일하게 프로필 기본 디렉터리 기준이다.
프로젝트마다 다른 전역 cwd를 설정하지 않는다.
같은 경로를 여러 번 요청할 수 있다. 서로 다른 줄 범위를 읽는 용도이므로 중복 제거하지 않는다.

## 5. 출력 계약 초안

최상위 필드:

- `results`: 입력과 길이 및 순서가 같은 discriminated union 배열.
- `returnedCharacters`: 모든 성공 결과 `text.length`의 합계.
- `truncated`: 성공 결과의 `characterLimited`가 true이거나 예산 때문에 건너뛴 항목이 있으면 true. 지정한 줄 범위만 읽었다는 이유로 true가 되지 않는다.
- `hasErrors`: 파일별 오류가 하나 이상이면 true.

각 결과는 `requestedPath`와 `status`를 포함한다.

성공:

```text
status: "read"
requestedPath: 사용자가 준 경로
file: 기존 readTextFile 결과
  path, text, sha256, byteLength, startLine, endLine, totalLines, truncated,
  characterLimited, nextStartLine
```

파일 오류:

```text
status: "error"
requestedPath: 사용자가 준 경로
error: 최대 1,000자의 진단 문자열
code: OS 오류 코드 또는 null
```

예산 소진:

```text
status: "skipped"
requestedPath: 사용자가 준 경로
reason: "budget_exhausted" | "source_budget_exhausted"
```

오류나 건너뜀 결과에는 읽지 못한 파일의 해시·내용·메타데이터를 넣지 않는다.
`truncated`와 `hasErrors`는 서로 다른 사실이다. 오류만 있는 요청을 정상 완전 읽기로 표시하지 않는다.
형식 오류는 도구 입력 오류로 전체 요청을 거부한다. 유효한 요청 안의 개별 파일 실패는 부분 결과로 반환한다.
모든 항목이 실패해도 파일별 오류 응답에는 MCP isError를 설정하지 않는다. hasErrors와 각 status로 판단한다.

## 6. 처리 순서와 예산

1. 서버 스키마로 모든 입력을 검증한다. shared helper에서도 항목 수·정수 범위·전체 예산의 불변식을 확인한다.
2. 잔여 텍스트 예산을 `maxTotalCharacters`로 초기화한다.
3. 입력을 순차 처리한다. 본문 예산이 0이면 해당 항목은 파일시스템에 접근하지 않고 budget_exhausted로 skipped 처리한다. 본문 예산이 남아도 원본 예산이 0이면 source_budget_exhausted로 skipped 처리한다.
4. 잔여 예산이 있으면 `min(파일별 maxCharacters, 잔여 예산)`으로 기존 `readTextFile`을 호출한다.
5. 성공 시 실제 반환된 `text.length`만 예산에서 차감한다. 잔여 예산이 1,024보다 작아도 내부 호출은 그 작은 값으로 제한한다.
6. 파일별 읽기 실패는 bounded 진단으로 저장하고 다음 항목을 처리한다. 오류는 본문 예산을 소비하지 않는다.
7. 모든 항목의 결과와 집계 값을 반환한다.

별도의 내부 원본 예산 64 MiB를 실제 읽은 바이트로 집계한다. 실패한 UTF-8 디코딩도 예산에 포함된다.
공유 원본 reader는 사전 regular-file 검사와 열린 handle의 stat 검사를 수행하고 bounded chunk loop로 읽는다.
파일별 64 MiB와 잔여 배치 예산 중 작은 값을 읽기 한도로 사용한다. 사전 크기가 한도보다 크면 원본 읽기 없이 항목 오류를 반환한다.
읽는 동안 파일이 커지면 한도 확인용 최대 1바이트를 초과 읽은 뒤 실패한다. 예산을 음수로 남기지 않으며 이후 항목을 건너뛴다.
항목 경계와 chunk 사이에서 요청 취소를 확인한다. 취소는 파일 오류로 삼키지 않고 작업을 중단한다.

문자 수는 기존 도구와 동일하게 JavaScript UTF-16 code unit 기준이다. UTF-8 전송 바이트나 모델 토큰 수와 같지 않다.
예산은 파일 본문 합계에 적용한다. JSON 구조·경로·오류 메타데이터는 별도 오버헤드이며, 항목 수와 각 필드 길이로 제한된다.
text와 structuredContent에는 같은 논리적 결과를 제공한다. wire payload에는 이중 표현 비용이 존재한다.

첫 파일이 예산을 모두 사용하면 나머지는 skipped가 된다. 자동 균등 분배는 하지 않으며, 사용자가 파일별 maxCharacters로 우선순위를 조정한다.
예산을 정확히 소진한 마지막 파일까지 모두 정상 반환되었다면, 예산 소진 자체만으로 전체 truncated를 true로 만들지 않는다.

## 7. 보안·정확성·성능

- 각 실제 읽기는 기존 경로 검증을 독립적으로 통과해야 한다. 한 파일이 허용되었다고 다른 파일의 권한을 추정하지 않는다.
- 다른 프로필로 이어지는 symlink/junction은 기존 검증으로 거부한다. 오류 후 다른 허용 파일은 계속 읽을 수 있다.
- 파일 내용은 신뢰되지 않은 데이터다. 파일 안의 지시문을 실행하지 않는다.
- SHA-256은 반환된 일부 텍스트가 아니라 전체 원본 파일 바이트의 해시다.
- 배치 중 파일이 바뀔 수 있다. 여러 파일의 일관된 트랜잭션 스냅샷이라고 설명하지 않는다.
- 기존 `startLine/endLine/truncated` 의미를 유지한다. 글자 제한이 줄 중간에 걸리면 endLine은 선택한 범위의 끝이고, text가 해당 줄 끝까지 포함됨을 보장하지 않는다.
- 공유 reader에 characterLimited와 nextStartLine을 추가한다. 문자 한도로 잘렸으면 반환 text의 개행 수를 startLine에 더해 잘린 줄을 다시 읽게 한다. 범위를 정상 반환했고 뒤에 줄이 있으면 endLine+1, EOF이면 null이다.
- nextStartLine은 byte/column cursor가 아니다. 한 줄 자체가 예산보다 길면 예산을 늘리거나 CLI로 확인해야 하며, 같은 범위를 자동으로 무한 재요청하지 않는다.
- 마지막 high surrogate를 잘라내어 반환 텍스트의 서로게이트 쌍을 보존한다. grapheme 단위 분할은 보장하지 않는다.
- 순차 처리로 20개 원본 파일을 동시에 메모리에 올리지 않는다.
- 작은 출력 범위에도 전체 원본 해시를 계산하는 비용은 남는다. 배치 전체는 원본 64 MiB와 최대 1바이트 sentinel로 제한한다. 이는 peak memory가 64 MiB라는 뜻은 아니며 디코딩·split 사본 비용이 추가된다.
- OS의 기존 접근 권한과 현재 사용자 경계는 유지한다. 터널·프로필·자동 시작 설정을 변경하지 않는다.

## 8. 영향 범위

| 파일 | 예정 변경 |
| --- | --- |
| `src/filesystem.ts` | 배치 helper, 공유 reader의 bounded 원본 읽기·이어 읽기 힌트·surrogate 보정 |
| `src/server.ts` | 새 도구 등록, bounded 입력/union 출력 스키마, read-only annotation, 단일 읽기·resume 문서에도 추가 필드 반영 |
| `tests/filesystem.test.ts` | 배치 동작·예산·부분 실패·경계 회귀 테스트 |
| `tests/filesystem.test.ts` 내 MCP 테스트 | 기존 fixture를 재사용해 SDK in-memory transport로 스키마·기본값·출력 계약 확인 |
| `scripts/stdio-smoke.mjs` | expectedTools 갱신 및 최소 배치 호출 |
| `scripts/plugin-stdio-smoke.mjs` | expectedTools 갱신 |
| `README.md`, `README.ko.md` | 현재 도구 수 13개, 목록·예시·예산/부분 실패 설명 |
| `docs/ARCHITECTURE.md` | 배치 읽기의 경로·예산·스냅샷 한계 |

과거 완료 기록의 당시 도구 수는 수정하지 않는다.
플러그인 생성물은 현재 구조에서 도구 이름을 복제하지 않는지 재확인한 후 필요한 경우만 갱신한다.
기존 `src/resume.ts`와 단일 reader의 다른 호출자가 깨지지 않는지 기존 테스트로 확인한다.

## 9. 검증 계획과 완료 조건

1. 일반 UTF-8·한글·빈 파일·CRLF·서로 다른 줄 범위를 읽고 단일 reader 결과와 해시가 일치한다.
2. 첫 파일이 전체 예산을 소진하면 이후 실제 파일을 열지 않고 skipped를 반환한다.
3. 파일별 예산과 전체 예산 중 작은 값이 적용되며 returnedCharacters가 실제 합계와 같다.
4. 마지막 파일이 예산을 정확히 소진한 경우와 아직 읽을 파일이 있는 경우를 구분한다.
5. missing·디렉터리·잘못된 UTF-8 오류를 반환하고 이후 정상 파일을 읽는다.
6. 다른 프로필 경로와 그쪽을 가리키는 junction/symlink를 거부한다. 허용 파일의 결과만 포함한다.
7. 동일 경로의 서로 다른 범위 요청을 입력 순서대로 보존한다.
8. 0개/21개 파일, 잘못된 범위, 초과 예산은 스키마 검증에서 거부한다.
9. SDK in-memory 호출에서 text와 structuredContent의 결과가 일치하고 출력 스키마가 통과한다.
10. 빌드, 관련 테스트, 전체 TypeScript 테스트, 플러그인 패키지 검사, stdio smoke를 수행한다. smoke는 실제 실행 작업과 충돌하지 않는 fixture를 사용한다.
11. git diff 검사로 불필요한 생성물·사용자 절대 경로·실행 자격증명 유입이 없는지 확인한다.
12. 범위 읽기 자체는 최상위 truncated가 false이며, 글자 제한과 EOF의 nextStartLine이 구분된다.
13. 홀수 예산의 이모지·정확한 개행 경계·EOF 이후 범위를 확인한다.
14. 실패한 UTF-8도 원본 예산에 반영되고 한도 소진 뒤 접근 금지 경로가 error가 아닌 skipped가 되는지 확인한다.
15. 취소는 다음 파일 접근을 중단하며 tools/list의 outputSchema가 직렬화되는지 확인한다.

완료는 Claude 피드백 판정 및 최종 설계 확정 후 구현·필수 검증이 통과한 상태다.

## 10. Claude 검수 요청

이 문서와 영향 범위의 실제 코드를 읽기 전용으로 검토한다. 구현이나 파일 수정은 하지 않는다.

다음 형식으로 응답을 요청한다.

1. 판정: APPROVE / REVISE / BLOCK.
2. 문제점: 심각도, 정확한 근거, 사용자에게 생길 실패, 최소 수정안.
3. 보완점: 출력·부분 실패·경로·메모리·호환성·테스트에서 빠진 조건.
4. 추가 아이디어: 기대 효과, 구현 비용, 이번 범위에 넣을 이유 또는 후속으로 미룰 이유.
5. 특히 검토할 쟁점: 총 I/O 예산 필요성, 부분 오류 정책, 기본 예산의 첫 파일 편중, 기존 줄 메타데이터 의미, UTF-16 경계, 전체 결과를 사용하는 클라이언트의 오해 가능성.
6. 구현 전 반드시 결정해야 하는 질문과 추가 요구가 없는 경우의 권고 기본값.

## 11. 피드백·채택 기록

같은 WorkForge 워크스페이스의 기존 Claude pane에서 1차 REVISE를 받았다. 읽기 전용으로 실제 소스와 설계를 검수했다.

| ID | Claude 지적/아이디어 | 판정 | 이유 | 설계 반영 |
| --- | --- | --- | --- | --- |
| M1 | 범위 읽기와 예산 잘림 구분 | 채택 | 최상위 truncated의 의미를 실제 예산 잘림으로 한정 | 5절 |
| M2 | characterLimited / nextStartLine | 채택 | 이어 읽기 시 누락을 방지하며 기존 필드는 유지 | 5·7·8절 |
| M3 | 원본 바이트 누적 예산 | 수정 채택 | 성공 결과만 세면 decode 실패가 예산을 우회하므로 실제 읽은 바이트를 집계 | 6·7절, 재검수 APPROVE |
| m1 | 서로게이트 경계 보정 | 채택 | 깨진 문자열 반환 방지 | 7절 |
| m2 | 취소 신호 확인 | 채택 | 요청 취소 후 추가 읽기 방지 | 6절 |
| m3 | union outputSchema 직렬화 검증 | 채택 | SDK 계약을 확인; 실제 ChatGPT 호환성은 별도 미확인 | 9절 |
| m4 | 입력 순서대로 예산 소진 안내 | 채택 | 자동 균등 배분 없이 예측 가능성 유지 | 도구 설명·사용법 |
| I1 | 오류 코드·메시지 상한·isError 정책 | 채택 | 부분 실패의 기계적 판독 | 5절 |
| I2 | serverInstructions 배치 도구 안내 | 채택 | 여러 파일 조사에서 발견 가능성 확보 | 8절 |
| I3 | ifSha256Differs 조건부 읽기 | 보류 | 별도 계약 증가, 사용 수요 근거 없음 | 후속 후보 |
| I4 | 배치 내 원본 캐시 | 보류 | 캐시·동일 시점 의미의 비용보다 먼저 예산 제한 적용 | 후속 후보 |
| I5 | 부분 읽기만으로 전체 해시 제공 | 거절 | 전체 원본 해시 계약을 만족할 수 없음 | 범위 제외 |
| I6 | glob·자동 관련 파일 탐색 | 거절 | 명시적 파일 배치라는 목적을 넓힘 | 범위 제외 |

## 12. 최종 설계 및 구현 결과

Claude 보완 재검수 판정은 APPROVE였다. 제시된 더 작은 stat 기반 사전 차감 대안은 보류하고 bounded handle read를 확정한다. 파일 증가에도 실제 원본 예산을 지키고, decode 실패·취소 시에도 일관되게 집계하기 위해서다.
handle은 모든 경로에서 닫고, 작은 파일에도 전체 예산만큼 버퍼를 할당하지 않는다. 기존 쓰기 호출에는 선택적인 budget/signal을 전달하지 않아 64 MiB 계약을 유지한다.
예산 부족 오류는 code=SOURCE_BUDGET_EXCEEDED와 단일 read_text_file 재시도 안내를 포함한다. 권한·경로 단계에서 실패한 항목은 원본 예산을 차감하지 않는다.
최종 설계 확정 후 Codex 구현을 시작한다. 검증 결과는 완료 시 아래에 기록한다.

### 검증 결과

- TypeScript 빌드 통과.
- 전체 테스트 57 passed / 1 skipped. 신규 배치·이어 읽기·원본 예산·MCP 스키마 테스트 포함.
- 플러그인 패키지 정적 검사 통과.
- 별도 임시 프로필로 source dist의 stdio smoke 통과: 13개 도구, 배치 해시 일치, shell 키 제거 확인.
- git diff --check 통과.
- 설치된 portable 엔진을 사용하는 plugin stdio smoke는 기존 엔진의 도구 12개와 개발 소스의 13개가 달라 실패했다. 배포된 엔진을 업데이트하지 않았으므로 이를 새 코드의 runtime 검증 통과로 주장하지 않는다. 소스 dist는 독립 stdio smoke로 검증했다.
- 실제 ChatGPT 커넥터의 union 출력 지원과 macOS 실행은 미확인이다.

## 전체 업그레이드 검증 현황

8개 항목 모두 동일 Herdr Claude pane에서 설계 검수를 받고, 아이디어별 채택/보류/거절을 각 TASK 문서에 기록한 후 Codex가 구현했다. 기본17개/read-only11개 도구다.

- check:core: 빌드, TypeScript82 passed/2 플랫폼 skip, plugin package, macOS setup/static tunnel 검사 통과. Windows에서 macOS 실기 tunnel은 skip.
- 격리 프로필 direct stdio: 일반17개/read-only11개 목록 및 모드 확인, 금지 도구 직접 호출 거부, 실제 shell 기록 재발견 통과.
- Control dashboard API/DOM: 인증, missing profile 고정 오류, task/shell summary, 마스킹, HTML 문자 그대로 표시, stale 표기 통과.
- security-invariants/privacy-invariants/control-ux 통과.
- 한국어 Chrome 데스크톱 및390px 모바일 레이아웃, 작업 패널·재개 문구 복사·가로 넘침 없음 확인. 임시 검증 서버만 사용.
- 마지막 bounded process callback의 undefined throw 처리를 보완하고 대상6 passed/1 플랫폼 skip 및 빌드를 다시 통과했다.
- git diff --check 통과. 새 의존성/버전 변경/커밋/공개 배포/실제 설치 엔진 갱신/터널 설정 변경은 하지 않았다.

남은 한계: 설치된 기존 plugin engine은 아직 이전 도구 수다. 이번 검증은 소스 엔진이며 실제 설치 반영은 별도 적용 단계다. macOS 실기, Control/터널을 통한 read-only env 전달은 미검증. 마스킹은 알려진 값/패턴의 best-effort이며 원본 로그·이미지·일부 페이지 조각은 제외. 기존 atomic writer의 POSIX mode 보존 문제는 별도 후속 버그다.
