const elements = {
  profileChip: document.querySelector('#profileChip'),
  connectionChip: document.querySelector('#connectionChip'),
  modeChip: document.querySelector('#modeChip'),
  heroStatus: document.querySelector('#heroStatus'),
  tunnelPanel: document.querySelector('#tunnelPanel'),
  systemsMeter: document.querySelector('#systemsMeter'),
  systemsValue: document.querySelector('#systemsValue'),
  tunnelTitle: document.querySelector('#tunnelTitle'),
  tunnelSummary: document.querySelector('#tunnelSummary'),
  healthMetric: document.querySelector('#healthMetric'),
  readyMetric: document.querySelector('#readyMetric'),
  supervisorMetric: document.querySelector('#supervisorMetric'),
  recoveryMetric: document.querySelector('#recoveryMetric'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  refreshButton: document.querySelector('#refreshButton'),
  doctorButton: document.querySelector('#doctorButton'),
  doctorBadge: document.querySelector('#doctorBadge'),
  doctorOutput: document.querySelector('#doctorOutput'),
  profileCheck: document.querySelector('#profileCheck'),
  processCheck: document.querySelector('#processCheck'),
  supervisorCheck: document.querySelector('#supervisorCheck'),
  readyCheck: document.querySelector('#readyCheck'),
  workSummary: document.querySelector('#workSummary'),
  taskRecords: document.querySelector('#taskRecords'),
  shellRecords: document.querySelector('#shellRecords'),
  taskDialog: document.querySelector('#taskDialog'),
  taskDialogTitle: document.querySelector('#taskDialogTitle'),
  taskDialogStatus: document.querySelector('#taskDialogStatus'),
  taskDialogBody: document.querySelector('#taskDialogBody'),
  activityList: document.querySelector('#activityList'),
  busyBadge: document.querySelector('#busyBadge'),
  versionText: document.querySelector('#versionText'),
  closeControlButton: document.querySelector('#closeControlButton'),
  languageSwitch: document.querySelector('#languageSwitch'),
  languageButtons: [...document.querySelectorAll('[data-language]')],
  updateTitle: document.querySelector('#updateTitle'),
  updateBadge: document.querySelector('#updateBadge'),
  updateSummary: document.querySelector('#updateSummary'),
  currentVersionMetric: document.querySelector('#currentVersionMetric'),
  latestVersionMetric: document.querySelector('#latestVersionMetric'),
  checkUpdateButton: document.querySelector('#checkUpdateButton'),
  updateButton: document.querySelector('#updateButton'),
  updateProgress: document.querySelector('#updateProgress'),
  updateProgressLabel: document.querySelector('#updateProgressLabel'),
  updateProgressPercent: document.querySelector('#updateProgressPercent'),
  updateProgressTrack: document.querySelector('#updateProgressTrack'),
  updateProgressBar: document.querySelector('#updateProgressBar'),
  updateStageList: document.querySelector('#updateStageList'),
  toast: document.querySelector('#toast'),
  uninstallDialog: document.querySelector('#uninstallDialog'),
  openUninstallButton: document.querySelector('#openUninstallButton'),
  previewUninstallButton: document.querySelector('#previewUninstallButton'),
  uninstallPreview: document.querySelector('#uninstallPreview'),
  uninstallConfirm: document.querySelector('#uninstallConfirm'),
  destructivePhraseBox: document.querySelector('#destructivePhraseBox'),
  destructivePhrase: document.querySelector('#destructivePhrase'),
  confirmUninstallButton: document.querySelector('#confirmUninstallButton'),
};

const languageStorageKey = 'workforge-control-language';
const strings = {
  en: {
    "work.eyebrow": "WORK RECORDS",
    "work.title": "Pick up where you left off.",
    "work.loading": "Checking work records…",
    "work.tasks": "Task checkpoints · reported state",
    "work.jobs": "Recent executions · saved evidence",
    "work.emptyTasks": "No task checkpoints yet.",
    "work.emptyJobs": "No execution records yet.",
    "work.updated": "Updated {time}.",
    "work.partial": "Showing a limited selection · updated {time}.",
    "work.unavailable": "Work records are unavailable. Connection controls still work.",
    "work.stale": "Refresh failed. Showing records last observed at {time}.",
    "work.mode": "The MCP mode badge appears only with tunnel-log evidence from the running session. Check toolMode in ChatGPT before relying on read-only protection.",
    "mode.log.read_only": "MCP: read-only · log {time}",
    "mode.log.read_write": "MCP: read-write · log {time}",
    "mode.tools": "{count} tools",
    "mode.stale": "MCP mode unverified · earlier record {time}",
    "mode.unknown": "MCP mode unverified",
    "mode.hint": "Shown only when the tunnel log proves the mode of the running session. Confirm workstation_context.toolMode in ChatGPT.",
    "work.copy": "Copy resume",
    "work.copied": "Resume instruction copied.",
    "work.copyFailed": "Could not copy. Select the task ID below.",
    "work.reported.active": "Reported active",
    "work.reported.blocked": "Reported blocked",
    "work.reported.completed": "Reported complete",
    "work.unsealed": "No terminal record (running or interrupted)",
    "work.shell.completed": "Completed record",
    "work.shell.failed": "Failed record",
    "work.shell.cancelled": "Cancelled record",
    "work.shell.running": "Running",
    "work.output": "Exit {code} · {bytes} output bytes",
    'app.title': 'WorkForge Control',
    'brand.eyebrow': 'LOCAL CONTROL DASHBOARD',
    'brand.title': 'WorkForge Control',
    'brand.subtitle': "Your AI's hands on Windows, with a dashboard you can actually read.",
    'language.label': 'Language',
    'control.close': 'Close Control',
    'profile.value': 'profile: {profile}',
    'tunnel.eyebrow': 'SECURE TUNNEL',
    'tunnel.checkingTitle': 'Checking your connection…',
    'tunnel.checkingSummary': 'WorkForge is asking the local supervisor for the current state.',
    'tunnel.stoppedTitle': 'Tunnel is stopped',
    'tunnel.stoppedSummary': 'ChatGPT cannot reach WorkForge until the secure tunnel is started.',
    'tunnel.readyTitle': 'WorkForge is ready',
    'tunnel.readySummary': 'The secure tunnel is healthy and ready for ChatGPT connections.',
    'tunnel.attentionTitle': 'Tunnel needs attention',
    'tunnel.attentionSummary': 'The process is running, but health or readiness is not fully green yet.',
    'tunnel.unavailableTitle': 'WorkForge status is unavailable',
    'metric.health': 'Health',
    'metric.readiness': 'Readiness',
    'metric.supervisor': 'Supervisor',
    'metric.recovery': 'Recovery',
    'button.startTunnel': '▶ Start Tunnel',
    'button.stopTunnel': '■ Stop Tunnel',
    'button.refresh': '↻ Refresh',
    'doctor.eyebrow': 'SYSTEM CHECK',
    'doctor.title': 'Doctor',
    'doctor.notRun': 'Not run yet',
    'doctor.summary': 'One click checks the local profile, runtime, tunnel client, credential and online tunnel path.',
    'doctor.item.profile': 'Profile',
    'doctor.item.process': 'Tunnel process',
    'doctor.item.supervisor': 'Supervisor',
    'doctor.item.readiness': 'MCP readiness',
    'doctor.run': 'Run Doctor',
    'doctor.details': 'View technical details',
    'doctor.notRunDetail': 'Doctor has not been run in this dashboard session.',
    'doctor.healthy': 'Healthy',
    'doctor.needsAttention': 'Needs attention',
    'doctor.completed': 'Doctor completed successfully.',
    'activity.eyebrow': 'RECENT ACTIVITY',
    'activity.title': 'What just happened?',
    'activity.empty': 'No dashboard activity yet.',
    'activity.generic': 'Activity',
    'activity.controlStarted': 'Control dashboard started.',
    'activity.tunnelRunning': 'Tunnel is running.',
    'activity.tunnelStopped': 'Tunnel is stopped.',
    'activity.tunnelReady': 'Tunnel became ready.',
    'activity.tunnelHealthChanged': 'Tunnel health changed.',
    'activity.tunnelStatusChanged': 'Tunnel status changed.',
    'activity.updatePreparing': 'Downloading and validating the WorkForge update...',
    'activity.updated': 'Updated WorkForge to {version}.',
    'activity.updateFailed': 'Update failed: {detail}',
    'activity.tunnelStarting': 'Starting secure tunnel...',
    'activity.startCompleted': 'Start command completed.',
    'activity.tunnelStopping': 'Stopping secure tunnel...',
    'activity.stopCompleted': 'Stop command completed.',
    'activity.doctorRunning': 'Running Doctor...',
    'activity.doctorCompleted': 'Doctor completed successfully.',
    'activity.uninstallPreview': 'Uninstall preview completed ({mode}).',
    'activity.uninstallCompleted': 'Uninstall completed ({mode}).',
    'guide.eyebrow': 'QUICK GUIDE',
    'guide.title': 'Green means go.',
    'guide.summary': 'If Tunnel, Health and Ready are green, ChatGPT can reach WorkForge. If something turns red, run Doctor before changing anything else.',
    'guide.ready': 'Ready',
    'guide.working': 'Working / attention',
    'guide.needsHelp': 'Needs help',
    'hud.systems': 'SYSTEMS',
    'hud.systemsValue': '{count}/4 green',
    'hud.hotkeysTitle': 'Hotkeys',
    'hud.hotkeysHint': 'Hold Alt+Shift to show key prompts on the buttons.',
    'hud.hotkey.start': 'Start tunnel',
    'hud.hotkey.stop': 'Stop tunnel',
    'hud.hotkey.refresh': 'Refresh status and records',
    'hud.hotkey.doctor': 'Run Doctor',
    'work.detail': 'Details',
    'work.detail.eyebrow': 'REPORTED CHECKPOINT',
    'work.detail.loading': 'Loading the checkpoint…',
    'work.detail.observed': 'Saved {saved} · read {time}. This is the reported state, not verified execution.',
    'work.detail.objective': 'Objective',
    'work.detail.plan': 'Plan',
    'work.detail.completedSteps': 'Reported completed steps',
    'work.detail.blockers': 'Blockers',
    'work.detail.nextAction': 'Next action',
    'work.detail.paths': 'Paths',
    'work.detail.evidence': 'Saved execution evidence',
    'work.detail.evidenceSummary': '{total} linked · {completed} completed · {failed} failed · {cancelled} cancelled · {unsealed} without terminal record · {unavailable} unavailable',
    'work.detail.noEvidence': 'No execution records are linked to this checkpoint.',
    'work.detail.evidenceUnavailable': 'Record unavailable',
    'work.detail.none': 'None recorded.',
    'work.detail.claim': 'Claimed by {owner} until {time}.',
    'work.detail.claimExpired': 'Claim by {owner} expired at {time}.',
    'work.detail.close': 'Close',
    'work.detail.exit': 'Exit {code}',
    'work.claim.active': 'Claimed by {owner} · until {time}',
    'work.claim.expired': 'Claim by {owner} expired · {time}',
    'work.claim.hint': 'Advisory claim: it tells other agents who is working on this task. It does not lock the checkpoint.',
    'work.detail.error.invalid_id': 'This task ID is not valid.',
    'work.detail.error.not_found': 'This checkpoint no longer exists.',
    'work.detail.error.busy': 'Another read is in progress. Try again in a moment.',
    'work.detail.error.engine_missing': 'The WorkForge engine build is missing, so details cannot be read.',
    'work.detail.error.registry_invalid': 'The WorkForge profile registry is unavailable.',
    'work.detail.error.profile_unavailable': 'The checkpoint could not be read safely.',
    'work.detail.error.timeout': 'Reading the checkpoint took too long. Try again.',
    'work.detail.error.generic': 'The checkpoint could not be loaded.',
    'update.eyebrow': 'WORKFORGE UPDATE',
    'update.checkingTitle': 'Checking for updates…',
    'update.checkingSummary': 'WorkForge checks the canonical GitHub release and verifies the release checksum before installing anything.',
    'update.current': 'Current',
    'update.latest': 'Latest',
    'update.preparing': 'Preparing update…',
    'update.availableTitle': 'WorkForge {version} is available',
    'update.availableSummary': 'The update is downloaded from the canonical GitHub release, SHA-256 verified, staged side-by-side, then activated only after integrity checks. Running tunnels are rebound and restarted automatically.',
    'update.availableBadge': 'Update available',
    'update.upToDateTitle': 'WorkForge is up to date',
    'update.upToDateSummary': 'No newer stable WorkForge release is currently available.',
    'update.upToDateBadge': 'Up to date',
    'update.unavailableTitle': 'Could not check for updates',
    'update.sourcePreviewTitle': 'Manual updates on macOS',
    'update.sourceCheckoutTitle': 'Running from source',
    'update.sourceCheckoutSummary': 'This WorkForge runs from source, so automatic updates are off. For a Git checkout, run git pull and npm run build in the repository.',
    'update.sourcePreviewSummary': 'The macOS source preview does not update itself. Download the new release and run setup again.',
    'update.updatingTitle': 'Updating WorkForge to {version}...',
    'update.runningSummary': 'The update is running. Keep this Control window open.',
    'update.updatingBadge': 'Updating',
    'update.rollbackTitle': 'Restoring the previous WorkForge version...',
    'update.rollbackSummary': 'Update validation failed. WorkForge is rolling back safely.',
    'update.rollbackBadge': 'Rolling back',
    'update.failedTitle': 'WorkForge update failed',
    'update.failedSummary': 'The update did not complete. Review Recent Activity and retry when ready.',
    'update.failedBadge': 'Update failed',
    'update.installedTitle': 'WorkForge {version} installed',
    'update.completedSummary': 'The update completed successfully.',
    'update.updatedBadge': 'Updated',
    'update.waitingService': 'Waiting for the local update service...',
    'update.checkAgain': 'Check again',
    'update.button': 'Update WorkForge',
    'update.confirm': 'Update WorkForge to {version}? Running WorkForge tunnels will be restarted automatically. If validation fails, WorkForge will roll back to the current engine.',
    'update.completedToast': 'WorkForge {version} update completed.',
    'progress.check': 'Check',
    'progress.download': 'Download',
    'progress.verify': 'Verify',
    'progress.stage': 'Stage',
    'progress.pauseTunnels': 'Pause tunnels',
    'progress.activate': 'Activate',
    'progress.rebind': 'Rebind',
    'progress.doctor': 'Doctor',
    'progress.restart': 'Restart',
    'progress.finish': 'Finish',
    'progress.starting': 'Starting the WorkForge update...',
    'progress.checking': 'Checking the latest stable WorkForge release...',
    'progress.downloading': 'Downloading the WorkForge release...',
    'progress.verifying': 'Verifying the downloaded release...',
    'progress.staging': 'Staging the new engine side-by-side...',
    'progress.stopping': 'Pausing running WorkForge tunnels...',
    'progress.activating': 'Activating the new WorkForge engine...',
    'progress.rebinding': 'Rebinding tunnel profiles to the new runtime...',
    'progress.doctorStage': 'Running post-update Doctor checks...',
    'progress.restarting': 'Restoring the previous tunnel running state...',
    'progress.finalizing': 'Finalizing the WorkForge update...',
    'progress.rollback': 'Update validation failed. Restoring the previous WorkForge engine...',
    'progress.completed': 'WorkForge update completed.',
    'danger.eyebrow': 'DANGER ZONE',
    'danger.title': 'Remove WorkForge',
    'danger.summary': 'You can remove WorkForge while keeping your workspace, or remove everything. Nothing happens until you preview and explicitly confirm it.',
    'danger.uninstall': 'Uninstall…',
    'footer.localOnly': 'Local only · 127.0.0.1 · No remote dashboard access',
    'uninstall.eyebrow': 'SAFE REMOVAL',
    'uninstall.title': 'Choose what to keep',
    'uninstall.keepWorkspace': 'Keep my workspace',
    'uninstall.recommended': 'Recommended',
    'uninstall.keepDescription': 'Remove WorkForge operational state while preserving your workspace, Git history and user files.',
    'uninstall.removeEverything': 'Remove everything',
    'uninstall.removeDescription': 'Remove WorkForge and the selected workspace. This is permanent.',
    'uninstall.preview': 'Preview what will happen',
    'uninstall.removalPreview': 'Removal preview',
    'uninstall.defaultPreview': 'Run the preview before removing anything.',
    'uninstall.confirm': 'I reviewed the preview and want to continue.',
    'uninstall.phrasePrefix': 'Type',
    'uninstall.phraseSuffix': 'exactly:',
    'uninstall.cancel': 'Cancel',
    'uninstall.removeButton': 'Remove WorkForge',
    'uninstall.previewing': 'Previewing uninstall…',
    'uninstall.previewReady': 'Uninstall preview is ready.',
    'uninstall.previewFirst': 'Run the preview for the selected removal mode first.',
    'uninstall.confirmFirst': 'Review the preview and check the confirmation box first.',
    'uninstall.typePhrase': 'Type REMOVE WORKFORGE exactly.',
    'uninstall.uninstalling': 'Uninstalling…',
    'uninstall.completedToast': 'Uninstall completed.',
    'uninstall.mode.KeepWorkspace': 'Keep workspace',
    'uninstall.mode.RemoveEverything': 'Remove everything',
    'aria.close': 'Close',
    'aria.tunnelStatus': 'Tunnel status',
    'aria.updateProgress': 'WorkForge update progress',
    'aria.updateStages': 'Update stages',
    'state.idle': 'Idle',
    'state.working': 'Working',
    'state.checking': 'Checking',
    'state.unknown': 'Unknown',
    'state.offline': 'Offline',
    'state.online': 'Online',
    'state.attention': 'Attention',
    'state.healthy': 'Healthy',
    'state.unreachable': 'Unreachable',
    'state.ready': 'Ready',
    'state.not-ready': 'Not ready',
    'state.running': 'Running',
    'state.stopped': 'Stopped',
    'state.waiting': 'Waiting',
    'state.unavailable': 'Unavailable',
    'state.normal': 'Normal',
    'state.start': 'Start',
    'state.stop': 'Stop',
    'state.doctor': 'Doctor',
    'state.update': 'Update',
    'state.uninstall-preview': 'Uninstall preview',
    'state.uninstall': 'Uninstall',
    'check.ready': '✓ Ready',
    'check.running': '✓ Running',
    'check.stopped': '○ Stopped',
    'check.notRunning': '△ Not running',
    'check.waiting': '△ Waiting',
    'check.offline': '× Offline',
    'check.setup': '× Check setup',
    'check.unknown': '× Unknown',
    'action.completed': '{action} completed.',
    'error.unexpectedResponse': 'Unexpected response ({status}).',
    'error.requestFailed': 'Request failed ({status}).',
    'terminal.updatedEyebrow': 'WORKFORGE UPDATED',
    'terminal.updatedTitle': 'Update completed',
    'terminal.updatedCopy': 'Open WorkForge Control again to use the new engine and dashboard.',
    'terminal.uninstallTitle': 'Uninstall completed',
    'terminal.uninstallCopy': 'This local Control session has closed. You can close this browser tab.',
    'terminal.closedTitle': 'Control closed',
    'terminal.closedCopy': 'The local dashboard server has stopped. You can close this tab.',
  },
  ko: {
    "work.eyebrow": "작업 기록",
    "work.title": "이어서 할 일을 확인하세요.",
    "work.loading": "작업 기록을 확인하고 있습니다…",
    "work.tasks": "체크포인트 · 보고된 상태",
    "work.jobs": "최근 실행 · 저장된 근거",
    "work.emptyTasks": "저장된 체크포인트가 없습니다.",
    "work.emptyJobs": "저장된 실행 기록이 없습니다.",
    "work.updated": "{time}에 갱신했습니다.",
    "work.partial": "일부 기록만 표시합니다 · {time} 갱신",
    "work.unavailable": "작업 기록을 조회할 수 없습니다. 연결 제어는 계속 사용할 수 있습니다.",
    "work.stale": "갱신에 실패했습니다. 마지막 확인 시각 {time}의 기록입니다.",
    "work.mode": "MCP 모드 배지는 실행 중인 세션의 터널 로그 증거가 있을 때만 표시됩니다. 읽기 전용 보호에 의존하기 전에 ChatGPT에서 toolMode를 확인하세요.",
    "mode.log.read_only": "MCP: 읽기 전용 · 로그 {time}",
    "mode.log.read_write": "MCP: 읽기·쓰기 · 로그 {time}",
    "mode.tools": "도구 {count}개",
    "mode.stale": "MCP 모드 확인 불가 · 이전 기록 {time}",
    "mode.unknown": "MCP 모드 확인 불가",
    "mode.hint": "터널 로그가 실행 중인 세션의 모드를 증명할 때만 표시합니다. ChatGPT에서 workstation_context.toolMode를 확인하세요.",
    "work.copy": "재개 문구 복사",
    "work.copied": "재개 문구를 복사했습니다.",
    "work.copyFailed": "복사하지 못했습니다. 아래 작업 ID를 선택하세요.",
    "work.reported.active": "진행 중으로 보고됨",
    "work.reported.blocked": "차단됨으로 보고됨",
    "work.reported.completed": "완료로 보고됨",
    "work.unsealed": "종료 기록 없음 (진행 중이거나 비정상 종료)",
    "work.shell.completed": "완료 기록",
    "work.shell.failed": "실패 기록",
    "work.shell.cancelled": "취소 기록",
    "work.shell.running": "실행 중",
    "work.output": "종료 코드 {code} · 출력 {bytes}바이트",
    'app.title': 'WorkForge 제어판',
    'brand.eyebrow': '로컬 제어 대시보드',
    'brand.title': 'WorkForge 제어판',
    'brand.subtitle': 'Windows에서 AI가 안전하게 작업할 수 있도록, 한눈에 읽히는 제어 대시보드입니다.',
    'language.label': '언어',
    'control.close': '제어판 닫기',
    'profile.value': '프로필: {profile}',
    'tunnel.eyebrow': '보안 터널',
    'tunnel.checkingTitle': '연결 상태를 확인하는 중…',
    'tunnel.checkingSummary': 'WorkForge가 로컬 supervisor에서 현재 상태를 확인하고 있습니다.',
    'tunnel.stoppedTitle': '터널이 중지되어 있습니다',
    'tunnel.stoppedSummary': '보안 터널을 시작하기 전에는 ChatGPT가 WorkForge에 연결할 수 없습니다.',
    'tunnel.readyTitle': 'WorkForge 준비 완료',
    'tunnel.readySummary': '보안 터널이 정상이며 ChatGPT 연결을 받을 준비가 되었습니다.',
    'tunnel.attentionTitle': '터널 확인이 필요합니다',
    'tunnel.attentionSummary': '프로세스는 실행 중이지만 Health 또는 Readiness가 아직 정상 상태가 아닙니다.',
    'tunnel.unavailableTitle': 'WorkForge 상태를 확인할 수 없습니다',
    'metric.health': '상태',
    'metric.readiness': '준비 상태',
    'metric.supervisor': 'Supervisor',
    'metric.recovery': '복구',
    'button.startTunnel': '▶ 터널 시작',
    'button.stopTunnel': '■ 터널 중지',
    'button.refresh': '↻ 새로고침',
    'doctor.eyebrow': '시스템 점검',
    'doctor.title': 'Doctor',
    'doctor.notRun': '아직 실행하지 않음',
    'doctor.summary': '한 번의 클릭으로 로컬 프로필, Runtime, 터널 클라이언트, 자격 증명, 온라인 터널 경로를 확인합니다.',
    'doctor.item.profile': '프로필',
    'doctor.item.process': '터널 프로세스',
    'doctor.item.supervisor': 'Supervisor',
    'doctor.item.readiness': 'MCP 준비 상태',
    'doctor.run': 'Doctor 실행',
    'doctor.details': '기술 세부 정보 보기',
    'doctor.notRunDetail': '이 대시보드 세션에서는 아직 Doctor를 실행하지 않았습니다.',
    'doctor.healthy': '정상',
    'doctor.needsAttention': '확인 필요',
    'doctor.completed': 'Doctor 검사가 정상적으로 완료되었습니다.',
    'activity.eyebrow': '최근 활동',
    'activity.title': '방금 무슨 일이 있었나요?',
    'activity.empty': '아직 대시보드 활동 기록이 없습니다.',
    'activity.generic': '활동',
    'activity.controlStarted': '제어 대시보드를 시작했습니다.',
    'activity.tunnelRunning': '터널이 실행 중입니다.',
    'activity.tunnelStopped': '터널이 중지되었습니다.',
    'activity.tunnelReady': '터널이 준비 상태가 되었습니다.',
    'activity.tunnelHealthChanged': '터널 Health 상태가 변경되었습니다.',
    'activity.tunnelStatusChanged': '터널 상태가 변경되었습니다.',
    'activity.updatePreparing': 'WorkForge 업데이트를 다운로드하고 검증하는 중입니다...',
    'activity.updated': 'WorkForge를 {version}(으)로 업데이트했습니다.',
    'activity.updateFailed': '업데이트 실패: {detail}',
    'activity.tunnelStarting': '보안 터널을 시작하는 중입니다...',
    'activity.startCompleted': '터널 시작 명령이 완료되었습니다.',
    'activity.tunnelStopping': '보안 터널을 중지하는 중입니다...',
    'activity.stopCompleted': '터널 중지 명령이 완료되었습니다.',
    'activity.doctorRunning': 'Doctor를 실행하는 중입니다...',
    'activity.doctorCompleted': 'Doctor 검사가 정상적으로 완료되었습니다.',
    'activity.uninstallPreview': '제거 미리보기가 완료되었습니다 ({mode}).',
    'activity.uninstallCompleted': '제거가 완료되었습니다 ({mode}).',
    'guide.eyebrow': '빠른 안내',
    'guide.title': '초록색이면 정상입니다.',
    'guide.summary': 'Tunnel, Health, Ready가 모두 초록색이면 ChatGPT가 WorkForge에 연결할 수 있습니다. 빨간색 항목이 있으면 다른 설정을 바꾸기 전에 Doctor를 실행하세요.',
    'guide.ready': '준비됨',
    'guide.working': '작업 중 / 확인 필요',
    'guide.needsHelp': '문제 확인 필요',
    'hud.systems': '시스템',
    'hud.systemsValue': '{count}/4 정상',
    'hud.hotkeysTitle': '단축키',
    'hud.hotkeysHint': 'Alt+Shift를 누르고 있으면 버튼 위에 키가 표시됩니다.',
    'hud.hotkey.start': '터널 시작',
    'hud.hotkey.stop': '터널 정지',
    'hud.hotkey.refresh': '상태와 기록 새로고침',
    'hud.hotkey.doctor': 'Doctor 실행',
    'work.detail': '상세',
    'work.detail.eyebrow': '보고된 체크포인트',
    'work.detail.loading': '체크포인트를 불러오는 중…',
    'work.detail.observed': '{saved} 저장 · {time} 조회. 보고된 상태이며 실행이 검증된 것은 아닙니다.',
    'work.detail.objective': '목표',
    'work.detail.plan': '계획',
    'work.detail.completedSteps': '완료했다고 보고된 단계',
    'work.detail.blockers': '막힌 점',
    'work.detail.nextAction': '다음 할 일',
    'work.detail.paths': '경로',
    'work.detail.evidence': '저장된 실행 근거',
    'work.detail.evidenceSummary': '연결 {total}개 · 완료 {completed} · 실패 {failed} · 취소 {cancelled} · 종료 기록 없음 {unsealed} · 조회 불가 {unavailable}',
    'work.detail.noEvidence': '이 체크포인트에 연결된 실행 기록이 없습니다.',
    'work.detail.evidenceUnavailable': '기록을 조회할 수 없음',
    'work.detail.none': '기록 없음.',
    'work.detail.claim': '{owner}이(가) {time}까지 맡고 있습니다.',
    'work.detail.claimExpired': '{owner}의 담당 표시는 {time}에 만료되었습니다.',
    'work.detail.close': '닫기',
    'work.detail.exit': '종료 코드 {code}',
    'work.claim.active': '담당 {owner} · {time}까지',
    'work.claim.expired': '{owner} 담당 만료 · {time}',
    'work.claim.hint': '알림용 담당 표시입니다. 다른 에이전트에게 누가 작업 중인지 알려 줄 뿐 체크포인트를 잠그지 않습니다.',
    'work.detail.error.invalid_id': '올바르지 않은 작업 ID입니다.',
    'work.detail.error.not_found': '이 체크포인트는 더 이상 없습니다.',
    'work.detail.error.busy': '다른 조회가 진행 중입니다. 잠시 후 다시 시도하세요.',
    'work.detail.error.engine_missing': 'WorkForge 엔진 빌드가 없어 상세 정보를 읽을 수 없습니다.',
    'work.detail.error.registry_invalid': 'WorkForge 프로필 레지스트리를 사용할 수 없습니다.',
    'work.detail.error.profile_unavailable': '체크포인트를 안전하게 읽을 수 없습니다.',
    'work.detail.error.timeout': '체크포인트를 읽는 데 시간이 너무 오래 걸렸습니다. 다시 시도하세요.',
    'work.detail.error.generic': '체크포인트를 불러오지 못했습니다.',
    'update.eyebrow': 'WORKFORGE 업데이트',
    'update.checkingTitle': '업데이트를 확인하는 중…',
    'update.checkingSummary': 'WorkForge는 공식 GitHub Release를 확인하고 설치 전에 Release checksum을 검증합니다.',
    'update.current': '현재',
    'update.latest': '최신',
    'update.preparing': '업데이트 준비 중…',
    'update.availableTitle': 'WorkForge {version} 업데이트 가능',
    'update.availableSummary': '공식 GitHub Release에서 업데이트를 다운로드하고 SHA-256을 검증한 뒤, 기존 버전과 나란히 staging합니다. 무결성 검증을 통과한 경우에만 활성화하며 실행 중인 터널은 자동으로 재연결하고 다시 시작합니다.',
    'update.availableBadge': '업데이트 가능',
    'update.upToDateTitle': 'WorkForge가 최신 버전입니다',
    'update.upToDateSummary': '현재 사용할 수 있는 더 새로운 안정 버전이 없습니다.',
    'update.upToDateBadge': '최신 버전',
    'update.unavailableTitle': '업데이트를 확인할 수 없습니다',
    'update.sourcePreviewTitle': 'macOS에서는 수동으로 업데이트합니다',
    'update.sourceCheckoutTitle': '소스에서 실행 중입니다',
    'update.sourceCheckoutSummary': '이 WorkForge는 소스에서 실행 중이라 자동 업데이트를 쓰지 않습니다. Git 체크아웃이라면 저장소에서 git pull 후 npm run build를 실행하세요.',
    'update.sourcePreviewSummary': 'macOS 소스 프리뷰는 자동 업데이트되지 않습니다. 새 릴리스를 받은 뒤 setup을 다시 실행하세요.',
    'update.updatingTitle': 'WorkForge {version}(으)로 업데이트 중...',
    'update.runningSummary': '업데이트가 진행 중입니다. 이 제어판 창을 열어 두세요.',
    'update.updatingBadge': '업데이트 중',
    'update.rollbackTitle': '이전 WorkForge 버전을 복원하는 중...',
    'update.rollbackSummary': '업데이트 검증에 실패했습니다. WorkForge가 안전하게 이전 버전으로 되돌아가는 중입니다.',
    'update.rollbackBadge': '롤백 중',
    'update.failedTitle': 'WorkForge 업데이트 실패',
    'update.failedSummary': '업데이트가 완료되지 않았습니다. 최근 활동을 확인한 뒤 준비되면 다시 시도하세요.',
    'update.failedBadge': '업데이트 실패',
    'update.installedTitle': 'WorkForge {version} 설치 완료',
    'update.completedSummary': '업데이트가 정상적으로 완료되었습니다.',
    'update.updatedBadge': '업데이트 완료',
    'update.waitingService': '로컬 업데이트 서비스의 응답을 기다리는 중...',
    'update.checkAgain': '다시 확인',
    'update.button': 'WorkForge 업데이트',
    'update.confirm': 'WorkForge를 {version}(으)로 업데이트할까요? 실행 중인 WorkForge 터널은 자동으로 재시작됩니다. 검증에 실패하면 현재 엔진으로 롤백합니다.',
    'update.completedToast': 'WorkForge {version} 업데이트가 완료되었습니다.',
    'progress.check': '확인',
    'progress.download': '다운로드',
    'progress.verify': '검증',
    'progress.stage': '스테이징',
    'progress.pauseTunnels': '터널 일시정지',
    'progress.activate': '활성화',
    'progress.rebind': '재연결',
    'progress.doctor': 'Doctor',
    'progress.restart': '재시작',
    'progress.finish': '마무리',
    'progress.starting': 'WorkForge 업데이트를 시작하는 중...',
    'progress.checking': '최신 안정 버전을 확인하는 중...',
    'progress.downloading': 'WorkForge Release를 다운로드하는 중...',
    'progress.verifying': '다운로드한 Release를 검증하는 중...',
    'progress.staging': '새 엔진을 기존 버전과 나란히 staging하는 중...',
    'progress.stopping': '실행 중인 WorkForge 터널을 잠시 중지하는 중...',
    'progress.activating': '새 WorkForge 엔진을 활성화하는 중...',
    'progress.rebinding': '터널 프로필을 새 Runtime에 다시 연결하는 중...',
    'progress.doctorStage': '업데이트 후 Doctor 검사를 실행하는 중...',
    'progress.restarting': '업데이트 전 터널 실행 상태를 복원하는 중...',
    'progress.finalizing': 'WorkForge 업데이트를 마무리하는 중...',
    'progress.rollback': '업데이트 검증에 실패했습니다. 이전 WorkForge 엔진을 복원하는 중...',
    'progress.completed': 'WorkForge 업데이트가 완료되었습니다.',
    'danger.eyebrow': '위험 구역',
    'danger.title': 'WorkForge 제거',
    'danger.summary': 'Workspace를 유지한 채 WorkForge만 제거하거나 모든 항목을 제거할 수 있습니다. 미리보기를 확인하고 명시적으로 승인하기 전에는 아무것도 삭제하지 않습니다.',
    'danger.uninstall': '제거…',
    'footer.localOnly': '로컬 전용 · 127.0.0.1 · 원격 대시보드 접근 없음',
    'uninstall.eyebrow': '안전한 제거',
    'uninstall.title': '유지할 항목 선택',
    'uninstall.keepWorkspace': 'Workspace 유지',
    'uninstall.recommended': '권장',
    'uninstall.keepDescription': 'Workspace, Git 기록, 사용자 파일은 유지하고 WorkForge 운영 상태만 제거합니다.',
    'uninstall.removeEverything': '모두 제거',
    'uninstall.removeDescription': 'WorkForge와 선택된 Workspace를 함께 제거합니다. 이 작업은 되돌릴 수 없습니다.',
    'uninstall.preview': '제거 내용 미리보기',
    'uninstall.removalPreview': '제거 미리보기',
    'uninstall.defaultPreview': '제거하기 전에 먼저 미리보기를 실행하세요.',
    'uninstall.confirm': '미리보기를 확인했으며 계속 진행하겠습니다.',
    'uninstall.phrasePrefix': '다음 문구를',
    'uninstall.phraseSuffix': '정확히 입력하세요:',
    'uninstall.cancel': '취소',
    'uninstall.removeButton': 'WorkForge 제거',
    'uninstall.previewing': '제거 미리보기 생성 중…',
    'uninstall.previewReady': '제거 미리보기가 준비되었습니다.',
    'uninstall.previewFirst': '선택한 제거 방식의 미리보기를 먼저 실행하세요.',
    'uninstall.confirmFirst': '미리보기를 확인하고 확인란을 선택하세요.',
    'uninstall.typePhrase': 'REMOVE WORKFORGE를 정확히 입력하세요.',
    'uninstall.uninstalling': '제거 중…',
    'uninstall.completedToast': '제거가 완료되었습니다.',
    'uninstall.mode.KeepWorkspace': 'Workspace 유지',
    'uninstall.mode.RemoveEverything': '모두 제거',
    'aria.close': '닫기',
    'aria.tunnelStatus': '터널 상태',
    'aria.updateProgress': 'WorkForge 업데이트 진행률',
    'aria.updateStages': '업데이트 단계',
    'state.idle': '대기',
    'state.working': '작업 중',
    'state.checking': '확인 중',
    'state.unknown': '알 수 없음',
    'state.offline': '오프라인',
    'state.online': '온라인',
    'state.attention': '주의',
    'state.healthy': '정상',
    'state.unreachable': '연결 불가',
    'state.ready': '준비됨',
    'state.not-ready': '준비 안 됨',
    'state.running': '실행 중',
    'state.stopped': '중지됨',
    'state.waiting': '대기 중',
    'state.unavailable': '사용 불가',
    'state.normal': '정상',
    'state.start': '시작',
    'state.stop': '중지',
    'state.doctor': 'Doctor',
    'state.update': '업데이트',
    'state.uninstall-preview': '제거 미리보기',
    'state.uninstall': '제거',
    'check.ready': '✓ 준비됨',
    'check.running': '✓ 실행 중',
    'check.stopped': '○ 중지됨',
    'check.notRunning': '△ 실행 안 됨',
    'check.waiting': '△ 대기 중',
    'check.offline': '× 오프라인',
    'check.setup': '× 설정 확인',
    'check.unknown': '× 알 수 없음',
    'action.completed': '{action} 작업이 완료되었습니다.',
    'error.unexpectedResponse': '예상하지 못한 응답입니다 ({status}).',
    'error.requestFailed': '요청에 실패했습니다 ({status}).',
    'terminal.updatedEyebrow': 'WORKFORGE 업데이트 완료',
    'terminal.updatedTitle': '업데이트 완료',
    'terminal.updatedCopy': '새 엔진과 대시보드를 사용하려면 WorkForge Control을 다시 여세요.',
    'terminal.uninstallTitle': '제거 완료',
    'terminal.uninstallCopy': '로컬 Control 세션이 종료되었습니다. 이 브라우저 탭을 닫아도 됩니다.',
    'terminal.closedTitle': 'Control 종료됨',
    'terminal.closedCopy': '로컬 대시보드 서버가 중지되었습니다. 이 탭을 닫아도 됩니다.',
  },
  ja: {
    "work.eyebrow": "作業記録",
    "work.title": "続きの作業を確認しましょう。",
    "work.loading": "作業記録を確認中…",
    "work.tasks": "チェックポイント · 報告された状態",
    "work.jobs": "最近の実行 · 保存された証拠",
    "work.emptyTasks": "チェックポイントはまだありません。",
    "work.emptyJobs": "実行記録はまだありません。",
    "work.updated": "{time}に更新しました。",
    "work.partial": "一部の記録を表示 · {time}更新",
    "work.unavailable": "作業記録を取得できません。接続操作は引き続き利用できます。",
    "work.stale": "更新に失敗しました。{time}に確認した記録を表示しています。",
    "work.mode": "MCPモードのバッジは、実行中のセッションのトンネルログに証拠がある場合にのみ表示されます。読み取り専用の保護に頼る前にChatGPTでtoolModeを確認してください。",
    "mode.log.read_only": "MCP: 読み取り専用 · ログ {time}",
    "mode.log.read_write": "MCP: 読み書き · ログ {time}",
    "mode.tools": "ツール {count} 個",
    "mode.stale": "MCPモード未確認 · 以前の記録 {time}",
    "mode.unknown": "MCPモード未確認",
    "mode.hint": "トンネルログが実行中のセッションのモードを証明する場合にのみ表示します。ChatGPTでworkstation_context.toolModeを確認してください。",
    "work.copy": "再開文をコピー",
    "work.copied": "再開文をコピーしました。",
    "work.copyFailed": "コピーできませんでした。下のタスクIDを選択してください。",
    "work.reported.active": "進行中との報告",
    "work.reported.blocked": "ブロック中との報告",
    "work.reported.completed": "完了との報告",
    "work.unsealed": "終了記録なし（実行中または異常終了）",
    "work.shell.completed": "完了記録",
    "work.shell.failed": "失敗記録",
    "work.shell.cancelled": "キャンセル記録",
    "work.shell.running": "実行中",
    "work.output": "終了コード {code} · 出力 {bytes}バイト",
    'app.title': 'WorkForge コントロール',
    'brand.eyebrow': 'ローカル コントロール ダッシュボード',
    'brand.title': 'WorkForge コントロール',
    'brand.subtitle': 'Windows 上で AI を安全に動かし、状態をひと目で確認できるコントロールダッシュボードです。',
    'language.label': '言語',
    'control.close': 'コントロールを閉じる',
    'profile.value': 'プロファイル: {profile}',
    'tunnel.eyebrow': 'セキュア トンネル',
    'tunnel.checkingTitle': '接続状態を確認中…',
    'tunnel.checkingSummary': 'WorkForge がローカル Supervisor から現在の状態を確認しています。',
    'tunnel.stoppedTitle': 'トンネルは停止しています',
    'tunnel.stoppedSummary': 'セキュアトンネルを開始するまで ChatGPT は WorkForge に接続できません。',
    'tunnel.readyTitle': 'WorkForge は準備完了です',
    'tunnel.readySummary': 'セキュアトンネルは正常で、ChatGPT からの接続を受け付ける準備ができています。',
    'tunnel.attentionTitle': 'トンネルの確認が必要です',
    'tunnel.attentionSummary': 'プロセスは実行中ですが、Health または Readiness がまだ正常ではありません。',
    'tunnel.unavailableTitle': 'WorkForge の状態を確認できません',
    'metric.health': '状態',
    'metric.readiness': '準備状態',
    'metric.supervisor': 'Supervisor',
    'metric.recovery': '復旧',
    'button.startTunnel': '▶ トンネル開始',
    'button.stopTunnel': '■ トンネル停止',
    'button.refresh': '↻ 更新',
    'doctor.eyebrow': 'システムチェック',
    'doctor.title': 'Doctor',
    'doctor.notRun': '未実行',
    'doctor.summary': '1 クリックでローカルプロファイル、Runtime、トンネルクライアント、認証情報、オンラインのトンネル経路を確認します。',
    'doctor.item.profile': 'プロファイル',
    'doctor.item.process': 'トンネルプロセス',
    'doctor.item.supervisor': 'Supervisor',
    'doctor.item.readiness': 'MCP 準備状態',
    'doctor.run': 'Doctor を実行',
    'doctor.details': '技術情報を表示',
    'doctor.notRunDetail': 'このダッシュボードセッションでは、まだ Doctor を実行していません。',
    'doctor.healthy': '正常',
    'doctor.needsAttention': '確認が必要',
    'doctor.completed': 'Doctor チェックが正常に完了しました。',
    'activity.eyebrow': '最近のアクティビティ',
    'activity.title': '直前に何が起きましたか？',
    'activity.empty': 'まだダッシュボードのアクティビティはありません。',
    'activity.generic': 'アクティビティ',
    'activity.controlStarted': 'コントロールダッシュボードを開始しました。',
    'activity.tunnelRunning': 'トンネルは実行中です。',
    'activity.tunnelStopped': 'トンネルを停止しました。',
    'activity.tunnelReady': 'トンネルが準備完了になりました。',
    'activity.tunnelHealthChanged': 'トンネルの Health 状態が変化しました。',
    'activity.tunnelStatusChanged': 'トンネルの状態が変化しました。',
    'activity.updatePreparing': 'WorkForge アップデートをダウンロードして検証しています...',
    'activity.updated': 'WorkForge を {version} にアップデートしました。',
    'activity.updateFailed': 'アップデート失敗: {detail}',
    'activity.tunnelStarting': 'セキュアトンネルを開始しています...',
    'activity.startCompleted': 'トンネル開始コマンドが完了しました。',
    'activity.tunnelStopping': 'セキュアトンネルを停止しています...',
    'activity.stopCompleted': 'トンネル停止コマンドが完了しました。',
    'activity.doctorRunning': 'Doctor を実行しています...',
    'activity.doctorCompleted': 'Doctor チェックが正常に完了しました。',
    'activity.uninstallPreview': 'アンインストールのプレビューが完了しました ({mode})。',
    'activity.uninstallCompleted': 'アンインストールが完了しました ({mode})。',
    'guide.eyebrow': 'クイックガイド',
    'guide.title': '緑なら正常です。',
    'guide.summary': 'Tunnel、Health、Ready がすべて緑なら ChatGPT は WorkForge に接続できます。赤い項目がある場合は、ほかの設定を変更する前に Doctor を実行してください。',
    'guide.ready': '準備完了',
    'guide.working': '処理中 / 確認が必要',
    'guide.needsHelp': '対応が必要',
    'hud.systems': 'システム',
    'hud.systemsValue': '{count}/4 正常',
    'hud.hotkeysTitle': 'ショートカット',
    'hud.hotkeysHint': 'Alt+Shift を押している間、ボタンにキーが表示されます。',
    'hud.hotkey.start': 'トンネル開始',
    'hud.hotkey.stop': 'トンネル停止',
    'hud.hotkey.refresh': '状態と記録を再読み込み',
    'hud.hotkey.doctor': 'Doctor を実行',
    'work.detail': '詳細',
    'work.detail.eyebrow': '報告されたチェックポイント',
    'work.detail.loading': 'チェックポイントを読み込み中…',
    'work.detail.observed': '{saved} 保存 · {time} 取得。報告された状態であり、実行が検証されたものではありません。',
    'work.detail.objective': '目標',
    'work.detail.plan': '計画',
    'work.detail.completedSteps': '完了と報告されたステップ',
    'work.detail.blockers': 'ブロッカー',
    'work.detail.nextAction': '次の作業',
    'work.detail.paths': 'パス',
    'work.detail.evidence': '保存された実行の証拠',
    'work.detail.evidenceSummary': '関連 {total} 件 · 完了 {completed} · 失敗 {failed} · 取消 {cancelled} · 終了記録なし {unsealed} · 取得不可 {unavailable}',
    'work.detail.noEvidence': 'このチェックポイントに関連付けられた実行記録はありません。',
    'work.detail.evidenceUnavailable': '記録を取得できません',
    'work.detail.none': '記録なし。',
    'work.detail.claim': '{owner} が {time} まで担当しています。',
    'work.detail.claimExpired': '{owner} の担当表示は {time} に期限切れになりました。',
    'work.detail.close': '閉じる',
    'work.detail.exit': '終了コード {code}',
    'work.claim.active': '担当 {owner} · {time} まで',
    'work.claim.expired': '{owner} の担当は期限切れ · {time}',
    'work.claim.hint': '通知用の担当表示です。他のエージェントに作業者を知らせるだけで、チェックポイントはロックされません。',
    'work.detail.error.invalid_id': 'このタスク ID は無効です。',
    'work.detail.error.not_found': 'このチェックポイントはもう存在しません。',
    'work.detail.error.busy': '別の読み込みが進行中です。しばらくしてから再試行してください。',
    'work.detail.error.engine_missing': 'WorkForge エンジンのビルドがないため、詳細を読み込めません。',
    'work.detail.error.registry_invalid': 'WorkForge プロファイルレジストリを利用できません。',
    'work.detail.error.profile_unavailable': 'チェックポイントを安全に読み込めませんでした。',
    'work.detail.error.timeout': 'チェックポイントの読み込みに時間がかかりすぎました。再試行してください。',
    'work.detail.error.generic': 'チェックポイントを読み込めませんでした。',
    'update.eyebrow': 'WORKFORGE アップデート',
    'update.checkingTitle': 'アップデートを確認中…',
    'update.checkingSummary': 'WorkForge は公式 GitHub Release を確認し、インストール前に Release checksum を検証します。',
    'update.current': '現在',
    'update.latest': '最新',
    'update.preparing': 'アップデートを準備中…',
    'update.availableTitle': 'WorkForge {version} を利用できます',
    'update.availableSummary': '公式 GitHub Release からアップデートをダウンロードし、SHA-256 を検証して既存バージョンと並行して staging します。整合性チェックを通過した場合のみ有効化し、実行中のトンネルは自動で再接続・再起動します。',
    'update.availableBadge': 'アップデートあり',
    'update.upToDateTitle': 'WorkForge は最新です',
    'update.upToDateSummary': '現在利用できる新しい安定版はありません。',
    'update.upToDateBadge': '最新版',
    'update.unavailableTitle': 'アップデートを確認できません',
    'update.sourcePreviewTitle': 'macOS では手動でアップデートします',
    'update.sourceCheckoutTitle': 'ソースから実行中です',
    'update.sourceCheckoutSummary': 'この WorkForge はソースから実行されているため、自動更新は無効です。Git チェックアウトの場合は、リポジトリで git pull と npm run build を実行してください。',
    'update.sourcePreviewSummary': 'macOS ソースプレビューは自動更新されません。新しいリリースを取得して setup を再実行してください。',
    'update.updatingTitle': 'WorkForge {version} にアップデート中...',
    'update.runningSummary': 'アップデートを実行中です。このコントロール画面を開いたままにしてください。',
    'update.updatingBadge': 'アップデート中',
    'update.rollbackTitle': '以前の WorkForge バージョンを復元中...',
    'update.rollbackSummary': 'アップデートの検証に失敗しました。WorkForge は安全に以前のバージョンへ戻しています。',
    'update.rollbackBadge': 'ロールバック中',
    'update.failedTitle': 'WorkForge のアップデートに失敗しました',
    'update.failedSummary': 'アップデートは完了しませんでした。最近のアクティビティを確認してから再試行してください。',
    'update.failedBadge': 'アップデート失敗',
    'update.installedTitle': 'WorkForge {version} のインストール完了',
    'update.completedSummary': 'アップデートが正常に完了しました。',
    'update.updatedBadge': 'アップデート完了',
    'update.waitingService': 'ローカルアップデートサービスの応答を待っています...',
    'update.checkAgain': '再確認',
    'update.button': 'WorkForge をアップデート',
    'update.confirm': 'WorkForge を {version} にアップデートしますか？ 実行中の WorkForge トンネルは自動で再起動されます。検証に失敗した場合は現在のエンジンへロールバックします。',
    'update.completedToast': 'WorkForge {version} のアップデートが完了しました。',
    'progress.check': '確認',
    'progress.download': 'ダウンロード',
    'progress.verify': '検証',
    'progress.stage': 'ステージング',
    'progress.pauseTunnels': 'トンネル停止',
    'progress.activate': '有効化',
    'progress.rebind': '再接続',
    'progress.doctor': 'Doctor',
    'progress.restart': '再起動',
    'progress.finish': '完了処理',
    'progress.starting': 'WorkForge アップデートを開始しています...',
    'progress.checking': '最新の安定版 WorkForge を確認しています...',
    'progress.downloading': 'WorkForge Release をダウンロードしています...',
    'progress.verifying': 'ダウンロードした Release を検証しています...',
    'progress.staging': '新しいエンジンを既存バージョンと並行して staging しています...',
    'progress.stopping': '実行中の WorkForge トンネルを一時停止しています...',
    'progress.activating': '新しい WorkForge エンジンを有効化しています...',
    'progress.rebinding': 'トンネルプロファイルを新しい Runtime に再接続しています...',
    'progress.doctorStage': 'アップデート後の Doctor チェックを実行しています...',
    'progress.restarting': 'アップデート前のトンネル実行状態を復元しています...',
    'progress.finalizing': 'WorkForge アップデートを完了処理しています...',
    'progress.rollback': 'アップデートの検証に失敗しました。以前の WorkForge エンジンを復元しています...',
    'progress.completed': 'WorkForge アップデートが完了しました。',
    'danger.eyebrow': '危険な操作',
    'danger.title': 'WorkForge を削除',
    'danger.summary': 'Workspace を残したまま WorkForge のみを削除するか、すべて削除できます。プレビューを確認して明示的に承認するまで何も削除されません。',
    'danger.uninstall': 'アンインストール…',
    'footer.localOnly': 'ローカル専用 · 127.0.0.1 · リモートダッシュボードアクセスなし',
    'uninstall.eyebrow': '安全なアンインストール',
    'uninstall.title': '残す項目を選択',
    'uninstall.keepWorkspace': 'Workspace を残す',
    'uninstall.recommended': '推奨',
    'uninstall.keepDescription': 'Workspace、Git 履歴、ユーザーファイルを残し、WorkForge の運用状態のみ削除します。',
    'uninstall.removeEverything': 'すべて削除',
    'uninstall.removeDescription': 'WorkForge と選択した Workspace を削除します。この操作は元に戻せません。',
    'uninstall.preview': '削除内容をプレビュー',
    'uninstall.removalPreview': '削除プレビュー',
    'uninstall.defaultPreview': '削除する前にプレビューを実行してください。',
    'uninstall.confirm': 'プレビューを確認し、続行することに同意します。',
    'uninstall.phrasePrefix': '次の文字列を',
    'uninstall.phraseSuffix': '正確に入力してください:',
    'uninstall.cancel': 'キャンセル',
    'uninstall.removeButton': 'WorkForge を削除',
    'uninstall.previewing': 'アンインストールのプレビューを作成中…',
    'uninstall.previewReady': 'アンインストールのプレビューを用意しました。',
    'uninstall.previewFirst': '選択した削除方法のプレビューを先に実行してください。',
    'uninstall.confirmFirst': 'プレビューを確認し、確認ボックスを選択してください。',
    'uninstall.typePhrase': 'REMOVE WORKFORGE と正確に入力してください。',
    'uninstall.uninstalling': 'アンインストール中…',
    'uninstall.completedToast': 'アンインストールが完了しました。',
    'uninstall.mode.KeepWorkspace': 'Workspace を保持',
    'uninstall.mode.RemoveEverything': 'すべて削除',
    'aria.close': '閉じる',
    'aria.tunnelStatus': 'トンネル状態',
    'aria.updateProgress': 'WorkForge アップデート進捗',
    'aria.updateStages': 'アップデート手順',
    'state.idle': '待機',
    'state.working': '処理中',
    'state.checking': '確認中',
    'state.unknown': '不明',
    'state.offline': 'オフライン',
    'state.online': 'オンライン',
    'state.attention': '注意',
    'state.healthy': '正常',
    'state.unreachable': '接続不可',
    'state.ready': '準備完了',
    'state.not-ready': '未準備',
    'state.running': '実行中',
    'state.stopped': '停止',
    'state.waiting': '待機中',
    'state.unavailable': '利用不可',
    'state.normal': '正常',
    'state.start': '開始',
    'state.stop': '停止',
    'state.doctor': 'Doctor',
    'state.update': 'アップデート',
    'state.uninstall-preview': '削除プレビュー',
    'state.uninstall': 'アンインストール',
    'check.ready': '✓ 準備完了',
    'check.running': '✓ 実行中',
    'check.stopped': '○ 停止',
    'check.notRunning': '△ 未実行',
    'check.waiting': '△ 待機中',
    'check.offline': '× オフライン',
    'check.setup': '× 設定を確認',
    'check.unknown': '× 不明',
    'action.completed': '{action} が完了しました。',
    'error.unexpectedResponse': '予期しない応答です ({status})。',
    'error.requestFailed': 'リクエストに失敗しました ({status})。',
    'terminal.updatedEyebrow': 'WORKFORGE アップデート完了',
    'terminal.updatedTitle': 'アップデート完了',
    'terminal.updatedCopy': '新しいエンジンとダッシュボードを使用するには WorkForge Control をもう一度開いてください。',
    'terminal.uninstallTitle': 'アンインストール完了',
    'terminal.uninstallCopy': 'ローカル Control セッションは終了しました。このブラウザタブを閉じても構いません。',
    'terminal.closedTitle': 'Control を終了しました',
    'terminal.closedCopy': 'ローカルダッシュボードサーバーは停止しました。このタブを閉じても構いません。',
  },
  zh: {
    "work.eyebrow": "工作记录",
    "work.title": "从上次的进度继续。",
    "work.loading": "正在检查工作记录…",
    "work.tasks": "检查点 · 已报告的状态",
    "work.jobs": "最近执行 · 已保存的证据",
    "work.emptyTasks": "暂无任务检查点。",
    "work.emptyJobs": "暂无执行记录。",
    "work.updated": "更新于 {time}。",
    "work.partial": "仅显示部分记录 · 更新于 {time}",
    "work.unavailable": "无法获取工作记录。连接控制仍然可用。",
    "work.stale": "刷新失败。显示最后于 {time} 观察到的记录。",
    "work.mode": "仅当运行中会话的隧道日志提供证据时才显示MCP模式徽章。依赖只读保护之前，请在ChatGPT中检查toolMode。",
    "mode.log.read_only": "MCP：只读 · 日志 {time}",
    "mode.log.read_write": "MCP：读写 · 日志 {time}",
    "mode.tools": "{count} 个工具",
    "mode.stale": "MCP模式未验证 · 早前记录 {time}",
    "mode.unknown": "MCP模式未验证",
    "mode.hint": "仅当隧道日志能证明运行中会话的模式时显示。请在ChatGPT中确认workstation_context.toolMode。",
    "work.copy": "复制恢复指令",
    "work.copied": "已复制恢复指令。",
    "work.copyFailed": "复制失败。请选中下方任务ID。",
    "work.reported.active": "报告为进行中",
    "work.reported.blocked": "报告为受阻",
    "work.reported.completed": "报告为完成",
    "work.unsealed": "无结束记录（运行中或异常退出）",
    "work.shell.completed": "完成记录",
    "work.shell.failed": "失败记录",
    "work.shell.cancelled": "取消记录",
    "work.shell.running": "运行中",
    "work.output": "退出代码 {code} · 输出 {bytes}字节",
    'app.title': 'WorkForge 控制台',
    'brand.eyebrow': '本地控制面板',
    'brand.title': 'WorkForge 控制台',
    'brand.subtitle': '让 AI 在 Windows 上安全工作，并通过清晰直观的控制面板掌握当前状态。',
    'language.label': '语言',
    'control.close': '关闭控制台',
    'profile.value': '配置文件: {profile}',
    'tunnel.eyebrow': '安全隧道',
    'tunnel.checkingTitle': '正在检查连接状态…',
    'tunnel.checkingSummary': 'WorkForge 正在向本地 Supervisor 查询当前状态。',
    'tunnel.stoppedTitle': '隧道已停止',
    'tunnel.stoppedSummary': '启动安全隧道之前，ChatGPT 无法连接到 WorkForge。',
    'tunnel.readyTitle': 'WorkForge 已准备就绪',
    'tunnel.readySummary': '安全隧道运行正常，已准备好接受 ChatGPT 连接。',
    'tunnel.attentionTitle': '隧道需要检查',
    'tunnel.attentionSummary': '进程正在运行，但 Health 或 Readiness 尚未完全正常。',
    'tunnel.unavailableTitle': '无法获取 WorkForge 状态',
    'metric.health': '状态',
    'metric.readiness': '就绪状态',
    'metric.supervisor': 'Supervisor',
    'metric.recovery': '恢复',
    'button.startTunnel': '▶ 启动隧道',
    'button.stopTunnel': '■ 停止隧道',
    'button.refresh': '↻ 刷新',
    'doctor.eyebrow': '系统检查',
    'doctor.title': 'Doctor',
    'doctor.notRun': '尚未运行',
    'doctor.summary': '一键检查本地配置文件、Runtime、隧道客户端、凭据以及在线隧道路由。',
    'doctor.item.profile': '配置文件',
    'doctor.item.process': '隧道进程',
    'doctor.item.supervisor': 'Supervisor',
    'doctor.item.readiness': 'MCP 就绪状态',
    'doctor.run': '运行 Doctor',
    'doctor.details': '查看技术详情',
    'doctor.notRunDetail': '当前控制面板会话中尚未运行 Doctor。',
    'doctor.healthy': '正常',
    'doctor.needsAttention': '需要检查',
    'doctor.completed': 'Doctor 检查已成功完成。',
    'activity.eyebrow': '最近活动',
    'activity.title': '刚刚发生了什么？',
    'activity.empty': '目前还没有控制面板活动记录。',
    'activity.generic': '活动',
    'activity.controlStarted': '控制面板已启动。',
    'activity.tunnelRunning': '隧道正在运行。',
    'activity.tunnelStopped': '隧道已停止。',
    'activity.tunnelReady': '隧道已进入就绪状态。',
    'activity.tunnelHealthChanged': '隧道 Health 状态发生了变化。',
    'activity.tunnelStatusChanged': '隧道状态发生了变化。',
    'activity.updatePreparing': '正在下载并验证 WorkForge 更新...',
    'activity.updated': 'WorkForge 已更新到 {version}。',
    'activity.updateFailed': '更新失败: {detail}',
    'activity.tunnelStarting': '正在启动安全隧道...',
    'activity.startCompleted': '隧道启动命令已完成。',
    'activity.tunnelStopping': '正在停止安全隧道...',
    'activity.stopCompleted': '隧道停止命令已完成。',
    'activity.doctorRunning': '正在运行 Doctor...',
    'activity.doctorCompleted': 'Doctor 检查已成功完成。',
    'activity.uninstallPreview': '卸载预览已完成 ({mode})。',
    'activity.uninstallCompleted': '卸载已完成 ({mode})。',
    'guide.eyebrow': '快速指南',
    'guide.title': '绿色表示正常。',
    'guide.summary': '如果 Tunnel、Health 和 Ready 都显示为绿色，ChatGPT 就能连接 WorkForge。如果出现红色项目，请先运行 Doctor，再修改其他设置。',
    'guide.ready': '已就绪',
    'guide.working': '处理中 / 需要关注',
    'guide.needsHelp': '需要处理',
    'hud.systems': '系统',
    'hud.systemsValue': '{count}/4 正常',
    'hud.hotkeysTitle': '快捷键',
    'hud.hotkeysHint': '按住 Alt+Shift 时，按钮上会显示对应按键。',
    'hud.hotkey.start': '启动隧道',
    'hud.hotkey.stop': '停止隧道',
    'hud.hotkey.refresh': '刷新状态和记录',
    'hud.hotkey.doctor': '运行 Doctor',
    'work.detail': '详情',
    'work.detail.eyebrow': '已报告的检查点',
    'work.detail.loading': '正在加载检查点…',
    'work.detail.observed': '{saved} 保存 · {time} 读取。这是报告的状态，并非已验证的执行结果。',
    'work.detail.objective': '目标',
    'work.detail.plan': '计划',
    'work.detail.completedSteps': '报告已完成的步骤',
    'work.detail.blockers': '阻碍',
    'work.detail.nextAction': '下一步',
    'work.detail.paths': '路径',
    'work.detail.evidence': '已保存的执行证据',
    'work.detail.evidenceSummary': '关联 {total} 条 · 完成 {completed} · 失败 {failed} · 取消 {cancelled} · 无结束记录 {unsealed} · 无法读取 {unavailable}',
    'work.detail.noEvidence': '此检查点没有关联的执行记录。',
    'work.detail.evidenceUnavailable': '无法读取记录',
    'work.detail.none': '无记录。',
    'work.detail.claim': '{owner} 负责至 {time}。',
    'work.detail.claimExpired': '{owner} 的负责标记已于 {time} 过期。',
    'work.detail.close': '关闭',
    'work.detail.exit': '退出代码 {code}',
    'work.claim.active': '负责人 {owner} · 至 {time}',
    'work.claim.expired': '{owner} 的负责标记已过期 · {time}',
    'work.claim.hint': '这是提示性的负责标记，仅告知其他代理谁在处理此任务，不会锁定检查点。',
    'work.detail.error.invalid_id': '此任务 ID 无效。',
    'work.detail.error.not_found': '此检查点已不存在。',
    'work.detail.error.busy': '另一项读取正在进行。请稍后重试。',
    'work.detail.error.engine_missing': '缺少 WorkForge 引擎构建，无法读取详情。',
    'work.detail.error.registry_invalid': 'WorkForge 配置文件注册表不可用。',
    'work.detail.error.profile_unavailable': '无法安全读取此检查点。',
    'work.detail.error.timeout': '读取检查点耗时过长。请重试。',
    'work.detail.error.generic': '无法加载检查点。',
    'update.eyebrow': 'WORKFORGE 更新',
    'update.checkingTitle': '正在检查更新…',
    'update.checkingSummary': 'WorkForge 会检查官方 GitHub Release，并在安装前验证 Release checksum。',
    'update.current': '当前',
    'update.latest': '最新',
    'update.preparing': '正在准备更新…',
    'update.availableTitle': 'WorkForge {version} 可用',
    'update.availableSummary': '更新会从官方 GitHub Release 下载，完成 SHA-256 验证后与现有版本并行 staging。只有通过完整性检查后才会激活新版本，正在运行的隧道会自动重新绑定并重启。',
    'update.availableBadge': '有可用更新',
    'update.upToDateTitle': 'WorkForge 已是最新版本',
    'update.upToDateSummary': '当前没有更新的稳定版本可用。',
    'update.upToDateBadge': '已是最新',
    'update.unavailableTitle': '无法检查更新',
    'update.sourcePreviewTitle': 'macOS 需要手动更新',
    'update.sourceCheckoutTitle': '正在从源码运行',
    'update.sourceCheckoutSummary': '此 WorkForge 正在从源码运行，因此自动更新已关闭。如果使用 Git 检出，请在仓库中运行 git pull 和 npm run build。',
    'update.sourcePreviewSummary': 'macOS 源码预览版不会自动更新。请下载新版本并重新运行 setup。',
    'update.updatingTitle': '正在将 WorkForge 更新到 {version}...',
    'update.runningSummary': '更新正在进行中。请保持此控制面板窗口打开。',
    'update.updatingBadge': '更新中',
    'update.rollbackTitle': '正在恢复之前的 WorkForge 版本...',
    'update.rollbackSummary': '更新验证失败。WorkForge 正在安全回滚到之前的版本。',
    'update.rollbackBadge': '回滚中',
    'update.failedTitle': 'WorkForge 更新失败',
    'update.failedSummary': '更新未完成。请查看最近活动，并在准备好后重试。',
    'update.failedBadge': '更新失败',
    'update.installedTitle': 'WorkForge {version} 安装完成',
    'update.completedSummary': '更新已成功完成。',
    'update.updatedBadge': '更新完成',
    'update.waitingService': '正在等待本地更新服务响应...',
    'update.checkAgain': '重新检查',
    'update.button': '更新 WorkForge',
    'update.confirm': '要将 WorkForge 更新到 {version} 吗？正在运行的 WorkForge 隧道将自动重启。如果验证失败，WorkForge 会回滚到当前引擎。',
    'update.completedToast': 'WorkForge {version} 更新已完成。',
    'progress.check': '检查',
    'progress.download': '下载',
    'progress.verify': '验证',
    'progress.stage': '暂存',
    'progress.pauseTunnels': '暂停隧道',
    'progress.activate': '激活',
    'progress.rebind': '重新绑定',
    'progress.doctor': 'Doctor',
    'progress.restart': '重启',
    'progress.finish': '完成',
    'progress.starting': '正在启动 WorkForge 更新...',
    'progress.checking': '正在检查最新的 WorkForge 稳定版本...',
    'progress.downloading': '正在下载 WorkForge Release...',
    'progress.verifying': '正在验证下载的 Release...',
    'progress.staging': '正在将新引擎与现有版本并行 staging...',
    'progress.stopping': '正在暂停运行中的 WorkForge 隧道...',
    'progress.activating': '正在激活新的 WorkForge 引擎...',
    'progress.rebinding': '正在将隧道配置重新绑定到新的 Runtime...',
    'progress.doctorStage': '正在运行更新后的 Doctor 检查...',
    'progress.restarting': '正在恢复更新前的隧道运行状态...',
    'progress.finalizing': '正在完成 WorkForge 更新...',
    'progress.rollback': '更新验证失败。正在恢复之前的 WorkForge 引擎...',
    'progress.completed': 'WorkForge 更新已完成。',
    'danger.eyebrow': '危险区域',
    'danger.title': '移除 WorkForge',
    'danger.summary': '可以保留 Workspace 只移除 WorkForge，也可以全部移除。在预览并明确确认之前，不会删除任何内容。',
    'danger.uninstall': '卸载…',
    'footer.localOnly': '仅限本地 · 127.0.0.1 · 不允许远程访问控制面板',
    'uninstall.eyebrow': '安全卸载',
    'uninstall.title': '选择要保留的内容',
    'uninstall.keepWorkspace': '保留 Workspace',
    'uninstall.recommended': '推荐',
    'uninstall.keepDescription': '保留 Workspace、Git 历史记录和用户文件，仅移除 WorkForge 的运行状态。',
    'uninstall.removeEverything': '全部移除',
    'uninstall.removeDescription': '移除 WorkForge 和选定的 Workspace。此操作无法撤销。',
    'uninstall.preview': '预览将要移除的内容',
    'uninstall.removalPreview': '移除预览',
    'uninstall.defaultPreview': '移除之前请先运行预览。',
    'uninstall.confirm': '我已查看预览并希望继续。',
    'uninstall.phrasePrefix': '请准确输入',
    'uninstall.phraseSuffix': ':',
    'uninstall.cancel': '取消',
    'uninstall.removeButton': '移除 WorkForge',
    'uninstall.previewing': '正在生成卸载预览…',
    'uninstall.previewReady': '卸载预览已准备好。',
    'uninstall.previewFirst': '请先为所选的移除方式运行预览。',
    'uninstall.confirmFirst': '请查看预览并勾选确认框。',
    'uninstall.typePhrase': '请准确输入 REMOVE WORKFORGE。',
    'uninstall.uninstalling': '正在卸载…',
    'uninstall.completedToast': '卸载已完成。',
    'uninstall.mode.KeepWorkspace': '保留 Workspace',
    'uninstall.mode.RemoveEverything': '全部移除',
    'aria.close': '关闭',
    'aria.tunnelStatus': '隧道状态',
    'aria.updateProgress': 'WorkForge 更新进度',
    'aria.updateStages': '更新阶段',
    'state.idle': '空闲',
    'state.working': '处理中',
    'state.checking': '检查中',
    'state.unknown': '未知',
    'state.offline': '离线',
    'state.online': '在线',
    'state.attention': '注意',
    'state.healthy': '正常',
    'state.unreachable': '无法连接',
    'state.ready': '已就绪',
    'state.not-ready': '未就绪',
    'state.running': '运行中',
    'state.stopped': '已停止',
    'state.waiting': '等待中',
    'state.unavailable': '不可用',
    'state.normal': '正常',
    'state.start': '启动',
    'state.stop': '停止',
    'state.doctor': 'Doctor',
    'state.update': '更新',
    'state.uninstall-preview': '卸载预览',
    'state.uninstall': '卸载',
    'check.ready': '✓ 已就绪',
    'check.running': '✓ 运行中',
    'check.stopped': '○ 已停止',
    'check.notRunning': '△ 未运行',
    'check.waiting': '△ 等待中',
    'check.offline': '× 离线',
    'check.setup': '× 检查设置',
    'check.unknown': '× 未知',
    'action.completed': '{action} 已完成。',
    'error.unexpectedResponse': '收到意外响应 ({status})。',
    'error.requestFailed': '请求失败 ({status})。',
    'terminal.updatedEyebrow': 'WORKFORGE 更新完成',
    'terminal.updatedTitle': '更新完成',
    'terminal.updatedCopy': '要使用新引擎和控制面板，请重新打开 WorkForge Control。',
    'terminal.uninstallTitle': '卸载完成',
    'terminal.uninstallCopy': '本地 Control 会话已关闭。现在可以关闭此浏览器标签页。',
    'terminal.closedTitle': 'Control 已关闭',
    'terminal.closedCopy': '本地控制面板服务器已停止。现在可以关闭此标签页。',
  },
};

function normalizeLanguage(value) {
  const language = String(value || '').toLowerCase();
  if (language.startsWith('ko')) return 'ko';
  if (language.startsWith('ja')) return 'ja';
  if (language.startsWith('zh')) return 'zh';
  if (language.startsWith('en')) return 'en';
  return null;
}

function resolveInitialLanguage() {
  try {
    const stored = normalizeLanguage(localStorage.getItem(languageStorageKey));
    if (stored) return stored;
  } catch {
    // localStorage may be unavailable in hardened browser contexts.
  }
  for (const language of navigator.languages || [navigator.language || 'en']) {
    const normalized = normalizeLanguage(language);
    if (normalized) return normalized;
  }
  return 'en';
}

let currentLanguage = resolveInitialLanguage();
let currentStatus = null;
let workSnapshot = null;
let workUnavailable = false;
let workDataKey = '';
let workRequest = null;
let workPollTimer = null;
let statusFailureMessage = null;
let currentUpdate = null;
let updateFailureMessage = null;
let currentUpdateProgress = null;
let currentActivity = [];
let currentMeta = null;
let doctorState = 'idle';
let doctorDetail = null;
let uninstallPreviewState = { kind: 'idle', detail: null };
let pollTimer = null;
let updateProgressTimer = null;
let toastTimer = null;
let actionInFlight = false;
let lastPreviewMode = null;

function t(key, variables = {}) {
  const template = strings[currentLanguage]?.[key] ?? strings.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? `{${name}}`));
}

