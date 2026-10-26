# WorkForge

[English](README.md) | **한국어**

<p align="center">
  <img src="docs/logo/logo.png" alt="WorkForge MCP 로고" width="360" />
</p>

> **ChatGPT는 머리는 좋지만 내 PC에 손이 없습니다. WorkForge는 그 손을 안전하게 연결해 줍니다.**

WorkForge는 Windows와 macOS를 위한 범용 워크스테이션 MCP 서버입니다. ChatGPT에서 로컬 파일 읽기, 범위와 예산이 제한된 검색, 충돌 방지 편집, 이미지 확인, 관리된 셸 실행을 사용할 수 있습니다. 저장된 작업 체크포인트와 실행 기록을 확인하며 작업을 이어갈 수 있고, Git이 설치되어 있으면 브랜치·커밋·작업 트리 변경도 살펴볼 수 있습니다.

Windows는 portable Release로 배포하며, macOS는 Apple Silicon과 Intel Mac용 소스 기반 프리뷰입니다. macOS는 설치 ZIP이나 자동 업데이트를 제공하지 않습니다. 두 플랫폼 모두 수동 시작이 기본입니다. 자세한 macOS 설정은 [macOS 안내](docs/MACOS.md)를 확인하세요.

쉽게 말하면 **ChatGPT와 내 컴퓨터 사이에 놓는 안전한 작업용 다리**입니다.

평소에는 이런 식으로 말할 수 있습니다.

```text
"내 프로젝트 읽어보고 지금 어디까지 만들었는지 알려줘."
"이 오류가 왜 나는지 찾아서 고쳐줘."
"README를 최신 기능에 맞게 수정해줘."
"Git 상태 보고 최근 작업을 요약해줘."
"이 폴더에서 빌드 돌리고 오류가 있는지 확인해줘."
```

WorkForge가 연결되어 있으면 ChatGPT는 단순히 방법을 설명하는 데서 끝나지 않고, **실제 내 PC의 프로젝트를 확인하면서 함께 작업할 수 있습니다.**

---

## WorkForge가 왜 필요한가요?

보통 ChatGPT는 내 컴퓨터 안을 볼 수 없습니다.

예를 들어 게임 프로젝트에 오류가 생겼다면 원래는 사람이 직접:

```text
1. 오류 메시지를 복사한다
2. ChatGPT에 붙여넣는다
3. 관련 코드를 찾는다
4. 다시 복사해서 보여준다
5. 수정된 코드를 받는다
6. 직접 파일에 붙여넣는다
7. 빌드한다
8. 새 오류를 다시 복사한다
```

이 과정을 계속 반복해야 합니다.

WorkForge를 사용하면 흐름이 이렇게 바뀝니다.

```text
나
  ↓
"프로젝트 확인하고 오류 원인 찾아서 고쳐줘"
  ↓
ChatGPT
  ↓
WorkForge
  ↓
내 PC의 실제 파일 · 검색 · 선택적 Git 정보 · PowerShell
```

ChatGPT가 필요한 파일을 직접 읽고, 현재 상태를 확인하고, 허용된 범위 안에서 수정과 검증까지 이어갈 수 있습니다.

즉, **복사·붙여넣기로 AI에게 상황을 설명하는 방식에서, AI가 실제 작업 공간을 보고 함께 일하는 방식으로 바뀝니다.**

---

## 그래서 무엇이 좋아지나요?

### 1. 설명할 일이 크게 줄어듭니다

프로젝트 구조, 파일 내용, Git 상태를 매번 사람이 복사해 줄 필요가 없습니다.

```text
기존
"Assets/Scripts에 이런 파일이 있고..."
"여기 코드가 이렇고..."
"최근에 이걸 수정했고..."

WorkForge
"프로젝트 읽어봐."
```

### 2. ChatGPT가 현재 상태를 보고 답합니다

예전 대화나 기억만 믿는 것이 아니라 실제 파일과 Git 상태를 확인할 수 있습니다.

그래서 다음과 같은 질문이 훨씬 자연스러워집니다.

```text
"최근에 뭘 작업했어?"
"이 기능 구현이 어디까지 됐어?"
"지금 빌드 깨지는 이유가 뭐야?"
"이 파일 수정한 다음 테스트까지 해줘."
```

### 3. 수정하고 끝이 아니라 검증까지 이어갈 수 있습니다

WorkForge는 파일을 읽는 것뿐 아니라 PowerShell 작업도 실행할 수 있습니다.

예를 들면:

```text
코드 확인
  ↓
파일 수정
  ↓
빌드 실행
  ↓
오류 확인
  ↓
다시 수정
```

처럼 하나의 흐름으로 작업할 수 있습니다.

### 4. 아무 파일이나 막 덮어쓰지 않습니다

파일을 수정할 때는 현재 파일의 SHA-256을 확인하는 보호 장치를 사용합니다.

쉽게 말하면:

> "내가 읽은 파일이 아직 그대로일 때만 수정한다. 다른 사람이 먼저 바꿨다면 멈춘다."

라는 방식입니다.

그래서 오래된 내용을 기준으로 파일을 덮어쓰는 실수를 줄일 수 있습니다.

### 5. 터미널 작업도 관리된 방식으로 실행합니다

PowerShell 작업은 시작, 상태 확인, 출력 확인, 취소가 각각 분리되어 있습니다.

ChatGPT 연결이 끊겼다고 이전 명령을 몰래 다시 실행하지도 않습니다.

---

## 무엇을 할 수 있나요?

WorkForge는 현재 기본 25개의 도구를 제공합니다.

