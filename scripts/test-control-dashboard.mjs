import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(scriptDirectory, '..');
const serverPath = path.join(scriptDirectory, 'control-server.mjs');
const htmlPath = path.join(toolRoot, 'control-ui', 'index.html');
const appPath = path.join(toolRoot, 'control-ui', 'app.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const htmlSource = await readFile(htmlPath, 'utf8');
const appSource = await readFile(appPath, 'utf8');
assert(htmlSource.includes('Start Tunnel'), 'Control dashboard is missing Start.');
assert(htmlSource.includes('Run Doctor'), 'Control dashboard is missing Doctor.');
assert(htmlSource.includes('Update WorkForge'), 'Control dashboard is missing update flow.');
assert(htmlSource.includes('updateProgressTrack'), 'Control dashboard is missing update progress semantics.');
assert(htmlSource.includes('data-update-stage="downloading"'), 'Control dashboard is missing update stage indicators.');
assert(htmlSource.includes('Remove WorkForge'), 'Control dashboard is missing uninstall flow.');
assert(htmlSource.includes('id="languageSwitch"'), 'Control dashboard is missing the language switch.');
assert(htmlSource.includes('id="taskRecords"') && htmlSource.includes('id="shellRecords"'), 'Work record lists are missing.');
assert(!/id="(?:taskRecords|shellRecords)"[^>]*aria-live/u.test(htmlSource), 'Entire work lists must not be live regions.');
for (const language of ['en', 'ko', 'ja', 'zh']) {
  assert(htmlSource.includes(`data-language="${language}"`), `Control dashboard is missing language option: ${language}`);
}
assert(appSource.includes("workforge-control-language"), 'Control dashboard does not persist the selected language.');
assert(appSource.includes('navigator.languages'), 'Control dashboard does not resolve an initial browser language.');
assert(appSource.includes("language.startsWith('ko')"), 'Control dashboard does not auto-detect Korean.');
assert(appSource.includes("language.startsWith('ja')"), 'Control dashboard does not auto-detect Japanese.');
assert(appSource.includes("language.startsWith('zh')"), 'Control dashboard does not auto-detect Chinese.');
assert(appSource.includes('document.documentElement.lang = currentLanguage'), 'Control dashboard does not update the document language.');
assert(appSource.includes("'brand.eyebrow': '대장간 · 로컬 상태'"), 'Control dashboard is missing Korean translations.');
assert(appSource.includes("'brand.eyebrow': '鍛冶場 · ローカル状態'"), 'Control dashboard is missing Japanese translations.');
assert(appSource.includes("'brand.eyebrow': '锻造坊 · 本地状态'"), 'Control dashboard is missing Chinese translations.');

const dictionaryStartMarker = 'const strings = ';
const dictionaryEndMarker = ';\n\nfunction normalizeLanguage';
const dictionaryStart = appSource.indexOf(dictionaryStartMarker);
const dictionaryEnd = appSource.indexOf(dictionaryEndMarker, dictionaryStart);
assert(dictionaryStart >= 0 && dictionaryEnd > dictionaryStart, 'Control dashboard translation dictionary could not be parsed.');
const dictionarySource = appSource.slice(dictionaryStart + dictionaryStartMarker.length, dictionaryEnd);
const dictionaries = vm.runInNewContext(`(${dictionarySource})`, Object.create(null), { timeout: 1000 });
const supportedLanguages = ['en', 'ko', 'ja', 'zh'];
const referenceKeys = Object.keys(dictionaries.en || {}).sort();
assert(referenceKeys.length > 0, 'English translation dictionary is empty.');
for (const language of supportedLanguages) {
  const observedKeys = Object.keys(dictionaries[language] || {}).sort();
  assert(
    JSON.stringify(observedKeys) === JSON.stringify(referenceKeys),
    `Control dashboard translation key set differs for language: ${language}`,
  );
}

const staticI18nKeys = new Set(
  [...htmlSource.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map(match => match[1]),
);
const runtimeI18nKeys = new Set(
  [...appSource.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]),
);
for (const key of new Set([...staticI18nKeys, ...runtimeI18nKeys])) {
  for (const language of supportedLanguages) {
    assert(Object.hasOwn(dictionaries[language], key), `Missing ${language} translation for key: ${key}`);
  }
}

// Exercise the real renderer with hostile text and stale data, without executing app startup actions.
function element() {
  return { children: [], textContent: '', append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; }, addEventListener() {},
    set innerHTML(_value) { throw new Error('Work renderer must not use HTML injection.'); } };
}
const renderElements = { workSummary: element(), taskRecords: element(), shellRecords: element() };
const renderContext = vm.createContext({ elements: renderElements, document: { createElement: element },
  Intl, Date, JSON, currentLanguage: 'en', workDataKey: '', workUnavailable: false,
  t: (key, values = {}) => String(dictionaries.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? ''),
  workSnapshot: { observedAt: '2026-01-01T00:00:00.000Z', partial: false,
    tasks: [{ taskId: 'example', title: '<img src=x onerror=alert(1)>', reportedStatus: 'completed', savedAt: '2026-01-01T00:00:00.000Z' }],
    jobs: [{ id: 'shell_example', cwd: '<script>unsafe</script>', status: 'ownership_lost', trackingState: 'ownership_lost',
      exitCode: null, updatedAt: '2026-01-01T00:00:00.000Z', stdoutBytes: 0, stderrBytes: 0 }] } });
