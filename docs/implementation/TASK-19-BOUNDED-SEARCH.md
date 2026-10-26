# TASK-19 — 검색 조기 종료와 중단 이유

상태: **구현 및 소스 검증 완료. Claude REVISE의 필수 보완을 채택.**

TASK-18의 진행 계약을 적용한다. Claude는 보완 후 재검수가 필요하지 않다고 명시했다.

## 문제와 목표

`searchFiles`는 현재 `runProcess`가 rg를 끝까지 실행한 뒤 문자열을 파싱한다.
`maxResults`는 반환 목록만 줄이며, 출력 한도도 저장량만 제한한다. 큰 검색은 최대 120초 계속 실행될 수 있다.
필요한 결과를 확보하면 실제 검색 프로세스를 종료하고, 정상 완료·결과 한도·시간 한도·출력 한도·오류를 구분한다.

사용자 예시: 대형 저장소에서 매치 10개만 필요할 때 첫 10개를 얻고 추가 매치 하나를 확인한 즉시 검색을 종료한다.
결과가 정확히 10개뿐이면 정상 완료로 보고한다. 전체 매치 개수나 정렬된 상위 N개라고 주장하지 않는다.

## 현재 코드와 영향

- `src/filesystem.ts`: content는 `rg --json`, path는 `rg --files`; 실행 완료 후 잘림.
- `src/process.ts`: 공용 runProcess와 process-tree 종료 함수. Git resume도 사용하므로 기존 옵션의 기본 동작을 유지한다.
- `src/server.ts`: search_files 입력·출력 스키마.
- `tests/filesystem.test.ts`, `tests/process.test.ts`: 실제 rg 결과 및 합성 장기 실행 subprocess 검증.
- `README.md`, `README.ko.md`, `docs/ARCHITECTURE.md`: 예산과 중단 이유 설명.

## API 계약 초안

기존 필드를 유지하고 다음 필드를 추가한다.

- 입력 `timeoutMs`: 1,000~120,000, 기본 10,000. 기존 기본 120초보다 짧아짐을 문서에 명시한다.
- 출력 `stoppedBecause`: `complete | result_limit | timeout | output_limit | error`.
- 출력 `elapsedMs`: 실제 경과 시간, 음수 아님.
- `truncated`: 결과·시간·출력 한도에 의한 불완전 검색이면 true. 오류로 전체 커버리지를 보장할 수 없어도 true.
- `warning`: 정상 완료와 의도한 result_limit은 null. 시간·출력 한도·실패 시 짧은 진단.

중단 시 이미 읽은 완전한 매치만 최대 maxResults개 반환한다. 반쪽 JSON이나 반쪽 파일 경로를 결과로 만들지 않는다.
프로세스 실행 자체가 불가능한 경우는 기존과 같이 도구 오류다.

## 처리 설계

1. 기존 경로 경계와 파일/디렉터리 선택을 유지한다.
2. path 모드의 정규식을 subprocess 시작 전에 컴파일해 잘못된 정규식 때문에 검색을 시작하지 않도록 한다.
3. rg에 `--no-config`를 지정해 사용자 rg config가 포맷·follow·출력 옵션을 바꾸지 않도록 한다. 기존 hidden/ignore/glob 입력은 유지한다.
4. path는 `--files --null`로 NUL 구분을 사용한다. 줄바꿈이 들어간 POSIX 파일 이름을 잘못 분할하지 않는다.
5. content는 기존 JSON match event를 줄 단위로 처리한다. StringDecoder로 UTF-8 chunk 경계를 보존한다.
6. 공용 runProcess에 opt-in `onStdoutChunk` 동기 callback과 `stopOnOutputLimit` 옵션을 추가한다. callback이 중단을 요구하면 기존 killProcessTree 경로로 종료한다. 기존 Git 호출은 새 옵션을 쓰지 않아 변경되지 않는다.
7. callback 내부는 chunk 사이의 미완성 레코드를 유지한다. 완전 레코드만 파싱하고 maxResults+1번째 매치에서 종료를 요청한다.
8. stdout 총 4 MiB, stderr 512 KiB 상한에 도달하면 검색을 중단한다. 미완성 레코드도 stdout 예산에 포함한다.
9. 종료를 요청한 뒤 추가 chunk는 새 결과로 처리하지 않는다. 첫 중단 원인을 보존하고 close까지 기다린 뒤 응답한다.
10. rg exit 0/1은 정상, 그 외는 오류로 처리한다. 자체 중단 때문에 생긴 signal/nonzero를 일반 실패로 덮어쓰지 않는다.

