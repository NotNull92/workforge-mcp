# TASK-32 — 소스 체크아웃 업데이트 카드와 PowerShell 출력 인코딩

상태: 구현 및 검증 완료 (2026-10-27)

## 증상

Windows 소스 체크아웃(`WorkForge Control.cmd`)에서 Control을 열면 업데이트 카드와 최근 활동에
한글이 깨진 오류가 뜬다.

```
...\scripts\Update.ps1 : '%USERPROFILE%\AppData\Local\Programs\WorkForge\current.json' ��δ� ...
```

UTF-8로 재현한 원문: `Cannot find path '...\AppData\Local\Programs\WorkForge\current.json' because it does not exist.`

## 원인 (두 가지, 서로 독립)

1. **업데이트 경로 오판.** `scripts/control-server.mjs:23-27`의 `capabilities.update`는 `!isMacOS`라서
   Windows면 항상 portable 업데이트를 시도한다. `Update.ps1` → `Get-WorkForgeUpdateDescriptor` →
   `Resolve-WorkForgePortableEngine`은 `%LOCALAPPDATA%\Programs\WorkForge\current.json`을 읽는다.
   소스 체크아웃은 portable 설치가 아니므로 포인터가 없으면 실패하고, 있으면 **실행 중인 엔진과 무관한**
   portable 버전을 "현재"로 보여 준다(둘 다 잘못).
2. **인코딩 불일치.** Windows PowerShell 5.1은 리디렉션된 stdout/stderr를 콘솔 코드페이지(한국어
   Windows는 CP949)로 쓴다. `runChildScript`(`scripts/control-server.mjs:281`, `:289`)는 둘 다
   `chunk.toString('utf8')`로 디코딩한다. 지역화된 PowerShell 오류와, 비ASCII 경로(한글 사용자명 등)를
   담은 stdout JSON이 모두 깨진다. Update뿐 아니라 tunnel-status / start / stop / Doctor / Uninstall
   전부 같은 경로를 쓴다.

## 설계

### A. 소스 체크아웃에서는 자동 업데이트를 끈다

판정: **이 Control의 `toolRoot`가 portable 엔진 루트 아래에 있을 때만** 자동 업데이트를 지원한다.
portable 엔진은 항상 `<ProgramsRoot>\versions\<version>`에서 실행된다(`WorkForge.Portable.ps1`).
`.git` 존재 여부 같은 휴리스틱은 쓰지 않는다(release zip을 압축만 풀고 실행해도 portable이 아니다).

