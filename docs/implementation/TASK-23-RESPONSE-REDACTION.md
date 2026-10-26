# TASK-23 — MCP 응답의 비밀값 마스킹

상태: **Claude REVISE 반영, 아래 v2 최종 설계 구현·소스 검증 완료.**

## 문제와 범위

파일·검색·셸 출력 또는 오류에 포함된 자격 증명이 MCP 응답으로 그대로 전달될 수 있다. 서버의 모든 도구 응답에 일관된 기본 마스킹을 적용한다. 원본 파일이나 로그를 수정하지 않는다. 원본 로그 암호화, 이미지 OCR, 임의 자연어 비밀 탐지는 별도 범위다.
이는 알려진 값과 명확한 패턴에 대한 방어이며 모든 비밀을 찾는 DLP라는 보장은 하지 않는다.

## 마스킹 규칙 초안

1. stdio 시작 시 비밀 의미의 환경 변수(token, secret, password, api_key 등)의 값 중 8자 이상을 메모리에만 보관한다. CONTROL_PLANE_API_KEY는 기존 삭제 전에 snapshot한 후 즉시 환경에서 제거한다. 값은 로그/설정 파일/오류에 출력하지 않는다.
2. 정확한 값 매칭 + 고신뢰 token prefix, Bearer 인증 값, password/token/api_key/secret의 assignment, private key PEM block을 마스킹한다. 기존 외부 라이브러리 없이 정규식/문자열 처리.
3. marker는 `[WORKFORGE_REDACTED]`. hash/revision은 실제 원본 기준이다. 출력 페이지 offset/문자 수 역시 원본 기준이므로 마스킹 길이로 다음 offset을 계산하지 않는다.
4. 알려진 환경 값의 개수/길이를 제한할 때 조용히 일부를 버리지 않는다. 지나치게 큰 snapshot은 시작 오류로 처리하거나 환경 값 수집 대신 패턴만 지원하는 선택지를 검수한다.

## 경계와 API

- src/redaction.ts의 순수 함수와 서버별 redactor. 값 목록은 도구 호출자로부터 받지 않는다.
- 기존 server.registerTool 호출을 작은 타입 보존 registration helper로 감싸 callback 성공/실패를 한 곳에서 처리한다. 새로운 기능의 도구도 이 등록 경로를 사용한다.
- structuredContent를 재귀 처리하고 text JSON은 그 결과에서 생성하여 서로 일치시킨다. 이미지 block의 base64는 그대로이며 텍스트 metadata만 대상이다.
- 응답 `_meta`에 redactionApplied boolean을 넣는다. 기존 outputSchema 본문은 바꾸지 않는다. text-only error도 같은 규칙으로 처리하고 본문을 포함할 수 있는 예외의 raw 메시지가 SDK로 빠져나가지 않게 한다.
- 정적 instructions/도구 descriptions에는 비밀값이 없어야 한다. bootstrap은 데이터 응답으로 동일 정책 적용.
- SDK가 callback 실행 전에 생성하는 validation error는 별도 확인한다. 입력값 전체를 되돌리지 않도록 한다.

## 마스킹된 내용을 다시 저장하는 위험

read_text_file은 원본 hash와 마스킹된 text를 동시에 반환할 수 있다. 이를 통째로 write_text_file에 넣으면 실제 비밀을 marker로 덮어쓸 위험이 있다.
- write_text_file.content, replace_text.oldText/newText/edits, shell_start.command에 marker가 들어 있으면 처리 시작 전에 거부한다. 사용자는 로컬에서 실제 값을 확인해 별도로 수정해야 한다.
- 도구 설명과 instructions에 마스킹된 본문은 원본이 아니며 raw SHA와 offsets를 변경하지 않는다고 안내한다.
- marker 자체를 실제 파일에 쓰는 용도는 이번 v1에서 지원하지 않는다. 모델이 marker를 변형해 우회하는 것을 막는 OS 경계는 아니다.

## 중요한 한계와 검수 질문

- 페이지·줄 경계에서 잘린 비밀, 여러 필드에 나뉜 값, 인코딩된 값은 패턴이 놓칠 수 있다. 전체 원본을 먼저 검사하도록 reader를 바꾸는 것은 비용이 크다. 최소 기능의 범위를 정확히 고정할 필요가 있다.
- 일반 password 예제/마커 fixture도 마스킹될 수 있다. 높은 확실성 규칙과 명시적 redaction metadata로 구분한다.
- 문자열로 된 경로가 마스킹되면 실제 호출 경로로 재사용할 수 없게 된다. 정보 노출 방지를 우선하며 placeholder가 든 mutation은 거부한다.
- base64 이미지와 디스크 로그는 보호하지 않는다. UI 후속 작업은 명령/로그 본문을 표시하지 않는다.

