# TASK-20 — 최근 실행 작업 조회

상태: **Claude 검수 완료. 아래 v2 최종 설계 구현 및 소스 검증 완료.**

## 목적과 사용자 흐름

새 대화에서 이전 shell ID를 모르면 저장된 실행 결과를 찾기 어렵다.
사용자가 마지막 빌드·테스트를 찾을 때 `shell_list`로 현재 프로필의 기록을 발견하고, 기존 `shell_output`으로 실제 출력을 검증한다.
새로운 실행기, 명령 재실행, PID 재접속, 대화 녹취를 추가하지 않는다.

## 현재 자산

- `src/shell.ts`: 프로필 아래 artifacts/workforge-mcp/shell의 started.json, terminal.json과 출력 로그.
- getShellStatus/archiveStatus: manifest 신원·상태·root 안전성 검증과 ownership_lost 구분.
- getShellOutput: 완료 로그 길이·SHA-256 무결성 검증.
- jobs map: 현재 서버가 소유한 작업. 다른 서버가 실행 중인 작업의 PID만 보고 제어 권한을 추정하지 않는다.

## 입력·출력 v1 (아래 v2 변경사항으로 대체)

도구: 읽기 전용 `shell_list`.

- 입력 `limit`: 1~100, 기본 20.
- 입력 `cwd`: 선택적 경로. 지정하면 canonical 동일 작업 디렉터리의 기록만 조회. 하위 디렉터리 자동 포함은 없음.
- 출력 `jobs`: id, cwd, createdAt, updatedAt, status, trackingState, exitCode, timedOut, replayAllowed(false).
- 출력 `scannedEntries`: 실제 조사한 디렉터리 항목 수.
- 출력 `truncated`: 반환 개수 또는 탐색 한도로 생략했으면 true.
- 출력 `scanLimited`: 탐색 한도에 걸렸는지 별도 표시. true이면 전체 이력 중 가장 최근임을 보장하지 않는다.
- 출력 `errors`: id와 최대 1,000자의 진단. 전체 파일 내용·명령·출력 전문은 반환하지 않는다.

정렬은 createdAt 내림차순, 같은 시간이면 id 순서로 고정한다.
재실행 허용 여부는 항상 false이며, 목록 자체로 명령 재실행을 승인하지 않는다.

## 처리와 제한 v1 (아래 v2 변경사항으로 대체)

1. cwd가 있으면 기존 경로 검증을 거쳐 canonical comparison key를 만든다.
2. 프로필의 runtime root를 계산한다. 디렉터리가 없으면 빈 결과; symlink/junction/escape이면 전체 요청을 거부한다.
3. 기존 assertSafeArchivedJobRoot의 root 검사 부분을 작은 helper로 추출해, 디렉터리 열거 전에 같은 검증을 재사용한다.
4. 디렉터리는 opendir로 순차 열거하며 최대 1,000개 항목을 조사한다. 일괄 readdir로 무제한 목록을 메모리에 올리지 않는다. 한도를 확인하는 추가 항목 하나는 내용을 읽지 않는다.
5. 유효한 job ID의 디렉터리만 getShellStatus로 조회한다. 활성 map과 겹치면 한 번만 반환한다.
6. 현재 프로필의 활성 작업은 열거 순서와 관계없이 포함 후보에 넣는다. 다른 프로필 작업은 제외한다.
7. 각 기록의 cwd도 현재 프로필 경계로 재검증한다. 다른 등록 프로필로 편입된 과거 cwd는 내용 없이 오류 처리한다.
8. cwd filter는 canonical 경로를 비교한다. 삭제된 cwd는 기존 existing-ancestor 경로 정책으로 비교하고, 경로 상태를 모르는 경우 제외/오류 처리한다.
9. 개별 malformed/missing manifest는 id와 오류로 보고하고 다른 기록을 계속 읽는다.
10. 검증된 후보를 정렬한 후 limit만 반환한다. scanLimited와 truncated의 의미를 구분한다.

오류 배열도 최대 100개로 제한하며 추가 오류는 errorsTruncated로 표시한다. 응답 한도를 위해 명령 원문은 자동 수집하지 않는다.
요청 취소는 항목 사이에 확인한다. 디스크 기록을 수정하거나 오래된 기록을 삭제하지 않는다.

## 신뢰 경계

목록은 시작/종료 manifest의 상태 요약이다. 출력 로그 자체를 읽거나 해시 검증하지 않는다.
실제 성공 증거가 필요하면 shell_output으로 로그 무결성을 확인해야 한다.
다른 서버가 남긴 started-only 기록은 running이라고 추정하지 않고 기존 ownership_lost 의미를 유지한다.
아카이브 symlink, hardlink manifest, 잘못된 id/profile 및 start/terminal 불일치를 기존 검증으로 거부한다.
runtime root가 없다는 것과 접근이 거부됐다는 것을 구분한다. 오류를 전부 빈 목록으로 숨기지 않는다.

## 영향 범위

- src/shell.ts: bounded 목록 함수와 기존 root 검사 재사용.
- src/server.ts: 도구 schema와 사용 안내.
- tests/shell.test.ts: 기존 실행 fixture·archive fixture 재사용.
- scripts/stdio-smoke.mjs, scripts/plugin-stdio-smoke.mjs: tool 목록과 소스 smoke.
- README.md, README.ko.md, docs/ARCHITECTURE.md: 도구 수 14개와 discover→output 흐름.
- Control UI는 우선순위8에서 같은 조회 함수를 재사용한다.