for (const key of ['currentVersionMetric', 'latestVersionMetric', 'updateTitle', 'updateSummary', 'updateBadge',
  'startButton', 'stopButton', 'refreshButton', 'doctorButton', 'checkUpdateButton', 'updateButton', 'openUninstallButton']) {
  renderElements[key] = element();
}
Object.assign(renderContext, { currentStatus: null, currentUpdateProgress: null, currentMeta: { capabilities: { update: true } },
  currentUpdate: null, updateFailureMessage: null, actionInFlight: false });
vm.runInContext(appSource.slice(appSource.indexOf('function updateButtons('), appSource.indexOf('function setChip(')), renderContext);
vm.runInContext(appSource.slice(appSource.indexOf('function renderUpdate('), appSource.indexOf('function renderUpdateFailure(')), renderContext);
for (const language of supportedLanguages) {
  renderContext.t = key => dictionaries[language][key];
  vm.runInContext('renderUpdate({ supported: false, reason: "source-checkout", currentVersion: "9.8.7", updateAvailable: true })', renderContext);
  assert(renderElements.updateTitle.textContent === dictionaries[language]['update.sourceCheckoutTitle'], 'Source guidance title is missing.');
  assert(renderElements.updateSummary.textContent.includes('npm run build'), 'Source build guidance is missing.');
  assert(renderElements.updateBadge.className === 'badge badge-neutral', 'Source checkout was rendered as an error.');
  assert(renderElements.currentVersionMetric.textContent === '9.8.7' && renderElements.updateButton.disabled, 'Unsupported updates must preserve current version and disable Apply.');
}
renderContext.t = (key, values = {}) => String(dictionaries.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
vm.runInContext(appSource.slice(appSource.indexOf('function workTime('), appSource.indexOf('async function refreshWork(')), renderContext);
vm.runInContext('renderWork()', renderContext);
assert(renderElements.taskRecords.children[0].children[0].children[0].textContent === '<img src=x onerror=alert(1)>', 'Task title was not rendered as literal text.');
assert(renderElements.shellRecords.children[0].children[1].textContent.includes('No terminal record'), 'Unsealed execution was presented as running or complete.');
assert(renderElements.shellRecords.children[0].className.includes('mission-unsealed')
  && !/mission-(?:running|completed)/u.test(renderElements.shellRecords.children[0].className), 'Unsealed execution card used a running/completed style.');
assert(renderElements.taskRecords.children[0].className.includes('quest-completed')
  && renderElements.taskRecords.children[0].children[1].textContent.startsWith('Reported'), 'Reported completion lost its reported-state label.');
for (const key of ['S', 'X', 'R', 'D']) {
  assert(htmlSource.includes(`aria-keyshortcuts="Alt+Shift+${key}"`), `Hotkey Alt+Shift+${key} is not announced.`);
}
assert(appSource.includes("document.querySelector('dialog[open]')") && appSource.includes("closest('input, textarea, select"), 'Hotkeys can fire inside dialogs or text inputs.');
assert(/prefers-reduced-motion: reduce\)\s*\{[^}]*animation: none !important/u.test(await readFile(path.join(toolRoot, 'control-ui', 'style.css'), 'utf8')),
  'HUD motion is not disabled under prefers-reduced-motion.');
