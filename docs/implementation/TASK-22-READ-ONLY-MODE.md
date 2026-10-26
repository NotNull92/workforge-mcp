# TASK-22 — 서버가 강제하는 읽기 전용 모드

상태: **Claude 1차 REVISE, 후속 수정 APPROVE. 아래 v2 최종 설계 구현·소스 검증 완료.**

## 목표와 사용자 흐름

조사만 허용하려는 사용자가 모델 지시에 의존하지 않고 MCP의 쓰기·명령 실행을 차단한다.
서버 시작 전에 `WORKFORGE_MCP_READ_ONLY=1`을 설정한다. 시작 시 한 번 읽고 서버 수명 동안 고정한다.
기본값은 기존 전체 기능이다. 설정 변경은 서버 재시작 때 적용되며 모델이 호출할 모드 전환 도구는 없다.
현재 설치 엔진·터널 설정을 자동 변경하거나 로그인 자동 시작을 추가하지 않는다.

## 설정과 노출

- stdio에서 환경변수 미설정/0은 기존 모드, 1은 read-only. 다른 값은 오타를 숨기지 않고 시작 실패.
- `createServer(context, { readOnly?: boolean })`로 명시 전달한다. 서버 생성 후 외부 객체를 바꿔도 mode는 바뀌지 않는다.
- workstation_context 응답에 `toolMode: read_only | read_write` 추가. 현재 capability/accessBoundary는 유지: OS sandbox가 아니다.
- 초기 instructions와 도구 설명에 모드를 표시한다. 부팅 안내가 mutation을 지시해도 금지된 도구는 제공되지 않는다.

## 강제 지점과 영향

- read-only에서는 write_text_file, replace_text, shell_start, shell_cancel을 등록하지 않는다. 목록에서 숨김과 임의 직접 callTool 거부를 SDK registration 경계로 함께 해결한다.
- 일반 모드 14개, 읽기 전용 10개 도구. 나중 checkpoint writer도 같은 등록 조건을 적용한다.
- read/list/search/image/context/resume/shell_list/status/output은 유지한다. shell_cancel은 프로세스를 변경하므로 제외한다.
- 다른 MCP 서버·터널·동일 OS 사용자의 직접 파일 변경까지 금지하지 않는다. 이미 다른 서버가 실행한 작업을 멈추거나 소유권을 탈취하지 않는다.
- shutdown의 기존 connection-owned cleanup 유지. 읽기 전용 서버는 시작한 작업이 없으므로 새 cancellation 권한을 만들지 않는다.

## 읽기 도구의 부수효과 검토

- search_files는 고정 ripgrep argv, --no-config, 안전한 env를 사용한다. 임의 셸 문법을 실행하지 않는다.
- project_resume는 Git read 명령만 사용하고 GIT_OPTIONAL_LOCKS=0, core.fsmonitor=false, --no-ext-diff/--no-textconv가 이미 있다. pager/signature 등 설정 기반 실행 경로를 확인하고 필요 최소한으로 차단한다.
- 이 모드는 MCP mutation 차단이다. OS의 atime, 실행 파일 자체의 부작용, 악성 교체된 git/rg 바이너리까지 막는 시스템 보안 경계라고 주장하지 않는다.
- 외부 프로세스 정책상 project_resume를 그대로 유지할 수 없는 문제가 확인되면 모드에서 제외하는 선택지를 검수한다.

## 영향 파일과 검증

- src/stdio.ts 환경변수 엄격 파싱/전달. src/server.ts 옵션 snapshot, conditional registration, context schema/instructions.
- src/resume.ts는 실제 설정 기반 실행 위험이 확인된 인자만 보완.
- tests/server.test.ts 또는 기존 SDK fixture: listTools 10개, 4개 금지 도구 직접 호출 실패, 파일/프로세스 생성 없음, 읽기 정상, 기본 모드 호환.
- 환경 설정 파싱 0/1/미설정/오타, 옵션 객체 변경에도 수명 중 모드 고정, source stdio 환경 전달 검증.
- README en/ko 및 ARCHITECTURE: PowerShell/POSIX 실행 예제, 적용 시점과 범위, tool 수의 모드별 차이.
- 런처/registry schema 변경과 실제 설치 설정 변경은 필요 없다. 부모 프로세스 env를 통해 기존 런처가 전달한다.

## 추가 아이디어 검토 예정

per-tool allowlist, 세션 중 enable/disable, UI 토글, profile별 영구 정책은 각각 복잡도와 적용 경계를 늘린다. 우선 고정된 전체 read-only 모드로 시작하되 Claude 검수 후 채택 여부를 기록한다.

## 실제 검수와 확정 v2

| 피드백/아이디어 | 결정 | 이유/반영 |
| --- | --- | --- |
| env 전달 실패 시 조용한 기본 모드 | 채택 | 시작 stderr 모드 표시, context.toolMode 확인 필수, direct stdio 지원 검증 |
| 모드에 맞는 instructions | 채택 | read-only 안내에서 없는 mutation/shell/project_resume 지시 제거 |
| log signature 실행 차단 | 채택 | 전체 모드 log --no-show-signature, 전역 --no-pager |
| clean/process filter를 허용하고 문서화 | 거절 | 조회가 임의 쓰기/명령을 실행하면 읽기 전용 목적에 부적합 |
| read-only의 project_resume 제외 | 채택 및 Claude 후속 APPROVE | 안전한 독립 도구9개만 등록. 일반 모드 Git 기능은 유지 |
| 빈 env를 미설정 취급 | 거절 | 엄격 파싱 유지, 오타/빈 값은 오류; 미설정/0/1만 허용 |
| Control 배지, argv 고정모드 | 보류 | 실제 MCP 모드의 증거 없이 Control env만 보고 표시하지 않음 |
| per-tool/shell allowlist, 세션 내 모드전환 | 거절 | 첫 버전의 고정 모드에 불필요, 셸 문자열 제한은 안전하지 않음 |

**v1의 10개 및 project_resume 유지 내용은 위 결정으로 대체한다.** 읽기 전용 도구는 workstation_context, list_directory, search_files, read_text_file, read_text_files, read_image, shell_list, shell_status, shell_output 9개다. 다섯 금지 도구를 직접 호출해도 미등록 오류가 난다.
Control/터널의 실제 실행은 현재 설치를 변경하지 않으므로 검증하지 않는다. direct stdio만 검증된 지원이며, 다른 경로는 context.toolMode=read_only를 확인하기 전에는 읽기 전용으로 간주하지 않는다. shutdown은 동일 프로세스 jobs map만 정리하므로 유지한다.

## 검증 결과

빌드 및 전체70 passed / 2 플랫폼 skip. direct stdio 격리 프로필에서 일반14개/read-only9개 도구 목록과 toolMode, 금지 도구5개 직접 호출 거부를 확인했다. 읽기 전용 SDK 테스트는 파일 내용 불변과 artifacts 미생성을 확인했다. 실제 Control/터널 경로는 설치를 변경하지 않아 미검증이다.