공용 ProcessResult에는 검색 도메인 enum 대신 중단 요청 여부와 출력 한도 도달 여부를 명시한다.
callback 예외·spawn 오류·close·timeout 경쟁은 단일 settlement와 timer 정리로 처리한다.
중단 요청 후 2초 grace를 넘으면 POSIX process group에 SIGKILL, Windows child에 kill을 보낸다. stdio를 닫고 bounded settlement하며 close 확인이 없으면 killConfirmed=false를 반환해 종료 확인 실패를 경고한다.
Windows taskkill의 error 이벤트를 처리해 서버 crash를 막는다. 이 백스톱은 공용 Git timeout에도 적용된다.
callback 예외는 data 리스너 내부에서 catch하고 종료 후 reject한다. 신호 취소도 process 종료를 요청한 뒤 reject한다.
한 chunk에서는 stdout 한도 안의 바이트만 callback으로 전달한다. 그 범위에서 결과 한도를 만족하면 callback 중단이 먼저이며, 아니면 출력 한도 중단을 적용한다. callback 모드의 stdout 원문은 중복 보관하지 않는다.
중단 원인을 exitCode보다 먼저 해석한다. Windows 강제 종료의 exit 1을 정상 무매치 완료로 분류하지 않는다.

## 안전성과 호환성

검색은 읽기 전용이며 셸 문자열을 실행하지 않는다. query·glob·target은 args로 전달하고 -- 경계를 유지한다.
다른 프로필의 트리를 포함하는 검색 거부와 symlink를 따라가지 않는 기본 동작을 보존한다.
검색 결과는 파일 시스템 스냅샷이 아니며 실행 중 변경을 반영할 수 있다.
출력 문자열 길이 제한과 반환된 결과 수는 계속 기존 계약을 지킨다.
검색 정렬과 전체 매치 count는 이번 범위에서 추가하지 않는다.
시간 한도와 --no-config는 의도적인 동작 변경이며 한영 문서와 테스트로 명시한다.

## 검증

- 실제 rg로 content/path, literal/regex, hidden/ignore/globs, Unicode 경로·내용을 확인한다.
- 정확히 N개와 N+1개 결과를 구분한다.
- 합성 Node 프로세스가 초기 매치 후 계속 실행하도록 해 callback이 실제로 조기 종료시키는지 검증한다. 호출 후 잘라냈다는 사실만 검증하지 않는다.
- callback을 쓰지 않는 Git resume 결과는 회귀 테스트로 확인한다.
- chunk 분할 JSON/UTF-8, path NUL, 마지막 완전 레코드, 미완성 레코드 버림을 확인한다.
- stdout/stderr 한도·타임아웃·오류를 분리하고 이미 얻은 결과를 보존한다.
- timeout과 result limit 경합에서 원인이 일관되고 timer/process가 남지 않는지 확인한다.
- 빌드, 전체 TypeScript 테스트, MCP 입력·출력 스키마 검증, 관련 보안 검사.

## Claude 검수 및 결정 기록

판정 REVISE. 기존 Claude pane에서 실제 공용 process/Git/search 코드를 검토했고 보완 후 재검수 불필요 의견을 받았다.

| 의견 | 결정 | 근거 |
| --- | --- | --- |
| I1 종료 grace·강제 종료·taskkill error 처리 | 채택 | 검색마다 사용하는 종료 경로의 hang/crash 방지 |
| I2 callback 동기 예외 catch | 채택 | MCP 서버 전체 종료 방지 |
| I3 중단 플래그를 exitCode보다 우선 | 채택 | Windows kill 뒤 exit 1 오분류 방지 |
| I4 chunk budget→callback→출력 한도 순서 | 채택 | 결정적인 중단 사유와 메모리 중복 제거 |
| m1 AbortSignal 전달 | 채택 | 취소된 요청의 검색 중단 |
| m2 부분 오류에서도 matches 유효 | 채택 | 오류와 이미 얻은 결과를 구분 |
| m3 결과 순서 비결정성 명시 | 채택 | 전체 정렬 상위 결과로 오해 방지 |
| m4 긴 JSON 한 줄로 결과0 가능 경고 | 채택 | 파서 교체 없이 한계 명시 |
| m5 Buffer delimiter 처리 대안 | 보류 | StringDecoder로 두 모드를 명확하게 처리 가능 |
| sort 옵션·glob으로 path 필터 이전 | 보류 | 성능/기존 absolute substring 의미 변경 |
| JSON 출력 형식 교체 | 보류 | 기존 파서와 의미 유지가 작은 변경 |
| 추가 진단 통계 | 거절 | 이번 사용 목적에 필요 없음 |

최종 설계는 위 보완을 포함한다. 실행 순서상 관측된 임의의 최대 N개이며 정렬된 전역 상위 N개가 아니다.
JSON 한 줄이 출력 한도를 넘으면 매치가 있어도 완전 레코드를 얻지 못해 결과 0개와 output_limit이 반환될 수 있다.

## 구현·검증 결과

- 빌드와 전체 테스트 63 passed / 2 skipped 통과. 추가 MCP search 출력 검증 후 관련 20개 테스트도 통과.
- Windows에서 합성 장기 실행 Node 프로세스를 callback/오류/abort로 종료하고 PID가 남지 않음을 검증.
- callback에 전달하는 바이트 예산, stdout/stderr 한도, timeout, callback 예외와 spawn 오류 처리 검증.
- 실제 rg의 정확한 N개/N+1개 매치와 regex 오류, 합성 chunk의 UTF-8/JSON/NUL 경계 검증.
- Git resume 회귀 테스트 통과. POSIX SIGTERM 무시 백스톱 테스트는 Windows에서 skip이며 실제 macOS 실행은 미확인.
- git diff --check 통과. 설치된 portable 엔진은 변경하지 않음.