## 영향 범위와 검증

- src/redaction.ts (규칙/순수처리), src/stdio.ts (삭제 전 snapshot), src/server.ts (등록 경계/응답/error 처리), 기존 mutation handlers (marker guard).
- tests/redaction.test.ts 규칙, multiline/JSON/비밀 없는 텍스트, snapshot/에러 bounded 검사.
- SDK roundtrip: text와 structured 동일, nested read batch/resume/search/shell/error, metadata 표시, 원본 bytes/hash 불변, marker write/replace/shell 거부 및 정상 작업 호환.
- 기존 smoke sentinel은 그대로 유효. 실제 자격 증명 대신 전용 synthetic token만 테스트.
- README en/ko 및 ARCHITECTURE에 검출 범위/페이지 한계/원본 로그/이미지 제외와 쓰기 제한 명시.

## 아이디어 결정 예정

사용자별 redaction rules, allow-raw 도구, masking off 옵션, secret vault 연동은 검수 후 판단하되 첫 버전은 원문 해제 경로를 추가하지 않는 방향이다.

## 검수 결과와 아이디어 결정

| 의견/아이디어 | 결정 | 반영 |
| --- | --- | --- |
| env 이름/값이 경로인 경우 제외 | 채택 | 경로 접미사 및 절대/홈 경로 제외, PWD 제외, 단어 단위 credential/key/auth 포함 |
| snapshot 상한은 경고 후 일부 제외 | 채택 | 최대256개/각4096자/UTF-8 총64KiB, 제외 개수만 stderr; 전체 DLP가 아니라는 범위 명시 |
| 열린 PEM과 경계의 알려진 값 조각 | 채택 | BEGIN만/END만 가리고 줄바꿈 유지; 시작/끝에 걸친6자 이상 prefix/suffix도 마스킹 |
| _meta.redactionCount 및 instructions | 채택 | 원본 marker가 있으면 count0일 수 있음. text JSON은 structured에서 재생성 |
| responseFor closure + 오류 registration wrapper | 채택 | 기존 흐름 재사용; read_image metadata도 responseFor 사용 |
| URL password, 고신뢰 token prefix | 채택 | URL 비밀번호, GitHub/GitLab/OpenAI/Slack/AWS/Google/npm/JWT 패턴 |
| 일반 고엔트로피 탐지 | 거절 | hash/ID 오탐과 도구 계약 손상 |
| custom rule 파일 | 보류 | 우선 고정 규칙 검증 |
| allow-raw/masking off | 거절 | 첫 버전에 우회 도구 제공 안 함 |
| 디스크 로그 마스킹 | 보류 | 원본 hash 증거 계약과 별도 설계 필요 |

### 최종 v2

stdio는 별도 redaction 모듈만 먼저 import하여 env snapshot하고 connector key 삭제 후 나머지 서버 모듈을 import한다. createServer는 테스트 가능한 knownSecrets snapshot을 옵션으로 받고 반환 문자열을 처리한다. 정확값은 길이 내림차순 escape alternation, 응답 문자열마다 고정 패턴 처리, 경계 조각 검사는 수집 한도 내에서 수행한다. 오류는 wrapper가 잡아 redactor 적용 후 MCP isError 응답으로 반환한다. SDK 자체 validation error의 입력 echo 여부는 synthetic secret으로 실측한다.
mutation 입력의 모든 문자열 필드(경로 포함)에 marker가 있으면 handler 전에 거부한다. 결과 marker는 원본이 아니며 직접 기록할 수 없다는 안내를 instructions에 둔다. 문서에서 marker를 리터럴로 저장하면 그 부분은 MCP 편집 제한을 받는 알려진 비용이다.
partial PEM 내부만 있는 페이지/알 수 없는 값의 continuation/인코딩/이미지/원본 로그는 보호 범위 밖. 테스트는 이 한계를 숨기지 않는다. ReDoS self-check와 JSON escape가 포함된 exact secret 양쪽 응답 일치를 검증한다.

## 검증 결과

빌드 및 전체76 passed / 2 플랫폼 skip, plugin package 검사 통과. synthetic exact secret의 JSON escape, 앞/뒤 경계조각, 열린 PEM, 패턴/URL, env path 제외/수집 한도, large adversarial 입력, MCP text/structured 일치와 raw 오류 미노출, marker mutation 거부 및 원본 파일 불변을 확인했다. _meta의 실제 ChatGPT 표시 여부는 확인하지 않아 instructions에서도 한계를 설명한다.
