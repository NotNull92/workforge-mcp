# TASK-24 — 명시적 작업 체크포인트와 재개

상태: **Claude REVISE 반영. 재검수 불필요 의견에 따라 아래 최종 v2 구현·소스 검증 완료.**

## 목적과 사용자 흐름

대화가 바뀌어도 같은 taskId로 목표·진행·다음 행동을 찾는다. 기록된 완료 주장을 실제 실행 결과와 혼동하지 않는다.
기존 project_resume는 현재 Git와 문서를 조회한다. 체크포인트는 사용자가 명시한 작업 상태를 저장하며 자동 실행/자동 replay/브라우저 대화 녹취를 도입하지 않는다.

1. 사용자가 taskId를 정하고 workstation_context를 확인한다.
2. task_checkpoint로 첫 상태를 expectedSha256=absent로 생성한다.
3. 다음 갱신은 직전 체크포인트 해시를 전달한다. 해시가 다르면 덮어쓰지 않고 task_resume로 다시 확인한다.
4. 새 대화는 task_resume(taskId)로 기록된 상태와 관련 shell manifest 증거를 분리해 읽고, 필요하면 project_resume/파일 읽기로 현재 소스를 확인한다.

## API

새 도구 `task_checkpoint` (쓰기; read-only 미등록):
- contextRevision, taskId (`[a-z0-9][a-z0-9_-]{0,63}`), expectedSha256 (absent 또는 lowercase SHA-256).
- state: title(1..200), objective(1..4000), reportedStatus(active/blocked/completed), plan(max40개의 각1000자 문자열), completedSteps(max40), blockers(max20), nextAction(max4000), projectPath, relatedPaths(max20), shellJobIds(max20, 중복 금지).
- state 자체는 모델/사용자 보고이며 실행 검증을 뜻하지 않는다. command 문자열이나 자격 증명을 저장하지 말라는 안내.
- 출력 taskId, sha256, savedAt, created. 사용자 제공 state를 성공 응답에 다시 포함하지 않는다.

새 도구 `task_resume` (읽기; 두 모드에서 제공):
- taskId만 입력. 자동 last-task 선택이나 타 프로필 검색 없음.
- 출력 checkpoint(version/id/profileId/savedAt/state), sha256, `stateSource: reported`, `shellEvidence[]`.
- shellEvidence는 요청된 ID 각각의 실제 getShellStatus 요약 또는 고정 unavailable code. 명령/로그 본문과 raw 예외는 포함하지 않는다.
- evidence는 manifest 조회 시점의 상태이며 output hash를 검증하지 않는다. 성공 근거는 shell_output으로 별도 검증한다. 파일/Git 상태를 검증했다고 주장하지 않는다.

## 저장과 동시성

- 위치는 현재 프로필 primaryRoot/artifacts/workforge-mcp/tasks/<taskId>.json, 외부 입력 파일 경로를 받지 않는다. 한 task당 최신 snapshot만 유지한다.
- strict version1 JSON, 서버가 profileId/taskId/savedAt을 지정. 전체 UTF-8 128KiB 한도, 파싱 전 bounded read. unknown fields/손상/identity mismatch 거부.
- 기존 writeTextFile의 expectedSha256, target write lease, exclusive create, atomicReplace를 재사용한다. 새 writer나 DB를 만들지 않는다.
- 시작 전과 I/O 직전에 artifacts/workforge-mcp/tasks의 각 디렉터리 구간이 실제 directory이고 symlink/junction이 아니며 primaryRoot 아래인지 확인한다. 없는 디렉터리는 쓰기에서만 순서대로 생성하고 다시 검사한다. 읽기에서 디렉터리를 만들지 않는다.
- 최종 JSON도 regular file, non-symlink, nlink=1인지 검사한다. hardlink 읽기/쓰기와 다른 프로필 archive를 거부한다.
- projectPath/relatedPaths는 저장 전에 기존 경로 권한 확인 후 절대 경로로 정규화. 나중 옮겨진 프로젝트 때문에 체크포인트 자체를 숨기지는 않으며, 실제 파일 재조회는 기존 도구의 현행 경계 검증을 거친다.
- 로컬 동일 OS 사용자와의 경로 교체 공격을 완전한 sandbox로 막는다고 주장하지 않는다. 기존 writer와 같은 OS 경계이며 CAS는 WorkForge 협력 writer 사이의 갱신 충돌을 막는다.

## 마스킹·모드와 결합

- TASK-23 응답 마스킹은 재개 state에도 적용된다. task_checkpoint 입력 전체에 marker가 있으면 저장 거부해 마스킹된 문서를 덮어쓰지 않는다.
- 알려진 비밀이 입력에 있는 경우 디스크에 원문을 남기는 문제를 검수한다. 선택지: redactor로 탐지한 입력은 마스킹해서 저장하지 않고 거부한다. 숨겨진 변경으로 state 의미를 바꾸지 않는다.
- 도구 수는 일반16/read-only10이 된다. 기존 14/9에 checkpoint writer+resume reader 추가.