`search_files`는 maxResults를 넘는 추가 매치를 확인하거나 출력·시간 예산에 도달하면 실제 검색도 종료합니다. `timeoutMs` 기본값은 10초이며 최대 120초까지 지정할 수 있습니다. `stoppedBecause`는 complete/result_limit/timeout/output_limit/error를 구분하고 `elapsedMs`는 경과 시간입니다. 오류가 있어도 이미 반환한 매치는 사용할 수 있습니다. 결과는 전역 정렬된 상위 N개가 아니며, 매우 긴 JSON 한 줄 때문에 완전한 매치를 얻기 전에 출력 한도에 도달할 수 있습니다. 사용자 ripgrep 설정은 도구의 출력 형식·탐색 옵션을 덮어쓰지 못하도록 무시합니다.

여러 파일은 `read_text_files`로 최대 20개까지 한 번에 읽습니다. 예: `{"files":[{"path":"src/server.ts","maxLines":80},{"path":"package.json"}],"maxTotalCharacters":12000}`. 파일별 전체 원본 SHA-256 또는 오류를 반환합니다. 본문 예산은 입력 순서대로 소진되며 뒤의 파일은 건너뛸 수 있습니다. 상대 경로 기준은 기존과 같은 프로필 기본 디렉터리입니다. 배치 원본 읽기는 디코딩 실패까지 포함해 64 MiB(EOF 확인용 최대 1바이트 별도)로 제한하며, JSON 메타데이터는 본문 예산에 포함하지 않습니다.

`characterLimited`는 문자 제한으로 본문이 잘렸다는 뜻입니다. `nextStartLine`은 이어 읽을 줄이며 잘린 줄은 처음부터 다시 읽습니다. 요청한 시작 줄과 같다면 예산을 늘리거나 제한된 CLI 읽기를 사용하세요. 배치 `truncated`는 문자 제한이나 예산으로 건너뛴 파일을, `hasErrors`는 파일별 오류를 나타냅니다. 문자 수는 UTF-16 기준이며 서로게이트 쌍을 보존합니다. 여러 파일의 동일 시점 스냅샷은 보장하지 않습니다.

하지만 도구 이름을 외울 필요는 없습니다. 사용자 입장에서 보면 크게 다섯 가지입니다.

### 📁 파일과 폴더 보기

```text
"이 프로젝트 구조 보여줘."
"Inventory 관련 파일 찾아줘."
"이 설정 파일 읽어줘."
```

### ✏️ 파일 만들고 수정하기

```text
"README에 설치법 추가해줘."
"이 함수 이름을 전체 프로젝트에서 정리해줘."
"새 설정 파일 만들어줘."
```

### 🧭 프로젝트 상태 파악하기

```text
"이 프로젝트 최근 작업 파악해줘."
"Git 변경사항이 뭐야?"
"마지막 커밋 이후 어떤 파일이 바뀌었어?"
```

### 🖥️ PowerShell 실행하기

```text
"빌드 돌려줘."
"테스트 실행해줘."
"이 프로세스 상태 확인해줘."
```

### 🖼️ 로컬 이미지 확인하기

```text
"이 PNG 열어보고 UI가 어떻게 생겼는지 설명해줘."
"이 이미지 크기와 내용을 확인해줘."
```

---

## 어디에 응용할 수 있나요?

WorkForge는 특정 IDE나 특정 게임 엔진 전용 도구가 아닙니다. Windows에서 파일과 명령줄로 작업할 수 있는 프로젝트라면 여러 방식으로 응용할 수 있습니다.

### 개발 프로젝트

```text
Unity
Godot
Node.js
Python
웹 프로젝트
CLI 도구
개인 오픈소스 프로젝트
```

ChatGPT에게 프로젝트를 읽히고, 구현 상태를 파악하고, 수정과 테스트를 이어가게 할 수 있습니다.

### 반드시 Git으로 관리되는 프로젝트여야 하나요?

**아닙니다.** WorkForge의 기본 모드는 일반 로컬 폴더입니다.

```text
C:\Projects\MyGame
C:\Work\Prototype
C:\Documents\Notes
```

처럼 Git 저장소가 아닌 폴더도 읽고, 검색하고, 수정하고, PowerShell 명령을 실행할 수 있습니다.

Git은 **선택 기능**입니다.

```text
Git 없음
→ Local Folder Mode
→ 파일 읽기 / 검색 / 수정 / 이미지 확인 / PowerShell 사용 가능

Git 있음
→ Git Enhanced Mode
→ 위 기능 + 브랜치 / 최근 커밋 / 변경 파일 / staged·unstaged / ahead·behind 파악
```

즉 **Git 없이도 설치부터 프로필 로드와 일반 작업까지 정상적으로 사용할 수 있고, Git이 있으면 과거 작업 흐름까지 더 잘 이해할 수 있습니다.** WorkForge 자체 운영 폴더를 자동으로 Git 저장소로 만들지는 않으며, 이전 버전에서 이미 존재하던 Git 메타데이터만 그대로 보존합니다.

### 오래 쉬었다가 다시 시작한 프로젝트

몇 주 전에 작업한 프로젝트를 열고 이렇게 말할 수 있습니다.

```text
"프로젝트 읽고 최근 Git 기록까지 확인해서 내가 어디까지 했는지 알려줘."
```

WorkForge의 `project_resume(path)`에 실제 프로젝트 경로를 넘기면 운영 폴더와 분리해서 해당 프로젝트의 현재 브랜치, 변경 파일, 최근 커밋을 확인할 수 있습니다.

새 대화에서 작업을 이어가려면 프로젝트 `path`와 함께 `resumePaths: ["docs/HANDOFF.md"]`를 전달하세요. 저장한 목표·결정·다음 단계를 Git 상태와 함께 읽습니다. 문서 경로는 지정한 프로젝트 디렉터리 기준이며, 명시한 UTF-8 문서 최대 8개를 `resumeDocuments`로 반환합니다. 문서당 400줄·12,000자 제한, 전체 파일 SHA-256, 잘림 표시를 포함하며 Git 없이도 동작합니다. 문서가 없거나 접근이 금지되면 요청은 실패합니다. 문서 내용은 신뢰되지 않은 데이터로 취급하고, 수정이나 명령 실행 전에는 `workstation_context`를 조회하세요.