// Checkpoint detail dialog: literal rendering, reported-state framing, honest evidence, fixed error codes.
Object.assign(renderElements, { taskDialogTitle: element(), taskDialogStatus: element(), taskDialogBody: element() });
renderContext.strings = dictionaries;
vm.runInContext(appSource.slice(appSource.indexOf('let taskDetail = '), appSource.indexOf('async function openTaskDetail(')), renderContext);
const flatText = node => [node.textContent, ...(node.children || []).map(flatText)].join(' ');
// `taskDetail` is a script-level `let`, so assign it inside the context rather than as a global property.
const setTaskDetail = value => vm.runInContext(`taskDetail = ${JSON.stringify(value)}; renderTaskDetail()`, renderContext);
setTaskDetail({ id: 'example', code: null, payload: { observedAt: '2026-01-01T00:00:00.000Z',
  task: { taskId: 'example', savedAt: '2026-01-01T00:00:00.000Z', title: '<b>bold</b>', objective: '<script>x</script>',
    reportedStatus: 'completed', plan: ['step <i>one</i>'], completedSteps: [], blockers: [], nextAction: '',
    projectPath: '%USERPROFILE%\\work', relatedPaths: [] },
  evidence: [{ id: 'shell_a', available: true, status: 'ownership_lost', trackingState: 'ownership_lost', exitCode: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'shell_b', available: false }],
  evidenceSummary: { total: 2, completed: 0, failed: 0, cancelled: 0, unsealed: 1, unavailable: 1, latestUpdatedAt: null, latestStatus: null }, claim: null } });
const detailText = flatText(renderElements.taskDialogBody);
assert(renderElements.taskDialogTitle.textContent === '<b>bold</b>' && detailText.includes('<script>x</script>'), 'Checkpoint detail was not rendered as literal text.');
assert(renderElements.taskDialogStatus.textContent.includes('not verified execution') && detailText.includes('Reported complete'), 'Checkpoint detail lost its reported-state framing.');
assert(detailText.includes('No terminal record') && detailText.includes('Record unavailable') && !detailText.includes('Running'), 'Checkpoint evidence overstated execution state.');
setTaskDetail({ id: 'example', payload: null, code: 'not_found' });
assert(renderElements.taskDialogStatus.textContent === dictionaries.en['work.detail.error.not_found'], 'Detail error code was not localized.');
setTaskDetail({ id: 'example', payload: null, code: '<img>' });
// MCP mode badge: only running-session log evidence may name a mode.
renderElements.modeChip = element();
vm.runInContext(appSource.slice(appSource.indexOf('let modeEvidence = '), appSource.indexOf('async function refreshModeEvidence(')), renderContext);
const setMode = value => vm.runInContext(`modeEvidence = ${JSON.stringify(value)}; renderModeEvidence()`, renderContext);
setMode({ evidence: 'stale', toolMode: 'read_only', redaction: 'on', tools: 12, observedAt: '2026-01-01T00:00:00.000Z' });
assert(!/read-only|read_only/iu.test(renderElements.modeChip.textContent) && renderElements.modeChip.className.includes('chip-mode-stale'),
  'A stale mode record was presented as the current MCP mode.');
