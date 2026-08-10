# WorkForge Agent Plugin / Portable Runtime Handoff

Date: 2026-08-09
Status: **Design investigation next. Do not implement until the plan is reviewed.**

## Purpose

Continue WorkForge development in Codex from the current stable `main` baseline.
The next topic is not another incremental setup tweak. Re-evaluate the installation
and distribution architecture around two ideas:

1. adopting the Agent Plugins standard where it genuinely reduces client-specific packaging;
2. moving WorkForge toward a portable bundled runtime so first-time Windows setup becomes much simpler.

The goal is to reduce user-facing installation concepts without weakening the security,
privacy, lifecycle, and local-control guarantees already established in WorkForge 1.2.

## Current baseline

Repository: `NotNull92/workforge-mcp`
Branch: `main`
Baseline HEAD before this handoff was created:

```text
9fdfe9f322020b655e9258add6284e260b2154f4
fix: harden profile lifecycle and Windows runtime boundaries
```

At that baseline:

```text
HEAD == origin/main                     yes
worktree                                clean
TypeScript test files                   6 / 6 passed
TypeScript tests                        35 / 35 passed
no-Git lifecycle                        passed
multi-profile lifecycle                 passed
Control Dashboard                       passed
historical privacy regression           passed
Privacy invariants                      passed
Security invariants                     passed
Tunnel recovery                         passed
production npm audit                    0 vulnerabilities
release package validation              passed
GitHub Privacy Gate                     passed
GitHub Windows Quality Gate / Node 20   passed
GitHub Windows Quality Gate / Node 24   passed
```

After this handoff file is created, expect this document itself to be the only intentional
new local change unless the user or another agent has made additional changes. Verify rather
than assume.

## Recently completed work

The current `main` already includes these corrections and they are part of the contract to preserve:

- Git is optional. Ordinary local folders work without `.git`.
- A no-Git installation reloads through the shared profile registry and passes lifecycle preflight.
- Multi-profile loading works. New profiles do not emit the unused `httpPort`; older valid v1
  profiles may still contain it as ignored compatibility metadata.
- Windows path comparison/canonicalization is centralized in `src/path-policy.ts`.
- The local Control Dashboard uses explicit System32 executable paths for PowerShell, `cmd.exe`,
  and `taskkill.exe`.
- Dashboard status requests are briefly cached/coalesced and the browser poll interval is reduced.
- Tunnel configuration uses the exact validated Node.js executable and compiled `dist/stdio.js`
  paths instead of a relative runtime command.
- Tunnel runtime/profile validation happens before the local credential is mutated.
- Privacy validation scans reachable historical Git text blobs, not only current HEAD content.
- Shell live output uses bounded chunk accumulation rather than repeatedly copying the entire buffer.
- Windows CI runs the complete quality gate on Node.js 20 and Node.js 24.

Read `docs/implementation/TASK-14-CORRECTNESS-AND-HARDENING.md` for the audit and rationale.

## Current installation flow

Today a normal first-time setup is conceptually:

```text
Setup.cmd
  -> Windows / architecture validation
  -> Node.js + ripgrep prerequisite detection
  -> WinGet consent/install if required components are missing
  -> optional Git decision when Git is absent
  -> WorkForge profile/runtime preparation
  -> tunnel-client download + checksum verification
  -> OpenAI tunnel-management handoff
  -> tunnel_id input
  -> Runtime API Key input
  -> Doctor
  -> Tunnel Start
  -> ChatGPT connection handoff
```

Internally this is reliable, but too many implementation details are visible to a first-time user.

The desired user mental model is closer to:

```text
Install WorkForge
    -> Connect OpenAI
    -> Connect ChatGPT
```

Do not remove an explicit user or workspace authorization step merely to reduce clicks.
The simplification target is primarily the Windows/runtime/setup machinery that the user should
not need to understand.

## Existing portable-runtime design

Read:

```text
docs/implementation/TASK-07-PORTABLE-RUNTIME-SETUP-EXE.md
```

TASK-07 was previously deferred. Its important objective remains relevant:

- a clean Windows x64 machine should not need preinstalled Node.js, npm, TypeScript, Vitest,
  or ripgrep;