- 판정은 PowerShell 쪽 한 곳에 둔다. `Get-WorkForgePortableRoots`의 `ProgramsRoot`
  (`WORKFORGE_PORTABLE_PROGRAMS_ROOT` override 포함)와 `Update.ps1`의 엔진 루트(`$PSScriptRoot`의 부모)를
  정규화된 전체 경로로 비교한다. 대소문자 무시, 접두 비교 시 경계(`\`)를 확인한다.
- `Update.ps1 -Action Check`: portable 엔진이 아니면 portable 포인터를 읽지 말고
  `{ supported: false, reason: "source-checkout", currentVersion: <package.json version>, latestVersion: null, updateAvailable: false }`를 반환한다.
  네트워크 요청도 하지 않는다.
- `Update.ps1 -Action Apply`: 같은 조건이면 아무것도 바꾸지 않고 명확한 오류로 실패한다(서버가 막더라도
  스크립트 단독 실행 방어).
- `control-server.mjs`: Check 결과가 `supported: false`이면 `performUpdate`를 거부한다. 기존
  macOS 응답(`supported: false`)과 같은 모양을 쓰고, macOS는 `reason: "source-preview"` 등으로 구분해도 된다.
- `control-ui/app.js`: `reason === "source-checkout"`이면 오류 카드 대신 안내 카드를 보인다.
  업데이트 버튼은 숨기거나 비활성화. 4개 언어 키 추가. 문구 예:
  - ko 제목 `소스에서 실행 중입니다`, 본문 `이 WorkForge는 Git 체크아웃에서 실행 중이라 자동 업데이트를 쓰지 않습니다. 저장소에서 git pull 후 npm run build를 실행하세요.`
  - en `Running from source` / `This WorkForge runs from a Git checkout, so automatic updates are off. Run git pull and npm run build in the repository.`
  - ja, zh도 같은 뜻으로.
  - "현재" 칸은 실행 중인 엔진 버전(package.json)을 보여 준다.

### B. PowerShell 자식 프로세스 출력을 UTF-8로 받는다

목표: Control이 띄우는 모든 PowerShell 스크립트의 stdout/stderr가 한국어 Windows에서 깨지지 않는다.

권장안: `runPowerShell` 한 곳에서 해결한다. 각 스크립트 상단에 인코딩 줄을 흩뿌리지 않는다.
후보(구현 시 실제 동작으로 골라라):

1. `-File` 대신 짧은 `-Command` 래퍼로 `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)`를
   먼저 설정한 뒤 스크립트를 호출한다. 인수 전달이 문자열 보간 없이 안전해야 한다(인수는 지금처럼
   고정 값 + 검증된 profileId뿐이지만, 따옴표 주입 여지가 없게 작성). 종료 코드 전파 확인.
2. 노드 쪽에서 활성 OEM 코드페이지로 디코딩(`TextDecoder`). 코드페이지 탐지가 필요하고 스크립트별
   `chcp` 상태에 의존하므로 1보다 약하다.

어느 쪽이든 `WORKFORGE_UPDATE_PROGRESS` stderr 라인 파싱(`consumeUpdateProgressLine`)이 그대로 동작해야
한다. `cmd.exe` 경로(`runChildScript`의 다른 호출)는 이번 범위가 아니다. 영향이 보이면 따로 보고한다.

## 검증

- 새 테스트(또는 기존 `test-control-dashboard.mjs`/`test-update.ps1` 확장):
  - 엔진 루트가 portable `versions\` 아래가 아니면 Check가 `supported:false, reason:"source-checkout"`을
    반환하고 네트워크를 타지 않는다. Apply는 실패하고 portable 루트를 건드리지 않는다.
  - portable 루트 아래에서는 기존 동작 유지(`test-portable-runtime.ps1`, `test-update.ps1` 통과).
  - UI: source-checkout 응답에서 안내 카드가 보이고 업데이트 버튼이 동작하지 않는다(4개 언어 키 존재).
  - 인코딩: 비ASCII(한글) 문자열을 stderr와 stdout으로 내보내는 PowerShell 스크립트를 `runPowerShell`
    경로로 실행해 원문 그대로 받는지 확인. CI는 영어 로캘이므로 CP949를 가정하지 말고, 비ASCII 왕복으로
    검증한다.
- `npm run check:core` 및 기존 Windows 게이트 통과. macOS 게이트 영향 없음.
- 실제 확인: 이 PC의 레포에서 `WorkForge Control.cmd`를 열어 업데이트 카드가 안내 카드로 바뀌고 최근 활동에
  깨진 오류가 없는지 본다.

## 제약

- portable 설치본(`%LOCALAPPDATA%\Programs\WorkForge`)을 이 PC에 만들거나 갱신하지 않는다. 테스트는
  `WORKFORGE_PORTABLE_*` override로 임시 루트를 쓰고, 끝나면 임시 데이터를 삭제한다.
- 자격 증명, tunnel 프로필, 런타임 레지스트리를 커밋하지 않는다. 공개 배포는 이번 범위가 아니다.
- control-ui/app.js는 LF를 유지한다.
- 커밋 이메일은 noreply(`72366776+NotNull92@users.noreply.github.com`)여야 Privacy Gate를 통과한다.
- 이 문서도 구현 커밋에 함께 포함한다.

## 구현 결과

- `Update.ps1`에서 정규화된 portable `versions\` 경계를 비교한다. 소스 실행 Check는 포인터와 네트워크를 읽기 전에 실행 중인 패키지 버전을 반환하며, Apply는 실패한다.
- Control 서버가 unsupported Check 결과에 대한 Apply를 거부하고, UI는 4개 언어의 소스 실행 안내와 비활성화된 업데이트 버튼을 표시한다. 압축만 푼 실행도 고려해 Git 안내는 조건부로 표현한다.
- 공통 PowerShell 래퍼가 UTF-8 출력 인코딩을 설정한다. 경로와 값은 PowerShell 리터럴로 이스케이프하고 명령은 UTF-16LE Base64로 전달한다. 텍스트 오류 출력, 종료 코드, stderr 진행 이벤트를 보존한다.
- Node 스트림은 UTF-8 디코더를 사용해 청크 경계의 다중 바이트 문자를 보존한다.

검증 기록:

- `test:update`: 소스 실행, `versions` 자체 및 유사 접두 경계 차단, 대소문자와 `.` 정규화, portable 분기 유지, 기존 업데이트/롤백 검증.
- `test:control-dashboard`: 4개 언어 안내 렌더링, 버튼 차단, HTTP Check/Apply, 한글 stdout/stderr/예외/진행 이벤트, 따옴표와 명령 구문을 포함한 리터럴 인수, 종료 코드 7 보존 검증.
- `npm run check:windows` (`check:core` 포함) 통과.
- 실제 `WorkForge Control.cmd` 실행 후 한국어 안내 카드, 현재 버전 `0.3.0`, 비활성 업데이트 버튼, 최근 활동의 정상 문자열을 확인했다.
- 기본 portable 설치 디렉터리는 생성하지 않았다. 테스트는 임시 루트를 사용하고 정리했다. macOS 실제 실행, push 및 공개 배포는 수행하지 않았다.
