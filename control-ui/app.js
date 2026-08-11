const elements = {
  profileChip: document.querySelector('#profileChip'),
  connectionChip: document.querySelector('#connectionChip'),
  heroStatus: document.querySelector('#heroStatus'),
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
  activityList: document.querySelector('#activityList'),
  busyBadge: document.querySelector('#busyBadge'),
  versionText: document.querySelector('#versionText'),
  closeControlButton: document.querySelector('#closeControlButton'),
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

let currentStatus = null;
let currentUpdate = null;
let currentUpdateProgress = null;
let pollTimer = null;
let updateProgressTimer = null;
let toastTimer = null;
let actionInFlight = false;
let lastPreviewMode = null;

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
    payload = { ok: false, error: `Unexpected response (${response.status}).` };
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function setBusy(active, label = 'Idle') {
  actionInFlight = active;
  elements.busyBadge.textContent = active ? label : 'Idle';
  elements.busyBadge.className = active ? 'badge badge-warning' : 'badge badge-neutral';
  updateButtons();
}

function updateButtons() {
  const running = Boolean(currentStatus?.running);
  const updating = currentUpdateProgress?.status === 'running' || currentUpdateProgress?.status === 'rollback';
  elements.startButton.disabled = actionInFlight || updating || running;
  elements.stopButton.disabled = actionInFlight || updating || !running;
  elements.refreshButton.disabled = actionInFlight || updating;
  elements.doctorButton.disabled = actionInFlight || updating;
  elements.checkUpdateButton.disabled = actionInFlight || updating;
  elements.updateButton.disabled = actionInFlight || updating || !currentUpdate?.updateAvailable;
  elements.openUninstallButton.disabled = actionInFlight || updating;
}

function labelState(value) {
  return String(value || 'unknown')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
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

function renderStatus(status) {
  currentStatus = status;
  elements.profileChip.textContent = `profile: ${status.profileId || 'unknown'}`;

  if (!status.running) {
    setChip('offline', 'Offline');
    elements.heroStatus.className = 'status-orb status-offline';
    elements.tunnelTitle.textContent = 'Tunnel is stopped';
    elements.tunnelSummary.textContent = 'ChatGPT cannot reach WorkForge until the secure tunnel is started.';
  } else if (status.readyState === 'ready' && status.healthState === 'healthy') {
    setChip('online', 'Online');
    elements.heroStatus.className = 'status-orb status-online';
    elements.tunnelTitle.textContent = 'WorkForge is ready';
    elements.tunnelSummary.textContent = 'The secure tunnel is healthy and ready for ChatGPT connections.';
  } else {
    setChip('warning', 'Attention');
    elements.heroStatus.className = 'status-orb status-warning';
    elements.tunnelTitle.textContent = 'Tunnel needs attention';
    elements.tunnelSummary.textContent = status.error || 'The process is running, but health or readiness is not fully green yet.';
  }

  elements.healthMetric.textContent = labelState(status.healthState);
  elements.readyMetric.textContent = labelState(status.readyState);
  elements.supervisorMetric.textContent = status.supervised ? 'Running' : labelState(status.supervisorState);
  elements.recoveryMetric.textContent = status.recoveryState ? labelState(status.recoveryState) : 'Normal';

  setCheck(elements.profileCheck, 'check-good', '✓ Ready');
  setCheck(
    elements.processCheck,
    status.running ? 'check-good' : 'check-warn',
    status.running ? '✓ Running' : '○ Stopped',
  );
  setCheck(
    elements.supervisorCheck,
    status.supervised ? 'check-good' : 'check-warn',
    status.supervised ? '✓ Running' : '△ Not running',
  );
  setCheck(
    elements.readyCheck,
    status.readyState === 'ready' ? 'check-good' : status.running ? 'check-warn' : 'check-bad',
    status.readyState === 'ready' ? '✓ Ready' : status.running ? '△ Waiting' : '× Offline',
  );

  updateButtons();
}

function renderStatusFailure(message) {
  currentStatus = null;
  setChip('offline', 'Unavailable');
  elements.heroStatus.className = 'status-orb status-offline';
  elements.tunnelTitle.textContent = 'WorkForge status is unavailable';
  elements.tunnelSummary.textContent = message;
  elements.healthMetric.textContent = 'Unknown';
  elements.readyMetric.textContent = 'Unknown';
  elements.supervisorMetric.textContent = 'Unknown';
  elements.recoveryMetric.textContent = 'Unknown';
  setCheck(elements.profileCheck, 'check-bad', '× Check setup');
  setCheck(elements.processCheck, 'check-bad', '× Unknown');
  setCheck(elements.supervisorCheck, 'check-bad', '× Unknown');
  setCheck(elements.readyCheck, 'check-bad', '× Unknown');
  updateButtons();
}

function renderActivity(items = []) {
  elements.activityList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No dashboard activity yet.';
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
    message.textContent = item.message || 'Activity';

    const time = document.createElement('time');
    time.className = 'activity-time';
    const date = new Date(item.at);
    time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    row.append(marker, message, time);
    elements.activityList.append(row);
  }
}

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
      elements.doctorBadge.textContent = 'Healthy';
      elements.doctorBadge.className = 'badge badge-success';
      elements.doctorOutput.textContent = payload.detail || 'Doctor completed successfully.';
      toast('Doctor completed successfully.', 'success');
    } else {
      toast(`${labelState(action)} completed.`, 'success');
    }
  } catch (error) {
    if (action === 'doctor') {
      elements.doctorBadge.textContent = 'Needs attention';
      elements.doctorBadge.className = 'badge badge-error';
      elements.doctorOutput.textContent = error.message;
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
  const targetVersion = progress.targetVersion || currentUpdate?.latestVersion || 'the latest version';
  elements.updateProgress.className = `update-progress ${status}`;
  elements.updateProgressLabel.textContent = progress.message || 'WorkForge update is running...';
  elements.updateProgressPercent.textContent = `${percent}%`;
  elements.updateProgressTrack.setAttribute('aria-valuenow', String(percent));
  elements.updateProgressBar.style.width = `${percent}%`;

  const activeIndex = updateStageOrder.indexOf(stage);
  const completedAll = status === 'completed';
  for (const item of elements.updateStageList.querySelectorAll('[data-update-stage]')) {
    const index = updateStageOrder.indexOf(item.dataset.updateStage);
    item.className = '';
    if (completedAll || (activeIndex >= 0 && index < activeIndex)) item.classList.add('complete');
    if (!completedAll && index === activeIndex) item.classList.add('current');
  }

  if (status === 'running') {
    elements.updateTitle.textContent = `Updating WorkForge to ${targetVersion}...`;
    elements.updateSummary.textContent = progress.message || 'The update is running. Keep this Control window open.';
    elements.updateBadge.textContent = 'Updating';
    elements.updateBadge.className = 'badge badge-warning';
  } else if (status === 'rollback') {
    elements.updateTitle.textContent = 'Restoring the previous WorkForge version...';
    elements.updateSummary.textContent = progress.message || 'Update validation failed. WorkForge is rolling back safely.';
    elements.updateBadge.textContent = 'Rolling back';
    elements.updateBadge.className = 'badge badge-error';
  } else if (status === 'failed') {
    elements.updateTitle.textContent = 'WorkForge update failed';
    elements.updateSummary.textContent = progress.message || 'The update did not complete. Review Recent Activity and retry when ready.';
    elements.updateBadge.textContent = 'Update failed';
    elements.updateBadge.className = 'badge badge-error';
  } else if (status === 'completed') {
    elements.updateTitle.textContent = `WorkForge ${targetVersion} installed`;
    elements.updateSummary.textContent = progress.message || 'The update completed successfully.';
    elements.updateBadge.textContent = 'Updated';
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
  elements.currentVersionMetric.textContent = update.currentVersion || 'Unknown';
  elements.latestVersionMetric.textContent = update.latestVersion || 'Unknown';
  if (update.updateAvailable) {
    elements.updateTitle.textContent = `WorkForge ${update.latestVersion} is available`;
    elements.updateSummary.textContent = 'The update is downloaded from the canonical GitHub release, SHA-256 verified, staged side-by-side, then activated only after integrity checks. Running tunnels are rebound and restarted automatically.';
    elements.updateBadge.textContent = 'Update available';
    elements.updateBadge.className = 'badge badge-warning';
  } else {
    elements.updateTitle.textContent = 'WorkForge is up to date';
    elements.updateSummary.textContent = 'No newer stable WorkForge release is currently available.';
    elements.updateBadge.textContent = 'Up to date';
    elements.updateBadge.className = 'badge badge-success';
  }
  updateButtons();
}

function renderUpdateFailure(message) {
  currentUpdate = null;
  elements.updateTitle.textContent = 'Could not check for updates';
  elements.updateSummary.textContent = message;
  elements.currentVersionMetric.textContent = 'Unknown';
  elements.latestVersionMetric.textContent = 'Unknown';
  elements.updateBadge.textContent = 'Unavailable';
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
      setBusy(true, 'Updating…');
      if (!updateProgressTimer) startUpdateProgressPolling();
    }
  } catch (error) {
    if (currentUpdateProgress?.status === 'running' || currentUpdateProgress?.status === 'rollback') {
      elements.updateProgressLabel.textContent = 'Waiting for the local update service...';
    } else {
      renderUpdateFailure(error.message);
      if (!quiet) toast(error.message, 'error');
    }
  }
}

