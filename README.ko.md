# WorkForge

[English](README.md) | **한국어**

<p align="center">
  <img src="docs/logo/logo.png" alt="WorkForge MCP 로고" width="360" />
</p>

> **ChatGPT는 머리는 좋지만 내 PC에 손이 없습니다. WorkForge는 그 손을 안전하게 연결해 줍니다.**

WorkForge는 ChatGPT가 내 Windows PC의 파일과 프로젝트를 직접 살펴보고, 필요한 파일을 수정하고, 검색하고, PowerShell 명령을 실행할 수 있게 해주는 연결 도구입니다. Git이 설치되어 있다면 브랜치, 커밋, 변경내역 같은 프로젝트 역사도 추가로 확인할 수 있습니다.

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

WorkForge는 현재 12개의 도구를 제공합니다.

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

그러면 콘솔 메뉴 대신 **로컬 WorkForge Dashboard가 기본 브라우저에서 열립니다.** 여기서 현재 상태를 한눈에 확인하고 버튼으로 관리할 수 있습니다.

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

### 제공하는 12개 MCP 도구

```text
workstation_context
project_resume
list_directory
search_files
read_text_file
read_image
write_text_file
replace_text
shell_start
shell_status
shell_output
shell_cancel
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