function labelState(value) {
  const raw = String(value || 'unknown');
  const translated = strings[currentLanguage]?.[`state.${raw}`] ?? strings.en[`state.${raw}`];
  if (translated) return translated;
  return raw.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function localizeUninstallMode(mode) {
  return t(`uninstall.mode.${mode}`);
}

function localizeActivityMessage(value) {
  const message = String(value || '');
  const exact = new Map([
    ['Control dashboard started.', 'activity.controlStarted'],
    ['Tunnel is running.', 'activity.tunnelRunning'],
    ['Tunnel is stopped.', 'activity.tunnelStopped'],
    ['Tunnel became ready.', 'activity.tunnelReady'],
    ['Tunnel health changed.', 'activity.tunnelHealthChanged'],
    ['Tunnel status changed.', 'activity.tunnelStatusChanged'],
    ['Downloading and validating the WorkForge update...', 'activity.updatePreparing'],
    ['Starting secure tunnel...', 'activity.tunnelStarting'],
    ['Start command completed.', 'activity.startCompleted'],
    ['Stopping secure tunnel...', 'activity.tunnelStopping'],
    ['Stop command completed.', 'activity.stopCompleted'],
    ['Running Doctor...', 'activity.doctorRunning'],
    ['Doctor completed successfully.', 'activity.doctorCompleted'],
  ]);
  const exactKey = exact.get(message);
  if (exactKey) return t(exactKey);
  let match = message.match(/^Updated WorkForge to (.+)\.$/);
  if (match) return t('activity.updated', { version: match[1] });
  match = message.match(/^update failed: (.+)$/i);
  if (match) return t('activity.updateFailed', { detail: match[1] });
  match = message.match(/^Uninstall preview completed \((.+)\)\.$/);
  if (match) return t('activity.uninstallPreview', { mode: localizeUninstallMode(match[1]) });
  match = message.match(/^Uninstall completed \((.+)\)\.$/);
  if (match) return t('activity.uninstallCompleted', { mode: localizeUninstallMode(match[1]) });
  return message || t('activity.generic');
}

function localizeProgressMessage(progress) {
  if (currentLanguage === 'en' && progress?.message) return progress.message;
  const stage = String(progress?.stage || 'starting');
  const keys = {
    starting: 'progress.starting',
    checking: 'progress.checking',
    downloading: 'progress.downloading',
    verifying: 'progress.verifying',
    staging: 'progress.staging',
    stopping: 'progress.stopping',
    activating: 'progress.activating',
    rebinding: 'progress.rebinding',
    doctor: 'progress.doctorStage',
    restarting: 'progress.restarting',
    finalizing: 'progress.finalizing',
    rollback: 'progress.rollback',
    completed: 'progress.completed',
  };
  return t(keys[stage] || 'progress.starting');
}

function toast(message, type = '') {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible ${type}`.trim();
  toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: t('error.unexpectedResponse', { status: response.status }) };
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || t('error.requestFailed', { status: response.status }));
  }
  return payload;
}

function setBusy(active, label = null) {
  actionInFlight = active;
  elements.busyBadge.textContent = active ? label || t('state.working') : t('state.idle');
  elements.busyBadge.className = active ? 'badge badge-warning' : 'badge badge-neutral';
  updateButtons();
}

function updateButtons() {
  const running = Boolean(currentStatus?.running);
  const updating = currentUpdateProgress?.status === 'running' || currentUpdateProgress?.status === 'rollback';
  const updateSupported = currentMeta?.capabilities?.update !== false && currentUpdate?.supported !== false;
  const uninstallSupported = currentMeta?.capabilities?.uninstall !== false;
  elements.startButton.disabled = actionInFlight || updating || running;
  elements.stopButton.disabled = actionInFlight || updating || !running;
  elements.refreshButton.disabled = actionInFlight || updating;
  elements.doctorButton.disabled = actionInFlight || updating;
  elements.checkUpdateButton.disabled = actionInFlight || updating || !updateSupported;
  elements.updateButton.disabled = actionInFlight || updating || !updateSupported || !currentUpdate?.updateAvailable;
  elements.openUninstallButton.disabled = actionInFlight || updating || !uninstallSupported;
}

function setChip(kind, text) {
  elements.connectionChip.className = `chip chip-${kind}`;
  elements.connectionChip.innerHTML = '<span class="dot"></span>';
  elements.connectionChip.append(document.createTextNode(` ${text}`));
}

function setCheck(element, state, text) {
  element.textContent = text;
  element.className = `check-state ${state}`;
}

let lastHeroKind = null;

function setHeroKind(kind) {
  elements.heroStatus.className = `status-orb status-${kind}`;
  if (lastHeroKind && lastHeroKind !== kind) {
    // Restart the one-shot border flash only when the tunnel state category changes.
    elements.tunnelPanel.classList.remove('hud-flash');
    void elements.tunnelPanel.offsetWidth;
    elements.tunnelPanel.classList.add('hud-flash');
  }
  lastHeroKind = kind;
}

// The gauge mirrors the four Doctor checklist verdicts; it is never a synthetic score.
function renderSystems(count) {
  const level = count === null ? 'unknown' : count === 4 ? 'good' : count === 0 ? 'bad' : 'warn';
  elements.systemsMeter.className = `systems-meter systems-${level}`;
  elements.systemsMeter.querySelectorAll('.systems-segments i').forEach((segment, index) => {
    segment.classList.toggle('on', count !== null && index < count);
  });
  elements.systemsValue.textContent = count === null ? '—' : t('hud.systemsValue', { count });
}

function renderDoctorState() {
  if (doctorState === 'healthy') {
    elements.doctorBadge.textContent = t('doctor.healthy');
    elements.doctorBadge.className = 'badge badge-success';
  } else if (doctorState === 'error') {
    elements.doctorBadge.textContent = t('doctor.needsAttention');
    elements.doctorBadge.className = 'badge badge-error';
  } else {
    elements.doctorBadge.textContent = t('doctor.notRun');
    elements.doctorBadge.className = 'badge badge-neutral';
  }
  elements.doctorOutput.textContent = doctorDetail || t('doctor.notRunDetail');
}

function renderStatus(status) {
  currentStatus = status;
  statusFailureMessage = null;
  elements.profileChip.textContent = t('profile.value', { profile: status.profileId || t('state.unknown') });

  if (!status.running) {
    setChip('offline', t('state.offline'));
    setHeroKind('offline');
    elements.tunnelTitle.textContent = t('tunnel.stoppedTitle');
    elements.tunnelSummary.textContent = t('tunnel.stoppedSummary');
  } else if (status.readyState === 'ready' && status.healthState === 'healthy') {
    setChip('online', t('state.online'));
    setHeroKind('online');
    elements.tunnelTitle.textContent = t('tunnel.readyTitle');
    elements.tunnelSummary.textContent = t('tunnel.readySummary');
  } else {
    setChip('warning', t('state.attention'));
    setHeroKind('warning');
    elements.tunnelTitle.textContent = t('tunnel.attentionTitle');
    elements.tunnelSummary.textContent = status.error || t('tunnel.attentionSummary');
  }

  elements.healthMetric.textContent = labelState(status.healthState);
  elements.readyMetric.textContent = labelState(status.readyState);
  elements.supervisorMetric.textContent = status.supervised ? t('state.running') : labelState(status.supervisorState);
  elements.recoveryMetric.textContent = status.recoveryState ? labelState(status.recoveryState) : t('state.normal');

  setCheck(elements.profileCheck, 'check-good', t('check.ready'));
  setCheck(
    elements.processCheck,
    status.running ? 'check-good' : 'check-warn',
    status.running ? t('check.running') : t('check.stopped'),
  );
  setCheck(
    elements.supervisorCheck,
    status.supervised ? 'check-good' : 'check-warn',
    status.supervised ? t('check.running') : t('check.notRunning'),
  );
  setCheck(
    elements.readyCheck,
    status.readyState === 'ready' ? 'check-good' : status.running ? 'check-warn' : 'check-bad',
    status.readyState === 'ready' ? t('check.ready') : status.running ? t('check.waiting') : t('check.offline'),
  );
  renderSystems(1 + Number(Boolean(status.running)) + Number(Boolean(status.supervised)) + Number(status.readyState === 'ready'));

  updateButtons();
}

function renderStatusFailure(message) {
  currentStatus = null;
  statusFailureMessage = message;
  setChip('offline', t('state.unavailable'));
  setHeroKind('offline');
  renderSystems(0);
  elements.tunnelTitle.textContent = t('tunnel.unavailableTitle');
  elements.tunnelSummary.textContent = message;
  elements.healthMetric.textContent = t('state.unknown');
  elements.readyMetric.textContent = t('state.unknown');
  elements.supervisorMetric.textContent = t('state.unknown');
  elements.recoveryMetric.textContent = t('state.unknown');
  setCheck(elements.profileCheck, 'check-bad', t('check.setup'));
  setCheck(elements.processCheck, 'check-bad', t('check.unknown'));
  setCheck(elements.supervisorCheck, 'check-bad', t('check.unknown'));
  setCheck(elements.readyCheck, 'check-bad', t('check.unknown'));
  updateButtons();
}

function renderActivity(items = []) {
  currentActivity = items;
  elements.activityList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('activity.empty');
    elements.activityList.append(empty);
    return;
  }

  for (const item of items.slice(0, 12)) {
    const row = document.createElement('div');
    row.className = `activity-item activity-${item.kind || 'info'}`;

    const marker = document.createElement('span');
    marker.className = 'activity-marker';

    const message = document.createElement('span');
    message.className = 'activity-message';
    message.textContent = localizeActivityMessage(item.message);

    const time = document.createElement('time');
    time.className = 'activity-time';
    const date = new Date(item.at);
    const locale = ({ en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN' })[currentLanguage] || 'en-US';
    time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    row.append(marker, message, time);
    elements.activityList.append(row);
  }
}

function workTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(currentLanguage, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date) : '—';
}

function renderWork({ force = false } = {}) {
  const payload = workSnapshot;
  elements.workSummary.textContent = workUnavailable
    ? payload ? t('work.stale', { time: workTime(payload.observedAt) }) : t('work.unavailable')
    : payload ? t(payload.partial ? 'work.partial' : 'work.updated', { time: workTime(payload.observedAt) }) : t('work.loading');
  const key = JSON.stringify([currentLanguage, payload?.tasks, payload?.jobs]);
  if (!force && key === workDataKey) return;
  workDataKey = key;
  const fill = (container, records, kind) => {
    container.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('li');
      empty.className = 'work-note';
      empty.textContent = t(kind === 'task' ? 'work.emptyTasks' : 'work.emptyJobs');
      if (!payload) empty.textContent = '—';
      container.append(empty);
    }
    for (const record of records) {
      const row = document.createElement('li');
      // Card styling follows the recorded state only; unsealed executions never look like running work.
      row.className = kind === 'task'
        ? `work-record quest quest-${record.reportedStatus}`
        : `work-record mission mission-${record.trackingState === 'ownership_lost' ? 'unsealed' : record.status}`;
      const heading = document.createElement('div');
      heading.className = 'work-record-heading';
      const title = document.createElement('strong');
      title.textContent = kind === 'task' ? record.title : record.cwd;
      heading.append(title);
      if (kind === 'task') {
        const copy = document.createElement('button');
        copy.type = 'button'; copy.className = 'work-copy'; copy.textContent = t('work.copy');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(`task_resume ${JSON.stringify({ taskId: record.taskId })}`);
            toast(t('work.copied'));
          } catch { toast(t('work.copyFailed'), 'error'); }
        });
        const detail = document.createElement('button');
        detail.type = 'button'; detail.className = 'work-copy work-detail'; detail.textContent = t('work.detail');
        detail.addEventListener('click', () => openTaskDetail(record.taskId, detail));
        heading.append(copy, detail);
      }
      const state = document.createElement('p');
      state.className = 'work-state';
      state.textContent = kind === 'task' ? t(`work.reported.${record.reportedStatus}`)
        : record.trackingState === 'ownership_lost' ? t('work.unsealed') : t(`work.shell.${record.status}`);
      const id = document.createElement('code');
      id.textContent = kind === 'task' ? record.taskId : record.id;
      const time = document.createElement('time');
      time.dateTime = kind === 'task' ? record.savedAt : record.updatedAt;
      time.textContent = workTime(time.dateTime);
      row.append(heading, state, time, id);
      if (kind === 'task' && record.claim) {
        // Claims are advisory; the chip names the owner but never implies the checkpoint is locked.
        const expired = record.claim.expired || Date.parse(record.claim.expiresAt) <= Date.now();
        const claim = document.createElement('p');
        claim.className = `work-claim${expired ? ' work-claim-expired' : ''}`;
        claim.textContent = t(expired ? 'work.claim.expired' : 'work.claim.active',
          { owner: record.claim.owner, time: workTime(record.claim.expiresAt) });
        claim.title = t('work.claim.hint');
        row.append(claim);
      }
      if (kind !== 'task') {
        const output = document.createElement('p');
        output.textContent = t('work.output', { code: record.exitCode ?? '—',
          bytes: new Intl.NumberFormat(currentLanguage).format(record.stdoutBytes + record.stderrBytes) });
        row.append(output);
      }
      container.append(row);
    }
  };
  fill(elements.taskRecords, payload?.tasks || [], 'task');
  fill(elements.shellRecords, payload?.jobs || [], 'shell');
}

async function refreshWork({ force = false } = {}) {
  if (workRequest) return workRequest;
  workRequest = (async () => {
    try {
      const payload = await api(force ? '/api/work?refresh=1' : '/api/work');
      workUnavailable = !payload.available;
      if (payload.available) workSnapshot = payload;
    } catch { workUnavailable = true; }
    renderWork();
  })();
  try { await workRequest; } finally { workRequest = null; }
}

let modeEvidence = null;
let modeRequest = null;

// Only `log` evidence (tied to the running session) may show a mode. A stale record hides the value:
// an unverified "read-only" label would look like protection that might not exist.
function renderModeEvidence() {
  const evidence = modeEvidence;
  const time = evidence?.observedAt ? workTime(evidence.observedAt) : '';
  let kind = 'unknown';
  let text = t('mode.unknown');
  if (evidence?.evidence === 'log' && (evidence.toolMode === 'read_only' || evidence.toolMode === 'read_write')) {
    kind = evidence.toolMode === 'read_only' ? 'ro' : 'rw';
    text = t(`mode.log.${evidence.toolMode}`, { time });
    if (Number.isInteger(evidence.tools)) text += ` · ${t('mode.tools', { count: evidence.tools })}`;
  } else if (evidence?.evidence === 'stale' && evidence.observedAt) {
    kind = 'stale';
    text = t('mode.stale', { time });
  }
  elements.modeChip.className = `chip chip-mode chip-mode-${kind}`;
  elements.modeChip.textContent = text;
  elements.modeChip.title = t('mode.hint');
}

async function refreshModeEvidence() {
  if (modeRequest) return modeRequest;
  modeRequest = (async () => {
    try { modeEvidence = await api('/api/mode-evidence'); } catch { modeEvidence = null; }
    renderModeEvidence();
  })();
  try { await modeRequest; } finally { modeRequest = null; }
}

let taskDetail = { id: null, payload: null, code: null };
let taskDetailToken = 0;
let taskDetailOpener = null;

function detailSection(titleKey, content) {
  const section = document.createElement('section');
  section.className = 'task-section';
  const heading = document.createElement('h3');
  heading.textContent = t(titleKey);
  section.append(heading, content);
  return section;
}

function detailList(items, ordered = false) {
  if (!items.length) {
    const none = document.createElement('p');
    none.className = 'task-none';
    none.textContent = t('work.detail.none');
    return none;
  }
  const list = document.createElement(ordered ? 'ol' : 'ul');
  for (const item of items) {
    const entry = document.createElement('li');
    entry.textContent = item;
    list.append(entry);
  }
  return list;
}

function detailText(value) {
  const paragraph = document.createElement('p');
  paragraph.textContent = value || t('work.detail.none');
  return paragraph;
}

// Detail content is reported text from the checkpoint; it is rendered as literal text only.
function renderTaskDetail() {
  const { payload, code } = taskDetail;
  elements.taskDialogBody.replaceChildren();
  if (!payload && !code) {
    elements.taskDialogTitle.textContent = taskDetail.id || '—';
    elements.taskDialogStatus.textContent = t('work.detail.loading');
    return;
  }
  if (code) {
    elements.taskDialogTitle.textContent = taskDetail.id || '—';
    elements.taskDialogStatus.textContent = strings.en[`work.detail.error.${code}`] ? t(`work.detail.error.${code}`) : t('work.detail.error.generic');
    return;
  }
  const { task, evidence, evidenceSummary: summary, claim } = payload;
  elements.taskDialogTitle.textContent = task.title;
  elements.taskDialogStatus.textContent = t('work.detail.observed', { saved: workTime(task.savedAt), time: workTime(payload.observedAt) });

  const badge = document.createElement('p');
  badge.className = `task-badge quest-${task.reportedStatus}`;
  badge.textContent = t(`work.reported.${task.reportedStatus}`);
  const id = document.createElement('code');
  id.className = 'task-id';
  id.textContent = task.taskId;
  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.append(badge, id);
  elements.taskDialogBody.append(meta);
  if (claim) {
    const claimLine = document.createElement('p');
    claimLine.className = 'task-claim';
    claimLine.textContent = t(claim.expired ? 'work.detail.claimExpired' : 'work.detail.claim', { owner: claim.owner, time: workTime(claim.expiresAt) });
    elements.taskDialogBody.append(claimLine);
  }

  const paths = document.createElement('ul');
  paths.className = 'task-paths';
  for (const value of [task.projectPath, ...task.relatedPaths]) {
    const entry = document.createElement('li');
    const path = document.createElement('code');
    path.textContent = value;
    entry.append(path);
    paths.append(entry);
  }

  const evidenceBlock = document.createElement('div');
  const totals = document.createElement('p');
  totals.className = 'task-summary';
  totals.textContent = summary.total ? t('work.detail.evidenceSummary', summary) : t('work.detail.noEvidence');
  evidenceBlock.append(totals);
  if (evidence.length) {
    const list = document.createElement('ul');
    list.className = 'work-records task-evidence';
    for (const record of evidence) {
      const row = document.createElement('li');
      const unsealed = record.available && record.trackingState === 'ownership_lost';
      row.className = `work-record mission mission-${!record.available ? 'cancelled' : unsealed ? 'unsealed' : record.status}`;
      const state = document.createElement('p');
      state.className = 'work-state';
      state.textContent = !record.available ? t('work.detail.evidenceUnavailable')
        : unsealed ? t('work.unsealed') : t(`work.shell.${record.status}`);
      const time = document.createElement('time');
      time.dateTime = record.updatedAt || '';
      time.textContent = record.available ? workTime(record.updatedAt) : '—';
      const recordId = document.createElement('code');
      recordId.textContent = record.id;
      row.append(state, time, recordId);
      if (record.available) {
        const exit = document.createElement('p');
        exit.textContent = t('work.detail.exit', { code: record.exitCode ?? '—' });
        row.append(exit);
      }
      list.append(row);
    }
    evidenceBlock.append(list);
  }

  elements.taskDialogBody.append(
    detailSection('work.detail.objective', detailText(task.objective)),
    detailSection('work.detail.nextAction', detailText(task.nextAction)),
    detailSection('work.detail.plan', detailList(task.plan, true)),
    detailSection('work.detail.completedSteps', detailList(task.completedSteps)),
    detailSection('work.detail.blockers', detailList(task.blockers)),
    detailSection('work.detail.evidence', evidenceBlock),
    detailSection('work.detail.paths', paths),
  );
}

async function openTaskDetail(id, opener) {
  const token = ++taskDetailToken;
  taskDetail = { id, payload: null, code: null };
  taskDetailOpener = opener;
  renderTaskDetail();
  if (!elements.taskDialog.open) elements.taskDialog.showModal();
  let next;
  try {
    const payload = await api(`/api/work/task?id=${encodeURIComponent(id)}`);
    next = payload.available ? { id, payload, code: null } : { id, payload: null, code: String(payload.code || 'generic') };
  } catch {
    next = { id, payload: null, code: 'generic' };
  }
  // A newer request (or a closed dialog) owns the dialog; drop late responses.
  if (token !== taskDetailToken || !elements.taskDialog.open) return;
  taskDetail = next;
  renderTaskDetail();
}

elements.taskDialog.addEventListener('close', () => {
  taskDetailToken += 1;
  // The opener can be rebuilt by a language switch; fall back to the task list heading.
  (taskDetailOpener?.isConnected ? taskDetailOpener : document.querySelector('#taskRecordsTitle'))?.focus();
  taskDetailOpener = null;
});

async function refreshStatus({ quiet = false } = {}) {
  try {
    const payload = await api('/api/status');
    renderStatus(payload.status);
    renderActivity(payload.activity);
    if (payload.activeAction) {
      setBusy(true, labelState(payload.activeAction));
    } else if (!actionInFlight) {
      setBusy(false);
    }
  } catch (error) {
    renderStatusFailure(error.message);
    if (!quiet) toast(error.message, 'error');
  }
}

async function runAction(action) {
  if (actionInFlight) return;
  setBusy(true, `${labelState(action)}…`);
  try {
    const payload = await api(`/api/${action}`, { method: 'POST', body: '{}' });
    if (payload.status && !payload.status.error) renderStatus(payload.status);
    if (payload.activity) renderActivity(payload.activity);
    if (action === 'doctor') {
      doctorState = 'healthy';
      doctorDetail = payload.detail || t('doctor.completed');
      renderDoctorState();
      toast(t('doctor.completed'), 'success');
    } else {
      toast(t('action.completed', { action: labelState(action) }), 'success');
    }
  } catch (error) {
    if (action === 'doctor') {
      doctorState = 'error';
      doctorDetail = error.message;
      renderDoctorState();
    }
    toast(error.message, 'error');
  } finally {
    setBusy(false);
    await refreshStatus({ quiet: true });
  }
}

const updateStageOrder = [
  'checking',
  'downloading',
  'verifying',
  'staging',
  'stopping',
  'activating',
  'rebinding',
  'doctor',
  'restarting',
  'finalizing',
];

function renderUpdateProgress(progress) {
  currentUpdateProgress = progress || null;
  if (!progress || progress.status === 'idle') {
    elements.updateProgress.className = 'update-progress hidden';
    updateButtons();
    return;
  }

  const status = String(progress.status || 'running');
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
  const stage = String(progress.stage || 'starting');
  const targetVersion = progress.targetVersion || currentUpdate?.latestVersion || t('update.latest');
  const progressMessage = localizeProgressMessage(progress);
  elements.updateProgress.className = `update-progress ${status}`;
  elements.updateProgressLabel.textContent = progressMessage;
  elements.updateProgressPercent.textContent = `${percent}%`;
  elements.updateProgressTrack.setAttribute('aria-valuenow', String(percent));
  elements.updateProgressBar.style.width = `${percent}%`;

  const activeIndex = updateStageOrder.indexOf(stage);
  const completedAll = status === 'completed';
  for (const item of elements.updateStageList.querySelectorAll('[data-update-stage]')) {
    const index = updateStageOrder.indexOf(item.dataset.updateStage);
    item.classList.remove('complete', 'current');
    if (completedAll || (activeIndex >= 0 && index < activeIndex)) item.classList.add('complete');
    if (!completedAll && index === activeIndex) item.classList.add('current');
  }

  if (status === 'running') {
    elements.updateTitle.textContent = t('update.updatingTitle', { version: targetVersion });
    elements.updateSummary.textContent = progressMessage || t('update.runningSummary');
    elements.updateBadge.textContent = t('update.updatingBadge');
    elements.updateBadge.className = 'badge badge-warning';
  } else if (status === 'rollback') {
    elements.updateTitle.textContent = t('update.rollbackTitle');
    elements.updateSummary.textContent = progressMessage || t('update.rollbackSummary');
    elements.updateBadge.textContent = t('update.rollbackBadge');
    elements.updateBadge.className = 'badge badge-error';
  } else if (status === 'failed') {
    elements.updateTitle.textContent = t('update.failedTitle');
    elements.updateSummary.textContent = progress.message || t('update.failedSummary');
    elements.updateBadge.textContent = t('update.failedBadge');
    elements.updateBadge.className = 'badge badge-error';
  } else if (status === 'completed') {
    elements.updateTitle.textContent = t('update.installedTitle', { version: targetVersion });
    elements.updateSummary.textContent = t('update.completedSummary');
    elements.updateBadge.textContent = t('update.updatedBadge');
    elements.updateBadge.className = 'badge badge-success';
  }
  updateButtons();
}

function startUpdateProgressPolling() {
  clearInterval(updateProgressTimer);
  updateProgressTimer = setInterval(() => {
    if (!document.hidden) refreshUpdate({ quiet: true });
  }, 800);
}

function stopUpdateProgressPolling() {
  clearInterval(updateProgressTimer);
  updateProgressTimer = null;
}

function renderUpdate(update) {
  currentUpdate = update;
  updateFailureMessage = null;
  elements.currentVersionMetric.textContent = update.currentVersion || t('state.unknown');
  elements.latestVersionMetric.textContent = update.latestVersion || t('state.unknown');
  if (update.supported === false) {
    elements.updateTitle.textContent = t(update.reason === 'source-checkout' ? 'update.sourceCheckoutTitle' : 'update.sourcePreviewTitle');
    elements.updateSummary.textContent = t(update.reason === 'source-checkout' ? 'update.sourceCheckoutSummary' : 'update.sourcePreviewSummary');
    elements.updateBadge.textContent = t('state.unavailable');
    elements.updateBadge.className = 'badge badge-neutral';
  } else if (update.updateAvailable) {
    elements.updateTitle.textContent = t('update.availableTitle', { version: update.latestVersion });
    elements.updateSummary.textContent = t('update.availableSummary');
    elements.updateBadge.textContent = t('update.availableBadge');
    elements.updateBadge.className = 'badge badge-warning';
  } else {
    elements.updateTitle.textContent = t('update.upToDateTitle');
    elements.updateSummary.textContent = t('update.upToDateSummary');
    elements.updateBadge.textContent = t('update.upToDateBadge');
    elements.updateBadge.className = 'badge badge-success';
  }
  updateButtons();
}

function renderUpdateFailure(message) {
  currentUpdate = null;
  updateFailureMessage = message;
  elements.updateTitle.textContent = t('update.unavailableTitle');
  elements.updateSummary.textContent = message;
  elements.currentVersionMetric.textContent = t('state.unknown');
  elements.latestVersionMetric.textContent = t('state.unknown');
  elements.updateBadge.textContent = t('state.unavailable');
  elements.updateBadge.className = 'badge badge-error';
  updateButtons();
}

async function refreshUpdate({ force = false, quiet = false } = {}) {
  try {
    const payload = await api(force ? '/api/update?refresh=1' : '/api/update');
    renderUpdate(payload.update);
    renderUpdateProgress(payload.updateProgress);
    if (payload.activity) renderActivity(payload.activity);
    if (payload.activeAction === 'update') {
      setBusy(true, `${labelState('update')}…`);
      if (!updateProgressTimer) startUpdateProgressPolling();
    }
  } catch (error) {
    if (currentUpdateProgress?.status === 'running' || currentUpdateProgress?.status === 'rollback') {
      elements.updateProgressLabel.textContent = t('update.waitingService');
    } else {
      renderUpdateFailure(error.message);
      if (!quiet) toast(error.message, 'error');
    }
  }
}

function renderTerminalScreen(eyebrowKey, titleKey, copyKey) {
  const main = document.createElement('main');
  main.className = 'shell';
  const section = document.createElement('section');
  section.className = 'panel';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = t(eyebrowKey);
  const title = document.createElement('h1');
  title.textContent = t(titleKey);
  const copy = document.createElement('p');
  copy.className = 'panel-copy';
  copy.textContent = t(copyKey);
  section.append(eyebrow, title, copy);
  main.append(section);
  document.body.replaceChildren(main);
}

async function applyUpdate() {
  if (actionInFlight || currentUpdate?.supported === false || !currentUpdate?.updateAvailable) return;
  const targetVersion = currentUpdate.latestVersion || t('update.latest');
  if (!window.confirm(t('update.confirm', { version: targetVersion }))) return;

  renderUpdateProgress({
    status: 'running',
    stage: 'starting',
    percent: 2,
    message: t('progress.starting'),
    targetVersion,
  });
  setBusy(true, `${labelState('update')}…`);
  startUpdateProgressPolling();
  try {
    const payload = await api('/api/update', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
    stopUpdateProgressPolling();
    clearInterval(pollTimer);
    clearInterval(workPollTimer);
    renderUpdateProgress(payload.updateProgress || {
      status: 'completed',
      stage: 'completed',
      percent: 100,
      message: t('progress.completed'),
      targetVersion,
    });
    toast(t('update.completedToast', { version: targetVersion }), 'success');
    renderTerminalScreen('terminal.updatedEyebrow', 'terminal.updatedTitle', 'terminal.updatedCopy');
  } catch (error) {
    stopUpdateProgressPolling();
    toast(error.message, 'error');
    setBusy(false);
    await refreshUpdate({ force: true, quiet: true });
    await refreshStatus({ quiet: true });
  }
}

function selectedUninstallMode() {
  return document.querySelector('input[name="uninstallMode"]:checked')?.value || 'KeepWorkspace';
}

function resetUninstallConfirmation() {
  const mode = selectedUninstallMode();
  elements.uninstallConfirm.checked = false;
  elements.destructivePhrase.value = '';
  elements.destructivePhraseBox.classList.toggle('hidden', mode !== 'RemoveEverything');
  uninstallPreviewState = { kind: 'idle', detail: null };
  elements.uninstallPreview.textContent = t('uninstall.defaultPreview');
  lastPreviewMode = null;
}

async function previewUninstall() {
  if (actionInFlight) return;
  const mode = selectedUninstallMode();
  setBusy(true, t('uninstall.previewing'));
  elements.previewUninstallButton.disabled = true;
  try {
    const payload = await api('/api/uninstall/preview', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    uninstallPreviewState = { kind: 'detail', detail: payload.detail || '' };
    elements.uninstallPreview.textContent = payload.detail || t('uninstall.defaultPreview');
    lastPreviewMode = mode;
    toast(t('uninstall.previewReady'), 'success');
  } catch (error) {
    uninstallPreviewState = { kind: 'detail', detail: error.message };
    elements.uninstallPreview.textContent = error.message;
    toast(error.message, 'error');
  } finally {
    elements.previewUninstallButton.disabled = false;
    setBusy(false);
  }
}

async function confirmUninstall() {
  if (actionInFlight) return;
  const mode = selectedUninstallMode();
  if (lastPreviewMode !== mode) {
    toast(t('uninstall.previewFirst'), 'error');
    return;
  }
  if (!elements.uninstallConfirm.checked) {
    toast(t('uninstall.confirmFirst'), 'error');
    return;
  }
  if (mode === 'RemoveEverything' && elements.destructivePhrase.value !== 'REMOVE WORKFORGE') {
    toast(t('uninstall.typePhrase'), 'error');
    return;
  }

  setBusy(true, t('uninstall.uninstalling'));
  elements.confirmUninstallButton.disabled = true;
  try {
    await api('/api/uninstall', {
      method: 'POST',
      body: JSON.stringify({
        mode,
        confirm: true,
        phrase: elements.destructivePhrase.value,
      }),
    });
    elements.uninstallDialog.close();
    toast(t('uninstall.completedToast'), 'success');
    clearInterval(pollTimer);
    clearInterval(workPollTimer);
    setTimeout(() => {
      renderTerminalScreen('uninstall.eyebrow', 'terminal.uninstallTitle', 'terminal.uninstallCopy');
    }, 800);
  } catch (error) {
    toast(error.message, 'error');
    elements.confirmUninstallButton.disabled = false;
    setBusy(false);
  }
}

async function closeControl() {
  elements.closeControlButton.disabled = true;
  try {
    await api('/api/shutdown', { method: 'POST', body: '{}' });
  } catch {
    // The server may close before the response reaches the browser.
  }
  clearInterval(pollTimer);
    clearInterval(workPollTimer);
  window.close();
  setTimeout(() => {
    renderTerminalScreen('brand.eyebrow', 'terminal.closedTitle', 'terminal.closedCopy');
  }, 300);
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage;
  document.title = t('app.title');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  }
  for (const button of elements.languageButtons) {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function setLanguage(language, { persist = true } = {}) {
  const normalized = normalizeLanguage(language);
  if (!normalized) return;
  currentLanguage = normalized;
  if (persist) {
    try {
      localStorage.setItem(languageStorageKey, language);
    } catch {
      // The language still changes for the current session.
    }
  }
  applyStaticTranslations();
  if (currentMeta) {
    elements.versionText.textContent = `WorkForge ${currentMeta.version}`;
    if (!currentStatus && !statusFailureMessage) {
      elements.profileChip.textContent = t('profile.value', { profile: currentMeta.profileId });
    }
  }
  if (currentStatus) renderStatus(currentStatus);
  else if (statusFailureMessage) renderStatusFailure(statusFailureMessage);
  else setChip('neutral', t('state.checking'));
  renderDoctorState();
  renderActivity(currentActivity);
  renderWork({ force: true });
  if (elements.taskDialog.open) renderTaskDetail();
  renderModeEvidence();
  if (currentUpdate) renderUpdate(currentUpdate);
  else if (updateFailureMessage) renderUpdateFailure(updateFailureMessage);
  if (currentUpdateProgress && currentUpdateProgress.status !== 'idle') renderUpdateProgress(currentUpdateProgress);
  if (!actionInFlight) setBusy(false);
  if (uninstallPreviewState.kind === 'idle') elements.uninstallPreview.textContent = t('uninstall.defaultPreview');
  else if (uninstallPreviewState.detail) elements.uninstallPreview.textContent = uninstallPreviewState.detail;
}

async function initialize() {
  setLanguage(currentLanguage, { persist: false });
  try {
    const meta = await api('/api/meta');
    currentMeta = meta;
    elements.profileChip.textContent = t('profile.value', { profile: meta.profileId });
    elements.versionText.textContent = `WorkForge ${meta.version}`;
    const removeEverything = document.querySelector('input[name="uninstallMode"][value="RemoveEverything"]');
    if (removeEverything && meta.capabilities?.removeEverything === false) {
      removeEverything.disabled = true;
      removeEverything.closest('.choice-card')?.classList.add('hidden');
    }
  } catch (error) {
    toast(error.message, 'error');
  }
  await Promise.all([refreshStatus({ quiet: true }), refreshWork(), refreshModeEvidence()]);
  await refreshUpdate({ quiet: true });
  pollTimer = setInterval(() => {
    if (!actionInFlight && !document.hidden) refreshStatus({ quiet: true });
  }, 5000);
  workPollTimer = setInterval(() => {
    if (!actionInFlight && !document.hidden) { refreshWork(); refreshModeEvidence(); }
  }, 30_000);
}

elements.startButton.addEventListener('click', () => runAction('start'));
elements.stopButton.addEventListener('click', () => runAction('stop'));
elements.refreshButton.addEventListener('click', () => { refreshStatus(); refreshWork({ force: true }); refreshModeEvidence(); });
elements.doctorButton.addEventListener('click', () => runAction('doctor'));
elements.checkUpdateButton.addEventListener('click', () => refreshUpdate({ force: true }));
elements.updateButton.addEventListener('click', applyUpdate);
elements.closeControlButton.addEventListener('click', closeControl);
for (const button of elements.languageButtons) {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
}

elements.openUninstallButton.addEventListener('click', () => {
  resetUninstallConfirmation();
  elements.uninstallDialog.showModal();
});
elements.previewUninstallButton.addEventListener('click', previewUninstall);
elements.confirmUninstallButton.addEventListener('click', confirmUninstall);
for (const radio of document.querySelectorAll('input[name="uninstallMode"]')) {
  radio.addEventListener('change', resetUninstallConfirmation);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !actionInFlight) { refreshStatus({ quiet: true }); refreshWork(); refreshModeEvidence(); }
});

// Alt+Shift chords avoid single-key shortcuts (WCAG 2.1.4) and browser Alt+letter bindings.
const hotkeyButtons = { KeyS: 'startButton', KeyX: 'stopButton', KeyR: 'refreshButton', KeyD: 'doctorButton' };
const hideHotkeys = () => document.body.classList.remove('hotkeys-visible');
document.addEventListener('keydown', (event) => {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
  document.body.classList.add('hotkeys-visible');
  const button = elements[hotkeyButtons[event.code]];
  if (!button || event.repeat || document.querySelector('dialog[open]')) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (!button.disabled) button.click();
});
document.addEventListener('keyup', (event) => { if (!event.altKey || !event.shiftKey) hideHotkeys(); });
window.addEventListener('blur', hideHotkeys);

initialize();