async function applyUpdate() {
  if (actionInFlight || !currentUpdate?.updateAvailable) return;
  const targetVersion = currentUpdate.latestVersion || 'the latest version';
  if (!window.confirm(`Update WorkForge to ${targetVersion}? Running WorkForge tunnels will be restarted automatically. If validation fails, WorkForge will roll back to the current engine.`)) return;

  renderUpdateProgress({
    status: 'running',
    stage: 'starting',
    percent: 2,
    message: 'Starting the WorkForge update...',
    targetVersion,
  });
  setBusy(true, 'Updating…');
  startUpdateProgressPolling();
  try {
    const payload = await api('/api/update', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
    stopUpdateProgressPolling();
    clearInterval(pollTimer);
    renderUpdateProgress(payload.updateProgress || {
      status: 'completed',
      stage: 'completed',
      percent: 100,
      message: payload.message || 'WorkForge update completed.',
      targetVersion,
    });
    toast(payload.message || 'WorkForge update completed.', 'success');
    document.body.innerHTML = '<main class="shell"><section class="panel"><p class="eyebrow">WORKFORGE UPDATED</p><h1>Update completed</h1><p class="panel-copy">Open WorkForge Control again to use the new engine and dashboard.</p></section></main>';
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
  elements.uninstallPreview.textContent = 'Run the preview before removing anything.';
  lastPreviewMode = null;
}

async function previewUninstall() {
  if (actionInFlight) return;
  const mode = selectedUninstallMode();
  setBusy(true, 'Previewing uninstall…');
  elements.previewUninstallButton.disabled = true;
  try {
    const payload = await api('/api/uninstall/preview', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    elements.uninstallPreview.textContent = payload.detail || 'Preview completed.';
    lastPreviewMode = mode;
    toast('Uninstall preview is ready.', 'success');
  } catch (error) {
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
    toast('Run the preview for the selected removal mode first.', 'error');
    return;
  }
  if (!elements.uninstallConfirm.checked) {
    toast('Review the preview and check the confirmation box first.', 'error');
    return;
  }
  if (mode === 'RemoveEverything' && elements.destructivePhrase.value !== 'REMOVE WORKFORGE') {
    toast('Type REMOVE WORKFORGE exactly.', 'error');
    return;
  }

  setBusy(true, 'Uninstalling…');
  elements.confirmUninstallButton.disabled = true;
  try {
    const payload = await api('/api/uninstall', {
      method: 'POST',
      body: JSON.stringify({
        mode,
        confirm: true,
        phrase: elements.destructivePhrase.value,
      }),
    });
    elements.uninstallDialog.close();
    toast(payload.message || 'Uninstall completed.', 'success');
    clearInterval(pollTimer);
    setTimeout(() => {
      document.body.innerHTML = '<main class="shell"><section class="panel"><p class="eyebrow">WORKFORGE</p><h1>Uninstall completed</h1><p class="panel-copy">This local Control session has closed. You can close this browser tab.</p></section></main>';
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
  window.close();
  setTimeout(() => {
    document.body.innerHTML = '<main class="shell"><section class="panel"><p class="eyebrow">WORKFORGE</p><h1>Control closed</h1><p class="panel-copy">The local dashboard server has stopped. You can close this tab.</p></section></main>';
  }, 300);
}

async function initialize() {
  try {
    const meta = await api('/api/meta');
    elements.profileChip.textContent = `profile: ${meta.profileId}`;
    elements.versionText.textContent = `WorkForge ${meta.version}`;
  } catch (error) {
    toast(error.message, 'error');
  }
  await refreshStatus({ quiet: true });
  await refreshUpdate({ quiet: true });
  pollTimer = setInterval(() => {
    if (!actionInFlight && !document.hidden) refreshStatus({ quiet: true });
  }, 5000);
}

elements.startButton.addEventListener('click', () => runAction('start'));
elements.stopButton.addEventListener('click', () => runAction('stop'));
elements.refreshButton.addEventListener('click', () => refreshStatus());
elements.doctorButton.addEventListener('click', () => runAction('doctor'));
elements.checkUpdateButton.addEventListener('click', () => refreshUpdate({ force: true }));
elements.updateButton.addEventListener('click', applyUpdate);
elements.closeControlButton.addEventListener('click', closeControl);

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
  if (!document.hidden && !actionInFlight) refreshStatus({ quiet: true });
});

initialize();