- Git remains optional;
- the WorkForge engine/runtime should live in a stable product-owned location;
- bundled executables require pinned versions, hashes, license/redistribution review, update policy,
  uninstall semantics, and eventually code signing.

Do not assume TASK-07's old implementation order is still optimal. The Agent Plugins investigation
may change what should happen first.

## New investigation: Agent Plugins

Primary specification site:

```text
https://agent-plugins.org/
```

This is a moving external specification. **Verify the current specification and current client
support from primary sources before making architectural claims.** Do not rely only on this handoff
or earlier chat summaries.

Questions to answer:

1. What parts of WorkForge naturally map to an Agent Plugin?
2. Can WorkForge package its MCP server and a WorkForge operating skill together without creating
   duplicate sources of truth?
3. Which supported clients can execute a bundled/local stdio MCP directly today?
4. What does ChatGPT currently require for a local/private WorkForge MCP connection?
5. What does Codex currently support for local/bundled MCP inside a plugin?
6. Are the Agent Plugins manifests and OpenAI-specific plugin manifests identical, compatible, or
   separate formats at the current spec versions?
7. If compatibility manifests are required, can they be generated at build time from one canonical
   WorkForge plugin manifest rather than manually maintained in parallel?
8. Does adopting Agent Plugins before Portable Runtime reduce packaging work, or does it add another
   layer too early?

Treat all exact manifest filenames, schema versions, directory layouts, and client-support claims as
facts that must be verified against current primary documentation.

## Architectural direction to evaluate

Do not accept this diagram as a predetermined implementation. Evaluate it:

```text
                     WorkForge Core
                          |
          +---------------+----------------+
          |                                |
   workstation MCP                 Windows runtime/safety
          |                                |
          +---------------+----------------+
                          |
                  Plugin/adapter layer
                /                     \
       ChatGPT connection          local stdio clients
       path as required            where supported
```

Potential packaging direction:

```text
WorkForge distribution
├─ canonical WorkForge core
├─ portable pinned runtime
├─ Agent Plugin metadata / skill
├─ client compatibility adapters generated when required
├─ Setup / Control UI
└─ lifecycle + privacy + security tests
```

The important constraint is one canonical implementation and as little duplicated configuration as
possible.

## Product goals

### Installation

Aim to determine whether first-time Windows setup can eventually become roughly:

```text
1. Download / install WorkForge.
2. Open one WorkForge Setup experience.
3. Connect the required OpenAI tunnel/connection credentials once.
4. Perform the required ChatGPT/Codex-side approval or attachment.
5. Use WorkForge Control for normal lifecycle operations.
```

Investigate a staged path rather than jumping directly to a signed EXE:

```text
Phase candidate A: Agent Plugin compatibility/design
Phase candidate B: portable runtime ZIP
Phase candidate C: unified HTML Setup Wizard
Phase candidate D: signed Windows installer only when the package is stable enough
```

This ordering is only a hypothesis. Compare it with alternatives.

### Runtime dependencies

Today system Node.js and ripgrep are required. Git is optional. `tunnel-client` is downloaded and
verified by WorkForge.

Evaluate bundling at least:

- Node.js x64 runtime;
- ripgrep x64;
- OpenAI tunnel-client x64, if redistribution/update/licensing policy permits the intended release model.

For every bundled binary, identify:

- source/vendor;
- license and redistribution requirements;
- pinned version policy;
- expected SHA-256 policy;
- update mechanism;
- CVE/security update responsibility;
- release size impact;
- whether it belongs in Git, release staging only, or is downloaded by the builder.

Do not vendor large runtime binaries into Git merely for convenience.

## Security and privacy invariants that must survive

Do not weaken these for installation convenience:

- no Windows startup persistence by default;
- no automatic replay of MCP shell commands after disconnect/recovery;
- current-user Windows ACL/UAC remains the machine boundary;
- runtime credentials are never committed, printed, sent to browser JavaScript, or exposed to child
  commands that do not require them;
- loopback Control Dashboard only;
- Host, Origin, session-cookie, CSP, no-CORS protections remain;
- exact executable/runtime identity should be verified before use;
- profile manifests remain SHA-pinned and registered roots remain distinct/non-overlapping;
- bootstrap context revision + SHA-guarded text mutation remains;
- historical privacy scanning remains a release/publication gate;
- Git remains optional;
- no-Git and multi-profile behavior remain covered by journey tests;
- source checkout self-removal protection remains;
- release self-removal requires verified release identity;
- install/uninstall actions must not broaden permissions or silently elevate.