setMode({ evidence: 'log', toolMode: 'read_only', redaction: 'on', tools: 12, observedAt: '2026-01-01T00:00:00.000Z' });
assert(renderElements.modeChip.textContent.includes('read-only') && renderElements.modeChip.className.includes('chip-mode-ro'), 'Log evidence did not show the mode.');
assert(renderElements.modeChip.textContent.includes('12 tools'), 'Log evidence did not show the tool count.');
setMode({ evidence: 'log', toolMode: 'read_write', redaction: 'on', tools: null, observedAt: '2026-01-01T00:00:00.000Z' });
assert(!renderElements.modeChip.textContent.includes('tools'), 'A legacy record without a count must not invent one.');
setMode({ evidence: 'log', toolMode: '<img>', observedAt: '2026-01-01T00:00:00.000Z' });
assert(renderElements.modeChip.textContent === dictionaries.en['mode.unknown'], 'Unexpected mode values must fall back to unverified.');
setMode(null);
assert(renderElements.modeChip.textContent === dictionaries.en['mode.unknown'], 'Missing mode evidence must read as unverified.');
assert(renderElements.taskDialogStatus.textContent === dictionaries.en['work.detail.error.generic'], 'Unknown detail error codes must fall back to a fixed message.');
const retainedRow = renderElements.taskRecords.children[0];
vm.runInContext('workUnavailable = true; renderWork()', renderContext);
assert(renderElements.workSummary.textContent.includes('Refresh failed'), 'Stale records lack an explicit warning.');
assert(renderElements.taskRecords.children[0] === retainedRow, 'Unchanged records were unnecessarily rebuilt.');
// Claim chip: advisory owner label rendered literally, appended after the existing card structure.
const claimTask = owner => ({ taskId: 'claimed', title: 'Claimed task', reportedStatus: 'active', savedAt: '2026-01-01T00:00:00.000Z',
  claim: { owner, expiresAt: '2999-01-01T00:00:00.000Z', expired: false } });
vm.runInContext(`workUnavailable = false; workSnapshot = ${JSON.stringify({ observedAt: '2026-01-01T00:00:00.000Z', partial: false,
  tasks: [claimTask('<b>codex</b>'), { ...claimTask('old'), taskId: 'expired', claim: { owner: 'old', expiresAt: '2000-01-01T00:00:00.000Z', expired: false } },
    { ...claimTask('x'), taskId: 'free', claim: null }], jobs: [] })}; renderWork()`, renderContext);
const [claimedRow, expiredRow, freeRow] = renderElements.taskRecords.children;
const claimChip = claimedRow.children.at(-1);
assert(claimChip.className === 'work-claim' && claimChip.textContent.includes('<b>codex</b>') && claimChip.title.includes('does not lock'),
  'Active claim chip is missing, not literal, or implies a lock.');
assert(claimedRow.children[1].textContent.startsWith('Reported'), 'Claim chip displaced the reported-state label.');
assert(expiredRow.children.at(-1).className.includes('work-claim-expired'), 'A claim past expiresAt was shown as active.');
assert(!freeRow.children.some(child => String(child.className).includes('work-claim')), 'Unclaimed task showed a claim chip.');
// Point both platform adapters at an empty state root so the missing-profile assertions below
// hold on a developer machine that already has WorkForge installed.
const emptyStateRoot = mkdtempSync(path.join(os.tmpdir(), 'workforge-dashboard-test-'));