## 영향 범위와 검증

- src/tasks.ts strict state schema, bounded safe runtime storage, 기존 reader/writer/status 재사용.
- src/server.ts 등록·contextRevision·mode·redaction marker 검사와 instructions.
- tests/tasks.test.ts 생성/갱신/재시작 load/CAS 경쟁/잘못된 ID/profile/version/128KiB/하드링크/redirected root/missing root가 디스크를 만들지 않음.
- MCP 왕복, read-only checkpoint 직접 호출 거부, reported completed + 실제 failed/ownership_lost 증거 분리, shell_output 검증은 하지 않았다는 계약.
- scripts stdio smoke 일반16/읽기10, README en/ko, ARCHITECTURE, 작업 상태 문서.

## 아이디어 검토 예정

task_list, 자동 taskId 추론, 과거 revision 이력, 첨부 파일 복제, 자동 Git 변경 추적, 멀티 에이전트 claim/lease는 첫 범위를 넘는다. 먼저 explicit ID+CAS+보고/증거 분리를 완성하고 검수 아이디어 채택 여부를 기록한다.

## 실제 검수와 결정

| 피드백/아이디어 | 결정 | 최종 반영 |
| --- | --- | --- |
| 필드 합계와128KiB 저장 한도 불일치 | 채택 | 경로 각4096자, 직렬화 UTF-8 숫자를 포함한 CHECKPOINT_TOO_LARGE; 필드 상한을 모두 채울 수 없다고 명시 |
| Windows 예약명 | 채택 | con/nul/aux/prn/com1..9/lpt1..9 모든 OS에서 거부 |
| archive 검증 helper 재사용 | 채택 | shell root/bounded read를 공용 archive 모듈로 이동; 같은 metadata 후보 탐색을 shell/task에서 재사용 |
| 탐지한 비밀 저장 거부 | 채택 | 순수 tasks API도 검사, 값 대신 필드 위치만 오류; raw state 의미를 몰래 바꾸지 않음 |
| tasks/.gitignore | 채택 | 처음 쓰기 때 exclusive 생성, 기존 파일은 덮어쓰지 않고 unsafe 파일 거부 |
| task_list | 채택 | 작업 재발견은 재개 핵심. limit20/최대100, scan20000/mtime후보2*limit, 검증한 summary만 반환 |
| 보고/실행 모순 플래그 | 거절 | 과거 실패 뒤 성공 가능, 근거를 나란히 제공하고 해석 강제 안 함 |
| revision 이력/삭제/보존 | 보류 | 최신 snapshot+CAS부터 제공 |
| 자동 taskId, multi-agent claim | 거절 | 명시적 작업 선택 범위 유지 |

### 확정 v2

일반17개/read-only11개 도구. task_list는 taskId/title/reportedStatus/savedAt 및 bounded scan/truncated/errors를 제공한다. shell_list와 같은 휴리스틱 한계를 명시한다. task_resume는 missing이면 found=false, checkpoint=null/sha256=null을 반환하고 저장 디렉터리를 만들지 않는다. 손상/identity 오류는 고정 CHECKPOINT_INVALID 등 코드로 실패한다.
state는 항상 전체 교체이며 hash는 원본 저장 bytes 기준이다. CAS 불일치는 CHECKPOINT_CONFLICT, absent 충돌은 CHECKPOINT_EXISTS와 task_resume 안내로 변환한다. shellEvidence는 status/trackingState/exitCode/timedOut/createdAt/updatedAt/evidenceSealed만 읽으며 원문 로그 검증과 분리한다.
projectPath/relatedPaths 정규화 전후로 길이·전체 저장 한도 확인. 비밀 검출은 redactor와 marker guard를 재사용하고 거부된 값은 디스크에 쓰지 않는다. schema 필드별 최대값을 모두 사용하면128KiB를 초과할 수 있다.

## 구현·검증 결과

strict state/taskId, 공유 archive reader/metadata scan, CAS writer, task_list/resume/checkpoint를 구현했다. shellEvidence 실패는 세부 파일 상태를 복제 분류하지 않고 unavailable 한 코드로 보수적으로 축약했다. 원문 manifest 오류는 반환하지 않는다.
전체82 passed/2 플랫폼 skip과 소스 stdio17/11 통과. task 테스트는 missing 무쓰기, 저장·재개·CAS 충돌/동시1winner, 예약명/비밀/marker/foreign/128KiB, corrupt/profile/hardlink/junction, MCP read-only, 보고 completed+실제 failed의 분리를 검증한다. 실제 설치 엔진은 갱신하지 않았다.