Read `SECURITY.md`, `AGENTS.md`, and `docs/ARCHITECTURE.md` before proposing changes.

## Files to read first

Read these before broad repository exploration:

```text
AGENTS.md
README.md
README.ko.md
SECURITY.md
docs/ARCHITECTURE.md
docs/implementation/TASK-07-PORTABLE-RUNTIME-SETUP-EXE.md
docs/implementation/TASK-12-PREREQUISITE-BOOTSTRAP.md
docs/implementation/TASK-13-CONTROL-DASHBOARD.md
docs/implementation/TASK-14-CORRECTNESS-AND-HARDENING.md
scripts/Setup.ps1
scripts/Install.ps1
scripts/WorkForge.Prerequisites.ps1
scripts/Configure-Tunnel.ps1
scripts/Build-Release.ps1
scripts/profile-registry.ps1
scripts/control-server.mjs
package.json
```

Then inspect only additional files needed to validate the design.

## Required first task for Codex

**Do not implement yet.**

1. Read `AGENTS.md` and this handoff.
2. Verify the repository branch, HEAD, worktree, and recent commits.
3. Confirm the handoff baseline against actual current code rather than trusting the document blindly.
4. Read TASK-07, TASK-14, Architecture, Security, Setup, Install, prerequisite, tunnel, release, and
   dashboard code listed above.
5. Browse the current Agent Plugins specification from primary sources.
6. Browse current official OpenAI documentation for ChatGPT/Codex plugin/MCP behavior when relevant.
7. Map the current WorkForge installation flow and count actual user prompts, browser handoffs,
   external downloads, and prerequisites.
8. Produce at least two viable target architectures, including one minimal-change option.
9. Compare them on:
   - installation steps;
   - release size;
   - security surface;
   - update burden;
   - cross-client portability;
   - backward compatibility;
   - implementation complexity;
   - migration risk.
10. Recommend one architecture and a phased migration plan.
11. Explicitly state which parts of TASK-07 should be retained, replaced, reordered, or deleted.
12. Identify tests and release gates required before implementation.
13. Stop and present the design for review. Do not modify product code in this first phase.

## Expected design deliverable

Create a design/task document only after the analysis is complete, for example:

```text
docs/implementation/TASK-15-AGENT-PLUGIN-PORTABLE-RUNTIME.md
```

The document should contain:

- verified external-spec facts with source links;
- current-state installation map;
- target architecture;
- manifest/source-of-truth strategy;
- portable runtime layout;
- ChatGPT path;
- Codex/local-stdio path where currently supported;
- migration phases;
- compatibility strategy;
- security/privacy threat review;
- license/redistribution checklist;
- acceptance criteria;
- rollback strategy;
- explicit non-goals.

Do not commit, push, release, install software, or change external services during the design-only
phase unless the user explicitly asks.

## Suggested first Codex prompt

Use this after starting Codex in the repository root:

```text
AGENTS.md를 먼저 읽어.

그 다음
`docs/handoffs/agent-plugin-portable-runtime-2026-08-09.md`
를 읽고 현재 WorkForge 상태와 다음 작업을 파악해.

handoff 내용을 그대로 믿지 말고 현재 main, 코드, 문서와 대조해서 검증해.
필요한 외부 사실은 Agent Plugins 원문과 OpenAI 공식 문서를 최신 기준으로 확인해.

이번 단계에서는 제품 코드를 구현하지 마.
Agent Plugins 도입, Portable Runtime, 설치 프로세스 단순화를 하나의 아키텍처 문제로 보고
현재 설치 흐름과 TASK-07을 다시 평가해.

최소 변경안 포함 2개 이상의 대안을 비교하고,
security/privacy/no-Git/multi-profile/no-startup invariants를 유지하는 권장 설계와
단계별 마이그레이션 계획을 작성해서 먼저 브리핑해.

설계가 끝나면 `docs/implementation/TASK-15-AGENT-PLUGIN-PORTABLE-RUNTIME.md`
초안을 작성하고 구현 전에 멈춰서 리뷰를 요청해.
```