// Exercise the actual PowerShell adapter, including quoting, progress and exit codes.
if (process.platform === 'win32') {
  const serverSource = await readFile(serverPath, 'utf8');
  const powershellContext = vm.createContext({ spawn, path, os, Buffer, setTimeout, clearTimeout,
    scriptDirectory: emptyStateRoot,
    powershellPath: path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    controlEnvironment: () => process.env, sanitizeText: text => text,
    terminateProcessTree: child => child.kill() });
  vm.runInContext(serverSource.slice(serverSource.indexOf('function runChildScript('), serverSource.indexOf('function simplifyStatus(')), powershellContext);
  try {
    const fixtureName = "한글 ' output.ps1";
    await writeFile(path.join(emptyStateRoot, fixtureName), '\ufeff' + `param([string]$Value, [switch]$Fail, [switch]$Throw)
[Console]::Out.WriteLine($Value)
[Console]::Error.WriteLine('한글 오류')
[Console]::Error.WriteLine('WORKFORGE_UPDATE_PROGRESS {"message":"한글 진행"}')
if ($Throw) { throw '한글 예외' }
if ($Fail) { exit 7 }
`);
    const literal = '한글 "quoted" \' ; $(throw "injection")';
    const lines = [];
    const result = await powershellContext.runPowerShell(fixtureName, ['-Value', literal], 10_000,
      { onStderrLine: line => { lines.push(line); return line.startsWith('WORKFORGE_UPDATE_PROGRESS '); } });
    assert(result.stdout === literal && result.stderr === '한글 오류', 'PowerShell UTF-8 or literal argument roundtrip failed.');
    assert(lines.includes('WORKFORGE_UPDATE_PROGRESS {"message":"한글 진행"}'), 'UTF-8 update progress was lost.');
    for (const flag of ['-Fail', '-Throw']) {
      let failed = false;
      try { await powershellContext.runPowerShell(fixtureName, ['-Value', literal, flag]); }
      catch (error) {
        failed = error.message.includes(flag === '-Throw' ? '한글 예외' : '한글 오류');
        assert(!/CLIXML|_x000D_|&lt;/.test(error.message), 'PowerShell error contains serialized XML.');
      }
      assert(failed, `PowerShell ${flag} failure was lost or corrupted.`);
    }
    await writeFile(path.join(emptyStateRoot, 'write-error.ps1'), '\ufeff' + `Write-Progress -Activity x -PercentComplete 50\nWrite-Error '한글 <오류> & "따옴표"'\nexit 3`);
    let writeError = '';
    try { await powershellContext.runPowerShell('write-error.ps1'); } catch (error) { writeError = error.message; }
    assert(writeError.includes('한글 <오류> & "따옴표"') && writeError.includes('exit code 3') && !/CLIXML|_x000D_|&lt;/.test(writeError), 'PowerShell Write-Error was not decoded.');
    await writeFile(path.join(emptyStateRoot, 'warning.ps1'), '\ufeff' + "Write-Warning '한글 <경고> & 확인'");
    assert((await powershellContext.runPowerShell('warning.ps1')).stderr.includes('한글 <경고> & 확인'), 'PowerShell warning was not decoded.');
    await writeFile(path.join(emptyStateRoot, 'progress.ps1'), 'Write-Progress -Activity x -PercentComplete 50');
    assert((await powershellContext.runPowerShell('progress.ps1')).stderr === '', 'PowerShell progress leaked to stderr.');
    await writeFile(path.join(emptyStateRoot, 'exit.ps1'), 'exit 7');
    let exitMessage = '';
    try { await powershellContext.runPowerShell('exit.ps1'); } catch (error) { exitMessage = error.message; }
    assert(exitMessage.includes('exit code 7'), 'PowerShell exit code was not propagated.');
  } catch (error) {
    rmSync(emptyStateRoot, { recursive: true, force: true });
    throw error;
  }
}