### 오류 해결

```text
"빌드해보고 오류가 나면 관련 파일 찾아서 원인 분석해줘."
```

사람이 오류 로그와 코드를 계속 복사해서 전달하는 과정을 줄일 수 있습니다.

### 문서 관리

```text
"현재 기능 기준으로 README 다시 작성해줘."
"설치 스크립트와 문서 내용이 서로 맞는지 검사해줘."
```

실제 코드와 문서를 함께 읽을 수 있기 때문에 문서가 오래되어 틀리는 문제를 줄이는 데 유용합니다.

### 반복 작업 자동화

```text
"이 폴더 안 파일들 검사해서 규칙에 맞지 않는 것 찾아줘."
"테스트 실행하고 실패한 항목만 정리해줘."
```

단, WorkForge는 Windows 전체를 마음대로 자동 조종하는 프로그램이 아닙니다. 파일과 PowerShell을 중심으로 동작하며 Windows 계정 권한과 WorkForge의 안전 규칙 안에서 움직입니다.

---

## 사용법은 어렵지 않나요?

일반 설치는 **3단계**입니다.

```text
1. ZIP 다운로드
2. 압축 풀고 Setup.cmd 실행
3. ChatGPT에서 같은 Tunnel 연결
```

Node.js와 ripgrep을 미리 하나씩 찾아 설치할 필요도 없습니다. Git을 쓰고 싶다면 Setup에서 선택적으로 추가할 수 있습니다.

### Codex에게 설치 준비 요청하기

Codex에 이 저장소 URL을 주고 WorkForge 설치를 요청할 수 있습니다.
다음 문장을 그대로 사용해도 됩니다.

```text
https://github.com/NotNull92/workforge-mcp 에서 이 Windows PC에 WorkForge 설치해줘.
가장 최근에 공개된 GitHub Release의 WorkForge-v*-win-x64.zip과 짝이 맞는 .sha256 파일을 사용해.
main을 clone하거나 빌드하지 마. 체크섬을 검증하고 새 로컬 폴더에 압축을 풀어서 정확한 Setup.cmd 경로를 알려줘.
대화형 Windows 설치 프로세스를 실행할 수 있으면 Setup.cmd를 시작하고 Tunnel ID와 Runtime API Key는 내가 Setup에 직접 입력하게 해줘.
이 값들을 채팅이나 명령행 인수로 요청·읽기·저장·출력·전달하지 마.
Windows 시작 프로그램을 활성화하지 마. 필요한 Release 파일이 없으면 소스로 설치하지 말고 중단한 뒤 알려줘.
```

안전한 에이전트 설치 규칙은 다음과 같습니다.