## 검증과 완료 조건

- 빈 archive, 활성·완료·실패·ownership_lost 기록을 구분한다.
- 현재 서버를 모르는 상태에서도 디스크 아카이브 기록을 다시 찾는다.
- 다른 프로필의 기록, 잘못된 manifest, redirected root와 job directory, hardlinked manifest를 거부한다.
- cwd 필터와 Windows 대소문자/alias 의미, 안정 정렬·limit을 검증한다.
- 1,000개 초과 엔트리에서 scanLimited가 true이며 최근 전체 이력이라고 주장하지 않는다.
- 오류 배열 한도, 취소, 명령·출력 전문 미노출을 확인한다.
- 목록을 읽기 전후 디스크 기록의 내용/해시가 같다.
- MCP schema roundtrip, 빌드, 전체 TypeScript 테스트, 14개 도구의 격리 stdio smoke.

## Claude 검수·아이디어·최종 설계

실제 동일 워크스페이스 Claude pane의 TASK-20-REVIEW 판정은 REVISE였다.

| 피드백/아이디어 | 결정 | 이유 |
| --- | --- | --- |
| 처음 1,000개만 검증하면 최근 기록 누락 | 채택 | 비동기 metadata 후보 선택 후 제한된 manifest 검증 |
| 과거 cwd 재검증 삭제 | 채택 | 이미 status/output이 제공하는 기록이며 목록만 숨길 이유 없음 |
| cwd lexical 비교 | 채택 | 저장된 경로와 동일 의미, alias 매칭은 보장하지 않음 |
| 오류는 고정 code만 | 채택 | JSON/Zod 오류 원문에 manifest 조각이 포함될 수 있음 |
| started 없는 기록 구분 | 채택 | incomplete_start로 진단, 다른 기록 계속 처리 |
| ISO timestamp 검증 | 채택 | 손상된 timestamp로 정렬 오염 방지 |
| stdoutBytes/stderrBytes/cancelRequested | 채택 | 기존 status 값으로 별도 I/O 없이 제공 |
| status 필터 | 보류 | 우선 목록에서 상태를 확인, 후보 필터 의미 추가를 피함 |
| 명령 label/preview | 보류 | manifest 변경 및 비밀값 저장 정책을 함께 설계해야 함 |
| 명령 해시 필터 | 거절 | cwd/timeout 포함 해시여서 사용자 탐색에 부적합 |
| cwd 하위경로 포함, retention cleanup | 보류 | 별도 요구와 쓰기 정책 필요 |

### 확정 v2

- cwd 입력은 기존 권한 검사 후 `isSamePath`로 저장된 lexical cwd와 비교한다. 삭제된 과거 cwd를 별도 권한 재검사하지 않는다. junction/단축 이름 별칭은 일치하지 않을 수 있다.
- root 검사 재사용, missing root만 빈 결과. unsafe/permission root 오류는 요청 실패.
- opendir로 최대 20,000개 항목을 순차 조사하고 비동기 lstat으로 ID 디렉터리 metadata만 읽는다. mtime 내림차순의 최대 `limit * 2` 후보를 유지한다. 추가 한 항목으로 scanLimited 판정.
- 현재 프로필 jobs map 후보는 별도로 포함하고 ID 중복 제거한다. 각 manifest 검증 사이 이벤트 루프에 양보하고 AbortSignal을 검사한다.
- 후보만 기존 getShellStatus로 검증한다. createdAt/updatedAt은 ISO UTC timestamp로 확인한다. 최종 정렬은 createdAt 내림차순 후 id 오름차순.
- mtime은 수정/종료 시각 휴리스틱이다. **전체 createdAt 기준 최근성 보장은 없다.** 오래 실행 후 종료한 기록이나 손상된 후보, cwd 필터로 응답이 limit보다 작을 수도 있다. 이 한계는 반환 truncated와 도구 설명에 드러낸다. reviewer의 '최근성 보장' 표현은 채택하지 않는다.
- truncated는 scanLimited 또는 조사한 ID 후보 수가 반환 수보다 많을 때 true. 오류/필터 제외도 포함한다.
- errors 최대100개 `{id, code}`. code는 incomplete_start, archive_unsafe, manifest_invalid, identity_mismatch, terminal_mismatch. 추가 오류는 errorsTruncated. 원문 오류 메시지 미노출.
- summary에 stdoutBytes, stderrBytes, cancelRequested 추가. 출력 로그 hash 검증은 shell_output의 책임.
- 1,050개 역순 ID + 제어된 mtime 회귀, incomplete/malformed/identity/unsafe, active 중복, cwd, 취소, SDK roundtrip을 검사한다. 디스크 이력을 수정하지 않는다.

## 구현 및 검증 결과

- shell_list와 기존 archive root 검증 재사용, bounded metadata 후보와 고정 오류 code 구현.
- 빌드 통과. 전체 TypeScript 테스트 67 passed / 2 플랫폼 skip.
- 격리 프로필 소스 stdio smoke 14개 도구 통과; 실제 생성한 완료 작업을 shell_list로 재발견.
- 1,051개 항목, 손상/foreign/hardlink/junction, 오류 상한, active 중복 및 archived 전환, cwd, 취소, SDK 응답을 테스트했다.
- 실제 설치된 엔진/터널은 갱신하지 않았다. 설치 엔진의 도구 수는 여전히 이전 버전이다.