const child = spawn(process.execPath, [serverPath, '--profile', 'missing-dashboard-test', '--no-browser', '--port', '0'], {
  cwd: toolRoot,
  env: {
    ...process.env,
    WORKFORGE_CONTROL_TEST_MODE: '1',
    WORKFORGE_MCP_PROFILE_REGISTRY: path.join(emptyStateRoot, 'profile_registry.json'),
    WORKFORGE_MACOS_STATE_ROOT: emptyStateRoot,
    WORKFORGE_PORTABLE_PROGRAMS_ROOT: path.join(emptyStateRoot, 'programs'),
    WORKFORGE_PORTABLE_STATE_ROOT: path.join(emptyStateRoot, 'state'),
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

async function waitForReady() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const line = stdout.split(/\r?\n/).find(value => value.startsWith('WORKFORGE_CONTROL_TEST_READY '));
    if (line) {
      return JSON.parse(line.slice('WORKFORGE_CONTROL_TEST_READY '.length));
    }
    if (child.exitCode !== null) throw new Error(`Control server exited early: ${stderr || stdout}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for control server. stdout=${stdout} stderr=${stderr}`);
}

function openUnfinishedControlRequest({ port, origin, cookie }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.write([
        'POST /api/start HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        `Origin: ${origin}`,
        `Cookie: ${cookie}`,
        'Content-Type: application/json',
        'Content-Length: 2',
        'Connection: keep-alive',
        '',
        '{',
      ].join('\r\n'));
      resolve(socket);
    });
  });
}

function requestWithHost({ port, host }) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/meta',
      headers: { Host: host },
    }, response => {
      response.resume();
      response.once('end', () => resolveRequest(response.statusCode));
    });
    request.once('error', rejectRequest);
    request.end();
  });
}