- 소스 checkout, branch ZIP, `npm install`, 로컬 빌드 대신 최신 [GitHub Release](https://github.com/NotNull92/workforge-mcp/releases/latest)를 사용합니다.
- `WorkForge-v*-win-x64.zip`과 짝이 맞는 `.sha256` 파일이 모두 있어야 하며, 압축을 풀기 전에 체크섬을 검증합니다.
- 새 로컬 폴더에 압축을 풉니다. Codex가 대화형 Windows 프로세스를 실행할 수 없으면 정확한 `Setup.cmd` 경로를 알리고 중단합니다.
- Tunnel ID와 Runtime API Key는 Setup에만 입력합니다. 두 값 모두 Codex 대화에 붙여넣지 않습니다.
- Install, Repair, Upgrade 판단은 `Setup.cmd`에 맡깁니다. 다시 설치하기 위해 기존 WorkForge를 삭제하지 않습니다.
- Windows 자동 시작을 끄고 유지합니다. ChatGPT 플러그인 생성과 workspace 승인은 사용자가 수동으로 완료합니다.
- 완전한 공개 Release가 없으면 중단합니다. 소스 checkout은 개발자 작업이며 일반 사용자 설치 fallback이 아닙니다.

Codex는 GitHub 다운로드나 현재 workspace 밖에 파일을 쓰기 위해 승인을
요청할 수 있습니다. 예상한 Release 파일과 대상 폴더가 정확할 때만 승인하세요.
OpenAI의 현재 네트워크·파일 승인 경계는
[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)에서 확인할 수 있습니다.

### 1. 다운로드하고 압축 풀기

최신 Release의 다음 파일을 다운로드합니다.

```text
WorkForge-v*-win-x64.zip
```

아무 로컬 폴더에 압축을 풉니다. `Setup.cmd`가 패키지를 검증한 뒤 활성
버전을 `%LOCALAPPDATA%\Programs\WorkForge` 아래에 배치합니다.

### 2. Setup 실행

다음 파일을 더블클릭합니다.

```text
Setup.cmd
```

Release ZIP에는 다음 런타임이 고정 버전으로 포함되고 검증됩니다.

```text
포함
✓ Node.js 24 x64    WorkForge 실행
✓ ripgrep           빠른 파일·텍스트 검색
✓ tunnel-client     명시적으로 시작하는 ChatGPT Secure MCP Tunnel 경로

선택
○ Git for Windows   브랜치·커밋·변경내역까지 이해하는 Git Enhanced Mode
```

동작 방식은 단순합니다.

```text
Git이 없음             → Git 없이 계속하거나 선택적으로 설치
기존 WorkForge 버전    → 나란히 설치·검증하고 Tunnel을 새 Runtime에 다시 연결한 뒤 current.json 전환
```

즉, **이미 잘 설치된 프로그램을 다시 설치하지 않고 Git이 없다고 설치를 막지도 않습니다.**

### v0.1.0에서 업데이트하기

이미 공개된 v0.1.0에는 업데이트 UI 자체가 들어 있지 않기 때문에 **v0.2.x 계열로 들어갈 때 한 번만 수동 브리지**가 필요합니다. **v0.2.1 또는 그보다 최신 stable Windows Release ZIP**을 다운로드해 새 폴더에 압축을 풀고 그 안의 `Setup.cmd`를 실행하세요. 기존 v0.1.0을 먼저 삭제하면 안 됩니다. 최초 v0.2.0 ZIP에는 업데이트 성공 직후 Setup 인자 전달 오류가 있으므로 새 v0.1.0 브리지에는 사용하지 않는 것을 권장합니다.

이 Setup은 단순 덮어쓰기가 아니라 트랜잭션 방식으로 업데이트합니다. 새 엔진 전체의 무결성을 먼저 검증하고 v0.1.0은 rollback 대상으로 그대로 보관합니다. 실행 중이던 Tunnel만 중지한 뒤 새 엔진을 활성화하고, 기존 `tunnel.local.yaml`을 새 Node/stdio 절대경로에 맞게 다시 생성하되 보호된 Runtime API Key는 다시 쓰지 않습니다. 로컬 Doctor 검증까지 통과하면 이전에 실행 중이던 Tunnel만 다시 시작합니다. 중간에 실패하면 `current.json`과 원래 Tunnel 설정을 복원하고 이전 엔진을 다시 활성화합니다.

**v0.2.0부터는 이후 업데이트를 `WorkForge Control → Update WorkForge`에서 버튼 한 번으로 진행할 수 있습니다.** 알려진 Setup 오류가 발생했더라도 v0.2.0이 이미 활성화되어 있다면 재설치나 rollback은 필요하지 않으며, 그대로 v0.2.1 이상으로 업데이트하면 됩니다.

Portable Release는 Node.js나 ripgrep 설치에 WinGet을 사용하지 않습니다.
소스 체크아웃의 개발자 경로만 기존의 동의 기반 prerequisite bootstrap을
유지합니다. Git은 항상 별도 선택이며 기본값은 **Git 없이 계속**입니다.

Release ZIP에는 컴파일된 MCP 서버, 운영용 npm 의존성, 고정된 Windows
런타임이 들어 있습니다. 일반 사용자는 npm, TypeScript, Vitest 같은 개발
도구를 실행할 필요가 없습니다.

### 3. ChatGPT 연결 마무리

Setup 과정에서 본인이 사용할 수 있는 OpenAI Platform Tunnel ID와 Runtime API Key가 필요합니다.

터널 구성이 완료되면 Setup이 ChatGPT 플러그인 페이지를 엽니다.
WorkForge 터널을 실행한 상태에서 다음 수동 승인 절차를 완료합니다.

이 순서는 OpenAI의 현재
[플러그인 연결 안내](https://developers.openai.com/plugins/deploy/connect-chatgpt)를 따릅니다.

1. **설정 > 보안 및 로그인**에서 **개발자 모드**를 활성화합니다.
2. 플러그인 화면에서 **플러그인 검색** 오른쪽의 **+**를 누릅니다.
3. 아이콘은 선택 사항입니다. 이름에 **WorkForge**를 입력합니다.
4. **연결 > 터널**을 선택하고 WorkForge용으로 생성한 터널을 선택합니다.
5. **인증**은 **인증 없음**을 선택합니다.
6. 화면 하단의 확인 체크박스를 선택하고 **만들기**를 누릅니다.
7. 플러그인 페이지의 **설치됨** 항목에 **WorkForge**가 표시되는지 확인합니다.

연결을 확인하려면:

1. **Work**가 아닌 **Chat** 모드에서 새 대화를 시작합니다.
2. `@WorkForge`를 입력해 플러그인을 선택하거나 도구 메뉴에서 WorkForge를 선택합니다.
3. 같은 대화창에 로컬 프로젝트의 전체 경로와 요청을 입력합니다.

```text
C:\Projects\MyGame 프로젝트 파악해
```

플러그인을 찾고 WorkForge를 호출하는 동안에는 터널이 계속 실행 중이어야
합니다. Windows를 다시 시작한 후에는 **WorkForge Control**에서 수동으로
시작합니다. Setup은 WorkForge를 Windows 시작 프로그램으로 등록하지 않습니다.

---

## 설치가 끝나면 어떻게 쓰나요?

특별한 명령어를 외울 필요가 없습니다.

ChatGPT에게 평소 말하듯 요청하면 됩니다.

예를 들어:

```text
"C:\Projects\MyGame 프로젝트 확인하고 현재 상태 파악해줘."
```

```text
"이 프로젝트 빌드하고 오류가 있으면 원인 찾아줘."
```

```text
"최근 작업 내용 보고 README 업데이트해줘."
```

```text
"이 파일 수정하기 전에 현재 내용 확인하고 안전하게 바꿔줘."
```

ChatGPT가 필요한 WorkForge 도구를 선택해서 사용합니다.

---

## 평소에는 WorkForge Control만 열면 됩니다

설치가 끝난 뒤에는 `Setup.cmd`를 반복해서 실행할 필요가 없습니다. 평소에는 설치된 **WorkForge Control** 바로가기나 `%LOCALAPPDATA%\Programs\WorkForge\WorkForge Control.cmd`를 사용하는 것을 권장합니다. 압축을 푼 release root의 lifecycle wrapper도 별도의 두 번째 Runtime으로 동작하지 않고 현재 설치된 active engine으로 위임됩니다.

다음을 더블클릭합니다.

```text
WorkForge Control.cmd
```

그러면 콘솔 메뉴 대신 **로컬 WorkForge Dashboard가 기본 브라우저에서 열립니다.** 여기서 현재 상태를 한눈에 확인하고 버튼으로 관리할 수 있습니다. 이 절의 `WorkForge Control.cmd`와 자동 업데이트 설명은 Windows portable Release 기준입니다. macOS 소스 프리뷰도 `WorkForge Control.command` 대시보드에서 시작·중지·상태·온라인 Doctor·프로필 해제를 지원하지만, 자동 업데이트와 **모두 제거**는 제공하지 않습니다.

![언어 전환, 준비된 터널 상태, Doctor 카드가 보이는 한국어 WorkForge 제어판](docs/images/workforge-control-dashboard-ko.jpg)

*한국어로 표시한 Dashboard입니다. 오른쪽 위 언어 버튼에서 English, 한국어, 日本語, 中文으로 바꿀 수 있습니다.*

```text
Secure Tunnel   Online / Offline
Health          Healthy / Attention
Readiness       Ready / Waiting
Supervisor      Running / Stopped
Recovery        Normal / Recovering
```

Dashboard에서 바로 할 수 있는 일:

- **Start Tunnel**: ChatGPT가 WorkForge에 접속할 수 있도록 Tunnel을 켭니다.
- **Stop Tunnel**: Tunnel과 Supervisor를 안전하게 중지합니다.
- **Refresh**: 현재 상태를 즉시 다시 확인합니다.
- **Run Doctor**: 프로필, Runtime, Tunnel Client, 자격 증명, 온라인 연결을 검사합니다.
- **Update WorkForge**: 공식 stable GitHub Release를 확인하고 ZIP/checksum 및 새 엔진 무결성을 검증한 뒤 트랜잭션 방식으로 업데이트합니다.
- **Recent Activity**: 방금 어떤 일이 일어났는지 쉬운 문장으로 확인합니다.
- **Uninstall**: 실제 삭제 전에 `WhatIf` 미리보기를 보여주고 다시 확인을 받습니다.

Dashboard는 가능한 경우 브라우저 언어로 처음 열리고, 사용자가 고른 언어를 기억합니다. 업데이트 중에는 제어판 창을 열어 두세요. 진행 화면에서 확인, 다운로드, 검증, 스테이징, 터널 일시 중지와 재연결, Doctor, 재시작, 마무리 단계를 차례대로 보여줍니다. 검증 단계에 실패하면 섞인 설치 상태를 남기지 않고 이전 엔진으로 안전하게 되돌립니다. 업데이트가 성공하면 이전 엔진의 Control Server를 종료하므로 예전 Dashboard가 새로 활성화된 엔진을 상대로 상태를 계속 조회하지 않습니다. 업데이트 탭을 닫고 **WorkForge Control**을 다시 열어 활성 버전의 Dashboard를 사용하세요.

Dashboard는 인터넷에 공개되는 관리 페이지가 아닙니다. **현재 PC의 `127.0.0.1`에서만 열리는 로컬 화면**이며, 실행할 때마다 새로운 세션을 사용합니다. 브라우저 탭을 닫고 요청이 없어지면 백그라운드 Control Server도 일정 시간 뒤 자동 종료됩니다.

기존 터미널 Control은 삭제하지 않았습니다. 브라우저 GUI가 열리지 않거나 복구 작업이 필요하면 다음처럼 사용할 수 있습니다.

```text
WorkForge Control.cmd --cli
```

또는 고급 사용자는 `scripts\Control.ps1`의 `start`, `stop`, `status`, `doctor` 액션을 직접 호출할 수 있습니다.

---

## 안전한가요?

WorkForge는 PC에 강한 권한을 부여하는 도구이기 때문에 편리함만큼 안전장치도 중요하게 다룹니다.

### Windows 권한을 넘어서지 않습니다

WorkForge는 현재 로그인한 Windows 사용자의 권한으로 동작합니다.

관리자 권한을 자동으로 얻거나 Windows 보안 경계를 우회하는 도구가 아닙니다.

### Windows 시작 시 자동 실행되지 않습니다

WorkForge는 기본적으로 다음을 만들지 않습니다.

```text
Windows Service
Scheduled Task
Startup Item
Run Registry
```

컴퓨터를 재부팅하면 Tunnel은 자동으로 다시 켜지지 않습니다.

### 명령을 자동 재실행하지 않습니다

연결이 끊겼다고 이전 PowerShell 명령을 자동으로 다시 실행하지 않습니다.

### 파일 수정에는 현재 상태 확인이 필요합니다

SHA-256 기반 보호를 사용해 이미 바뀐 파일을 오래된 내용 기준으로 덮어쓰는 위험을 줄입니다.

### Runtime API Key를 일반 로그에 남기지 않습니다

자격 증명은 보호된 로컬 파일에 저장하며, 프로젝트 명령을 실행할 때 해당 키가 자식 프로세스로 흘러가지 않도록 제거합니다.

ForgeUI 로그에서도 사용자 홈 경로, 전체 Tunnel ID, 일반적인 API Key 형태를 마스킹합니다.

---

## ForgeUI

설치와 관리 화면도 긴 PowerShell 로그를 그대로 쏟아내는 대신 단계별로 읽기 쉽게 보여줍니다.

```text
✓ Environment
✓ Prerequisites
✓ Runtime and profile
◆ Secure tunnel
○ Health check
○ ChatGPT handoff
```

성공, 경고, 실패 이유를 한눈에 볼 수 있고 오류가 발생하면 다음에 무엇을 해야 하는지도 함께 표시합니다.

외부 `gum.exe`나 Go Runtime은 필요하지 않습니다. ForgeUI는 PowerShell로 구현되어 있습니다.

CI, 출력 리디렉션, `NO_COLOR`, `WORKFORGE_PLAIN_UI=1`, `-Plain` 환경에서는 자동으로 단순한 텍스트 출력으로 바뀝니다.

---

## 기존에 설치한 WorkForge가 있다면

`Setup.cmd`를 다시 실행하면 자동으로 상태를 판단합니다.

```text
처음 설치     → Install
이미 설치됨   → Repair
```

Repair는 사용자가 수정한 정책 파일, Tunnel 설정, 자격 증명 등을 함부로 덮어쓰지 않습니다.

Upgrade에서도 배포 템플릿이 달라졌다면 기존 파일을 덮는 대신 `<file>.new` 후보를 만들어 사용자가 비교할 수 있게 합니다.

---

## 제거하기

다음을 더블클릭합니다.

```text
Uninstall.cmd
```

두 가지 선택지가 있습니다.

### KeepWorkspace 권장

WorkForge 연결과 런타임 상태는 지우지만 사용자의 작업공간은 남깁니다.

```text
남김
- WorkForge 작업 폴더
- Git 기록
- 사용자가 수정한 정책 파일
- 사용자가 만든 파일

제거
- Tunnel 설정
- 로컬 Runtime 자격 증명
- WorkForge 실행 상태와 로그
- 프로필 Registry 연결
- 검증된 Release 엔진
```

### RemoveEverything

작업공간까지 모두 지웁니다.

실수로 선택하는 것을 막기 위해 대화형 실행에서는 정확히 다음 문구를 입력해야 합니다.

```text
REMOVE WORKFORGE
```

WorkForge는 개발 중인 소스 저장소를 자동으로 삭제하지 않습니다.

자세한 내용은 [WorkForge 제거 가이드](docs/UNINSTALL.md)를 참고하세요.

---

## WorkForge는 무엇이 아닌가요?

WorkForge는 다음과 같은 도구는 아닙니다.

- Windows 전체를 마음대로 클릭하는 원격 데스크톱 봇
- 관리자 권한을 몰래 얻는 프로그램
- 컴퓨터를 켜자마자 항상 실행되는 백그라운드 서비스
- 모든 명령을 무조건 허용하는 자동화 엔진
- 특정 IDE나 Unity에만 묶인 전용 플러그인

WorkForge의 역할은 **ChatGPT와 로컬 Windows 작업 환경 사이에 명확하고 검증 가능한 작업 통로를 제공하는 것**입니다.

---

## 조금 더 기술적으로 알고 싶다면

여기부터는 WorkForge 내부 구조나 개발에 관심 있는 사람을 위한 내용입니다.

### 제공하는 기본 25개 MCP 도구

```text
workstation_context
project_resume
list_directory
search_files
read_text_file
read_text_files
read_image
write_text_file
replace_text
shell_start
shell_list
shell_status
shell_output
shell_cancel
task_checkpoint
task_list
task_resume
read_text_stream
suggest_related_files
shell_prune
workstation_lock_read_only
task_history
task_delete
task_claim
task_release
```

### 기본 프로필

기본 운영 프로필은 다음 위치에 만들어집니다.

```text
%USERPROFILE%\WorkForge
```

이 폴더에는 WorkForge가 작업할 때 참고하는 운영 지침과 프로필 정보가 저장됩니다.

### Runtime 동작

- Windows 시작 프로그램을 만들지 않습니다.
- Tunnel은 사용자가 명시적으로 시작합니다.
- 비정상 종료 시 동일 프로필 Supervisor가 제한된 횟수 안에서만 복구를 시도합니다.
- 명령은 연결이 끊긴 뒤 자동 재실행되지 않습니다.
- PowerShell 자식 프로세스는 Windows Job Object로 관리됩니다.
- 같은 프로필에서 동시에 여러 Shell 작업이 충돌하지 않도록 직렬화합니다.
- 직접 파일 도구는 등록 프로필 경계를 강제하지만, PowerShell은 작업 디렉터리만 같은 경계를 검증합니다. PowerShell 명령 자체는 OS 샌드박스가 아니며 현재 Windows 사용자의 ACL/UAC 권한을 그대로 가집니다.

### 진단

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Doctor.ps1 -Online
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status
```

문제가 생기면 [Troubleshooting](docs/TROUBLESHOOTING.md)을 참고하세요.

### 소스 개발

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run smoke:stdio -- workstation
npm.cmd run release
```

`npm run check`는 TypeScript 테스트뿐 아니라 Git 없는 설치, 멀티프로필, prerequisite 감지, 로컬 Control Dashboard, CLI fallback, ForgeUI, Uninstall, 과거 Git 기록 Privacy 검사, Security, Tunnel Recovery, 운영 의존성까지 함께 검증합니다.

### Privacy Gate

공개 저장소에 개인정보나 자격 증명이 실수로 들어가는 것을 막기 위해 현재 추적·미추적 파일뿐 아니라 **Git history에 남아 있는 과거 텍스트 blob**까지 검사합니다. 현재 파일에서 지운 값도 과거 커밋에 남아 있으면 Gate가 실패합니다.

예를 들어 다음 항목을 차단합니다.

```text
개인 사용자 홈 경로
실제 이메일 주소
실제 Tunnel ID
API Key 형태의 값
전화번호
사설 네트워크 정보
Runtime 로그
생성된 Registry와 Credential 파일
```

GitHub Actions에서도 Push와 Pull Request마다 동일한 검사가 실행됩니다.

---

## 더 알아보기

- [보안 정책](SECURITY.md)
- [문제 해결](docs/TROUBLESHOOTING.md)
- [제거 가이드](docs/UNINSTALL.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [프로필 추가](docs/ADDING_PROFILES.md)

## 라이선스

WorkForge는 [MIT License](LICENSE)로 배포됩니다.

`shell_list`는 명령을 재실행하지 않고 현재 프로필의 최근 작업을 찾습니다. 최대 20,000개 항목에서 디렉터리 수정 시각으로 limit의 두 배 후보를 고른 뒤 검증된 기록을 생성 시각순으로 정렬합니다. 전체 이력의 정확한 최신순 조회는 아니며 필터나 손상된 후보 때문에 결과가 적을 수 있습니다. `truncated`는 제외된 후보도 포함하고 `scanLimited`는 탐색 한도를 표시합니다. 선택적 `cwd`는 저장된 경로와 비교하며 Windows 대소문자는 무시하지만 junction 별칭은 일치하지 않을 수 있습니다. 출력 무결성 확인에는 `shell_output`을 사용합니다.

`replace_text`는 기존 `oldText`/`newText` 쌍 또는 1~100쌍의 `edits` 배열을 받습니다. 모든 편집은 동일한 원본 기준이며 oldText는 자기 겹침까지 포함해 유일해야 하고 편집 범위는 겹칠 수 없습니다. 전체 검증 후 한 번만 저장합니다. 배치 문자열은 각각 1Mi UTF-16 코드 단위, 요청 파싱 후 UTF-8 합계16MiB까지이며 최종 파일도16MiB까지입니다. 실패 시 본문 대신 입력 인덱스를 표시하고 성공 시 `editsApplied`를 반환합니다.

조사 전용 MCP 세션은 **서버를 시작하는 부모 프로세스**에 `WORKFORGE_MCP_READ_ONLY=1`을 설정하고 `node dist/stdio.js --profile workstation`으로 시작합니다. PowerShell은 `$env:WORKFORGE_MCP_READ_ONLY = '1'`, POSIX는 `WORKFORGE_MCP_READ_ONLY=1 node dist/stdio.js --profile workstation`입니다. 미설정 또는 `0`은 기본 모드이고 빈 값 등 다른 값은 시작 오류입니다. 모드는 재시작 전까지 고정됩니다.

기본 읽기 전용은 14개 도구를 제공합니다. 쓰기·교체·셸 시작/취소·체크포인트 저장·`project_resume`는 미등록이므로 직접 호출도 실패합니다. Git 조회 중에도 저장소 필터가 프로그램을 실행할 수 있어 Git snapshot은 제외합니다. `workstation_context.toolMode`가 `read_only`인지, 기본 도구가 14개인지 반드시 확인하세요. 시작 stderr에도 모드를 표시합니다. **direct stdio에서만 검증했습니다. Control/터널로 시작했다면 toolMode 확인 전까지 읽기 전용이라고 간주하지 마세요.** 이미 열린 런처는 이전 환경을 유지할 수 있습니다. 이 모드는 MCP 도구를 제한하며 다른 서버·로컬 프로그램·OS 권한을 제한하지 않습니다.

도구의 structured/text 응답과 handler 오류에 알려진 비밀값 및 패턴 마스킹을 적용합니다. 시작 시 자격 증명형 환경 값을 수집하되 경로는 제외하며 최대256개/각4096자/전체64KiB입니다. 상한 초과 값은 개수만 stderr에 표시합니다. 토큰 접두사, 대입문, Bearer, URL 비밀번호, PEM 경계도 처리하고 `_meta.redactionCount`에 치환 횟수를 넣습니다. text JSON은 마스킹된 structured 결과에서 만듭니다.

WORKFORGE_REDACTED 대괄호 marker는 원본이 아니므로 이를 포함하는 mutation 입력은 거부하며 marker 자체의 리터럴 기록도 지원하지 않습니다. 원본 해시·페이지 offset·줄 번호는 바꾸지 않으므로 반환된 continuation 필드를 사용하세요. 모든 비밀을 검출하는 기능은 아닙니다. 알 수 없는 값의 다음 페이지 조각, PEM 내부만 있는 페이지, 인코딩된 값, 이미지, 디스크 원본 로그는 보호 범위 밖입니다. 원문 응답 해제 도구는 제공하지 않습니다.

`task_list`로 작업 ID를 찾고 `task_resume`로 보고된 상태와 별도 실행 근거를 읽습니다. `task_checkpoint`는 상태 전체를 교체하며 첫 저장은 `expectedSha256: "absent"`, 이후는 현재 체크포인트 원본 해시를 전달합니다. 충돌 시 덮어쓰지 않습니다. ID는 소문자 기반 이식 가능한 이름(Windows 예약명 제외), 저장 한도는128KiB이며 탐지된 비밀값/marker는 저장 전에 거부합니다. 필드별 상한 합계가 저장 한도를 넘을 수 있고 크기 오류에는 실제 바이트 수가 나옵니다.

`reportedStatus: completed`는 보고일 뿐 성공 검증이 아닙니다. `shell_output`으로 로그 무결성을, 별도 파일/Git 조회로 현재 소스를 확인하세요. 읽기 전용에서도 목록·재개는 가능하지만 저장은 차단합니다. 프로필의 무시된 런타임 디렉터리에 현재 snapshot과 이전 20개 revision을 보관하며 자동 명령 재실행이나 대화 수집은 하지 않습니다. 목록은 mtime 후보 기반의 제한된 조회이므로 정확히 선택할 작업 ID는 인계 문서에도 남기는 것이 좋습니다.

Control은 보고된 체크포인트와 저장된 실행 기록을 각각 최대5개 표시하며 재개 문구를 복사할 수 있습니다. 종료 기록이 없으면 진행 중이거나 비정상 종료일 수 있고, 대시보드는 실제 실행 소유권이나 MCP 모드를 추정하지 않습니다. 30초마다 갱신하고 서버는20초 캐시를 사용하며 새로고침 버튼으로 직접 갱신할 수 있습니다. 조회 실패 시 이전 기록과 오래된 상태 안내를 함께 표시합니다.

Control 대시보드는 게임 스타일 커맨드 HUD로 표시됩니다. SYSTEMS 게이지는 점수가 아니라 Doctor 체크리스트 네 항목(프로필, 터널 프로세스, Supervisor, MCP 준비 상태)의 판정을 그대로 보여 줍니다. 작업 카드는 보고된 상태라는 뜻으로 점선 레일을, 종료 기록이 없는 실행은 실행 중 표시 대신 사선 레일을 씁니다. 단축키: Alt+Shift+S 시작, Alt+Shift+X 정지, Alt+Shift+R 새로고침, Alt+Shift+D Doctor. Alt+Shift를 누르고 있으면 버튼에 키가 표시되며, 입력 칸과 대화 상자 안에서는 동작하지 않습니다. 시스템의 동작 줄이기 설정을 켜면 모든 연출이 멈춥니다.

셸 기록은 label과 명령 SHA-256을 포함한 manifest v2로 저장하며 명령 원문은 저장하지 않습니다. 새 엔진은 v1도 읽지만 이전 엔진은 v2를 manifest_invalid로 처리합니다. 짧은 명령은 해시로 추측을 확인할 수 있으므로 명령에 비밀을 넣지 마세요. 조건부 읽기는 본문만 생략하고 전체 파일 I/O는 수행합니다. replace_text는 dryRun, expectedCount와 적용 후 줄 범위를 지원합니다.

### 도구 옵션과 보안 경계

기본 도구는 25개, 읽기 전용은 14개입니다. 아래 설정은 시작 시 한 번 읽으며 허용값 밖의 값은 시작 실패입니다. 실제 설치·터널 설정은 이번 소스 변경으로 바뀌지 않습니다.

| 환경 변수 | 허용값 / 기본값 | 효과 |
| --- | --- | --- |
| WORKFORGE_MCP_READ_ONLY | 미설정, 0, 1 / 미설정 | 읽기 전용 제한 |
| WORKFORGE_MCP_TOOLS | 중복 없는 쉼표 구분 도구명 / 미설정 | 현재 모드의 목록 축소만; context 유지 |
| WORKFORGE_MCP_REDACTION_RULES | 안전한 JSON 절대 경로 / 미설정 | 리터럴·키 규칙, 파일 및 합산 리터럴 64KiB 제한 |
| WORKFORGE_MCP_REDACT_ENTROPY | 미설정, 0, 1 / 미설정 | 대입문 문맥만 엔트로피 탐지 |
| WORKFORGE_MCP_REDACTION | on, off / on | off는 원문 응답 노출; marker 쓰기·비밀 저장 거부 유지 |
| WORKFORGE_MCP_REDACT_SHELL_LOGS | 미설정, 0, 1 / 미설정 | 줄 단위 디스크 로그 마스킹 |
| WORKFORGE_MCP_READ_ONLY_EXTRAS | 미설정, 0, 1 / 미설정 | 고정 Git preset 및 필터 무력화 resume 2개 추가 |
| WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT | 미설정, 0, 1 / 미설정 | 여러 파일 편집·unified patch 2개 추가 |

`--read-only`는 env=0보다 우선합니다. 세션 잠금은 되돌릴 수 없으며 기존 작업은 계속 실행되고 shell_cancel은 남습니다. 시작 instructions는 고정입니다. context는 실제 도구 목록·모드 출처·마스킹 설정을 반환합니다. 디스크 마스킹은 64KiB를 넘는 줄 전체를 생략하고 suppressedLongLines로 집계합니다. 줄바꿈 없는 바이너리성 출력은 marker 하나가 될 수 있습니다. 해시는 저장된 바이트 기준입니다. Git 읽기 전용 확장은 submodule 상태를 제외하며, 같은 OS 사용자가 설정을 동시에 바꾸는 경쟁 조건까지 차단하는 샌드박스는 아닙니다.

이력은 이전 20개이며 revisionSha256으로 선택합니다. 이력 실패에도 현재 체크포인트는 저장될 수 있으므로 반환된 해시로 다음 갱신을 수행합니다. 자동 생성 ID는 명시적으로 반환합니다. claim은 안내용이고 실제 충돌 방지는 CAS입니다. task_delete는 CAS와 DELETE_TASK, shell_prune 실제 삭제는 DELETE_SHELL_RECORDS 확인값이 필요합니다. 두 확인값은 사용자 확인 후에만 넣습니다. prune 기본값은 미리보기이며 현재 작업·최근 기록·체크포인트 참조를 보존하고 참조 확인 실패 시 중단합니다.

여러 파일 편집은 전체 검증 후 순서대로 lease를 잡지만 파일시스템 트랜잭션은 아닙니다. 부분 실패 복원은 최선형입니다. 실패·정리 경고로 남은 journal에는 비밀을 포함한 원본 바이트가 있을 수 있으므로 확인 후 수동 정리하고 자동 재실행하지 마세요. 하드링크 미지원 파일시스템에서는 exclusive_write_fallback 경고와 함께 독점 쓰기로 생성하므로 비정상 종료의 원자성이 약합니다. link/unlink 사이 종료로 남은 .workforge-multi-*.tmp는 수동 확인·정리가 필요할 수 있습니다.

스트리밍 읽기는 전체 해시를 제공하지 않아 편집 근거로 쓸 수 없습니다. glob 선택은 개수 제한이 있고 관련 파일 제안은 경계 검사를 거친 휴리스틱입니다. 검색 sort:path는 rg 단일 스레드 정렬, columns는 긴 줄 제한과 UTF-8 대체 디코딩을 사용합니다.