let port;
let unfinishedRequest;
try {
  const ready = await waitForReady();
  ({ port } = ready);
  assert(ready.address === '127.0.0.1', `Control server bound to ${ready.address}.`);
  const origin = `http://127.0.0.1:${port}`;

  const root = await fetch(`${origin}/`, { redirect: 'manual' });
  assert(root.status === 200, `Dashboard root returned ${root.status}.`);
  const cookieHeader = root.headers.get('set-cookie') || '';
  assert(cookieHeader.includes('workforge_control_session='), 'Dashboard root did not set a session cookie.');
  assert(cookieHeader.includes('HttpOnly'), 'Dashboard cookie is not HttpOnly.');
  assert(cookieHeader.includes('SameSite=Strict'), 'Dashboard cookie is not SameSite=Strict.');
  assert(root.headers.get('access-control-allow-origin') === null, 'Dashboard unexpectedly enabled CORS.');
  assert((root.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'Dashboard CSP is missing.');
  assert(root.headers.get('x-frame-options') === 'DENY', 'Dashboard must deny framing.');
  const cookie = cookieHeader.split(';', 1)[0];

  for (const [asset, expectedType] of [
    ['/style.css', 'text/css'],
    ['/app.js', 'text/javascript'],
    ['/logo.png', 'image/png'],
    // Every art file the page references must be served locally under CSP self.
    ...[...new Set(`${await readFile(htmlPath, 'utf8')}${await readFile(path.join(toolRoot, 'control-ui', 'style.css'), 'utf8')}`
      .match(/\/assets\/[\w-]+\.webp/g))].map(asset => [asset, 'image/webp']),
  ]) {
    const assetResponse = await fetch(`${origin}${asset}`);
    assert(assetResponse.status === 200, `${asset} returned ${assetResponse.status}.`);
    assert((assetResponse.headers.get('content-type') || '').startsWith(expectedType), `${asset} has the wrong content type.`);
  }

  const unauthorized = await fetch(`${origin}/api/meta`);
  assert(unauthorized.status === 401, `Unauthenticated API request returned ${unauthorized.status}.`);
  assert((await fetch(`${origin}/api/work`)).status === 401, 'Work records bypassed session authentication.');
  const wrongHostStatus = await requestWithHost({ port, host: 'example.invalid' });
  assert(wrongHostStatus === 421, `Unexpected Host returned ${wrongHostStatus}.`);

  const meta = await fetch(`${origin}/api/meta`, { headers: { Cookie: cookie } });
  assert(meta.status === 200, `Authenticated meta request returned ${meta.status}.`);
  const metaJson = await meta.json();
  assert(metaJson.localOnly === true, 'Dashboard meta does not report local-only mode.');
  assert(metaJson.profileId === 'missing-dashboard-test', 'Dashboard profile id changed unexpectedly.');
  assert(metaJson.platform === (process.platform === 'darwin' ? 'macos' : 'windows'), 'Dashboard platform metadata is incorrect.');
  assert(typeof metaJson.capabilities?.update === 'boolean', 'Dashboard capabilities are missing update support.');
  assert(typeof metaJson.capabilities?.removeEverything === 'boolean', 'Dashboard capabilities are missing destructive uninstall support.');

  const updateResponse = await fetch(`${origin}/api/update`, { headers: { Cookie: cookie } });
  const updatePayload = await updateResponse.json();
  assert(updateResponse.status === 200 && updatePayload.update.supported === false, 'Source update check must succeed as unsupported.');
  assert(updatePayload.update.reason === (process.platform === 'darwin' ? 'source-preview' : 'source-checkout'), 'Incorrect source update reason.');
  assert(updatePayload.update.currentVersion === JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8')).version, 'Source version differs from the running engine.');
  const blockedUpdate = await fetch(`${origin}/api/update`, {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{"confirm":true}',
  });
  assert(blockedUpdate.status === 500 && /source/.test((await blockedUpdate.json()).error), 'Source Apply was not blocked by the server.');

  const statusFailure = await fetch(`${origin}/api/status`, { headers: { Cookie: cookie } });
  assert(statusFailure.status === 500, `Missing-profile status returned ${statusFailure.status}.`);
  const statusFailureText = await statusFailure.text();
  const statusFailureJson = JSON.parse(statusFailureText);
  const expectedSetupMessage = process.platform === 'darwin'
    ? 'WorkForge macOS profile is missing. Run npm run setup:macos to create it.'
    : 'WorkForge profile registry is missing. Run Setup.cmd to create a WorkForge profile.';
  assert(
    statusFailureJson.error === expectedSetupMessage,
    'Missing-profile status did not explain how to set up WorkForge.',
  );
  if (process.env.USERPROFILE) {
    assert(!statusFailureText.toLowerCase().includes(process.env.USERPROFILE.toLowerCase()), 'Dashboard error leaked the literal user profile path.');
  }
  assert(!statusFailureText.includes('CONTROL_PLANE_API_KEY='), 'Dashboard error leaked credential-shaped content.');

  const unavailableWork = await fetch(`${origin}/api/work`, { headers: { Cookie: cookie } });
  assert(unavailableWork.status === 200, 'Unavailable work must not enter the common 500/log path.');
  assert((await unavailableWork.json()).available === false, 'Missing profile unexpectedly returned work records.');
  const profileRoot = path.join(emptyStateRoot, 'workspace');
  const configRoot = path.join(profileRoot, 'tools', 'workforge-mcp');
  await mkdir(configRoot, { recursive: true });
  await writeFile(path.join(profileRoot, 'marker'), 'dashboard-fixture');
  const profile = { id: 'missing-dashboard-test', displayName: 'Dashboard Fixture', appName: 'Dashboard Fixture',
    serverName: 'dashboard-fixture', defaultWorkingDirectoryRelative: '.', bootstrapFiles: [],
    identityMarkers: [{ relativePath: 'marker', expectedLiteral: 'dashboard-fixture' }] };
  const rawProfile = JSON.stringify(profile);
  const profilePath = path.join(configRoot, 'profile.json');
  await writeFile(profilePath, rawProfile);
  const registryPath = path.join(emptyStateRoot, 'profile_registry.json');
  await writeFile(registryPath, JSON.stringify({ version: 1, profiles: [{ id: profile.id, profilePath,
    profileSha256: createHash('sha256').update(rawProfile).digest('hex') }] }));
  if (process.platform === 'darwin') {
    await writeFile(path.join(emptyStateRoot, 'current.json'), JSON.stringify({ engineRoot: toolRoot, registryPath, nodePath: process.execPath }));
  }
  const { loadProjectProfile } = await import('../dist/profile.js');
  const { saveTaskCheckpoint } = await import('../dist/tasks.js');
  const fixtureContext = await loadProjectProfile(profile.id, { registryPath });
  await saveTaskCheckpoint({ context: fixtureContext, taskId: 'example', expectedSha256: 'absent',
    state: { title: '<img src=x onerror=alert(1)>', objective: 'Fixture only', reportedStatus: 'completed',
      plan: [], completedSteps: [], blockers: [], nextAction: '', projectPath: profileRoot, relatedPaths: [], shellJobIds: [] } });
  const taskPath = path.join(profileRoot, 'artifacts', 'workforge-mcp', 'tasks', 'example.json');
  const edited = JSON.parse(await readFile(taskPath, 'utf8'));
  const syntheticToken = 'ghp_' + 'x'.repeat(36);
  edited.state.title = syntheticToken;
  await writeFile(taskPath, JSON.stringify(edited));
  const shellId = 'shell_' + 'a'.repeat(32);
  const shellRoot = path.join(profileRoot, 'artifacts', 'workforge-mcp', 'shell', shellId);
  await mkdir(shellRoot, { recursive: true });
  await writeFile(path.join(shellRoot, 'started.json'), JSON.stringify({ version: 1, kind: 'connection_owned_shell',
    executionMode: 'connection_owned', id: shellId, profileId: profile.id, status: 'running', cwd: profileRoot,
    leaseScope: `profile:${profile.id}:shell`, processId: null, leaseAcquired: false, containmentEnforced: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', exitCode: null, signal: null,
    timedOut: false, cancelRequested: false, timeoutMs: 1000, commandUtf8Bytes: 0, stdoutBytes: 0, stderrBytes: 0,
    stdoutTruncated: false, stderrTruncated: false, inputSha256: 'a'.repeat(64), stdoutSha256: null, stderrSha256: null,
    replayAllowed: false }));
  const workResponse = await fetch(`${origin}/api/work?refresh=1`, { headers: { Cookie: cookie } });
  const work = await workResponse.json();
  assert(work.available === true && work.toolMode === 'unknown', 'Work snapshot availability/mode is incorrect.');
  assert(work.tasks[0]?.reportedStatus === 'completed', 'Reported completion was lost.');
  assert(work.jobs[0]?.status === 'ownership_lost', 'Unsealed execution was inferred to be running.');
  assert(!JSON.stringify(work).includes(syntheticToken), 'Work endpoint leaked a synthetic token.');
  assert(!('objective' in work.tasks[0]) && !('command' in work.jobs[0]), 'Work endpoint exposed full task/command content.');

  const missingOrigin = await fetch(`${origin}/api/shutdown`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(missingOrigin.status === 403, `POST without Origin returned ${missingOrigin.status}.`);

  const wrongOrigin = await fetch(`${origin}/api/shutdown`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://example.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(wrongOrigin.status === 403, `Cross-origin POST returned ${wrongOrigin.status}.`);

  const unconfirmedUpdate = await fetch(`${origin}/api/update`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: '{"confirm":false}',
  });
  assert(unconfirmedUpdate.status === 500, `Unconfirmed update returned ${unconfirmedUpdate.status}.`);
  const unconfirmedUpdateJson = await unconfirmedUpdate.json();
  assert(
    unconfirmedUpdateJson.error === 'Explicit update confirmation is required.',
    'Update endpoint did not enforce explicit confirmation.',
  );

  unfinishedRequest = await openUnfinishedControlRequest({ port, origin, cookie });

  const shutdown = await fetch(`${origin}/api/shutdown`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(shutdown.status === 200, `Authorized shutdown returned ${shutdown.status}.`);

  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Control server did not exit after shutdown.')), 5000);
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert(exitCode === 0, `Control server did not stop with an unfinished dashboard request. stderr=${stderr}`);
} finally {
  unfinishedRequest?.destroy();
  if (child.exitCode === null) child.kill();
  rmSync(emptyStateRoot, { recursive: true, force: true });
}

console.log('CONTROL_DASHBOARD_TEST_OK');
