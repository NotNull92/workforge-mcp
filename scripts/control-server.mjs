import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(scriptDirectory, '..');
const uiRoot = path.join(toolRoot, 'control-ui');
const packageJson = JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8'));
const version = String(packageJson.version);
const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
const system32Root = path.join(systemRoot, 'System32');
const powershellPath = path.join(system32Root, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const cmdPath = path.join(system32Root, 'cmd.exe');
const taskkillPath = path.join(system32Root, 'taskkill.exe');
const profileRegistrySetupMessage = 'WorkForge profile registry is missing. Run Setup.cmd to create a WorkForge profile.';

function readArgument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return value;
}

const profileId = readArgument('--profile', 'workstation');
if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(profileId)) {
  throw new Error('Invalid WorkForge profile id.');
}
const requestedPortText = readArgument('--port', '0');
if (!/^\d{1,5}$/.test(requestedPortText)) throw new Error('Invalid control port.');
const requestedPort = Number(requestedPortText);
if (requestedPort < 0 || requestedPort > 65535) throw new Error('Invalid control port.');
const noBrowser = process.argv.includes('--no-browser');
const testMode = process.env.WORKFORGE_CONTROL_TEST_MODE === '1';

// The control server never needs to retain the tunnel credential in its own process.
delete process.env.CONTROL_PLANE_API_KEY;
process.chdir(os.tmpdir());

const sessionToken = randomBytes(32).toString('base64url');
const cookieName = 'workforge_control_session';
const idleTimeoutMs = testMode ? 30_000 : 5 * 60_000;
const activity = [];
let lastRequestAt = Date.now();
let lastObservedState = null;
let shuttingDown = false;
let activeAction = null;
let cachedStatus = null;
let cachedStatusAt = 0;
let statusPromise = null;
let cachedUpdate = null;
let cachedUpdateAt = 0;
let updateProgress = {
  status: 'idle',
  stage: 'idle',
  percent: 0,
  message: '',
  targetVersion: null,
  startedAt: null,
  updatedAt: null,
};
const statusCacheMs = testMode ? 0 : 3000;
const updateCacheMs = testMode ? 0 : 5 * 60_000;

function recordActivity(kind, message) {
  activity.unshift({
    at: new Date().toISOString(),
    kind,
    message: sanitizeText(message),
  });
  if (activity.length > 30) activity.length = 30;
}

function setUpdateProgress({ status, stage, percent, message, targetVersion } = {}) {
  const now = new Date().toISOString();
  updateProgress = {
    ...updateProgress,
    ...(status ? { status: String(status) } : {}),
    ...(stage ? { stage: String(stage) } : {}),
    ...(Number.isFinite(percent) ? { percent: Math.max(0, Math.min(100, Math.round(percent))) } : {}),
    ...(message != null ? { message: sanitizeText(message) } : {}),
    ...(targetVersion !== undefined ? { targetVersion: targetVersion == null ? null : String(targetVersion) } : {}),
    startedAt: updateProgress.startedAt || now,
    updatedAt: now,
  };
}

function consumeUpdateProgressLine(line) {
  const prefix = 'WORKFORGE_UPDATE_PROGRESS ';
  if (!String(line).startsWith(prefix)) return false;
  try {
    const event = JSON.parse(String(line).slice(prefix.length));
    setUpdateProgress({
      status: event.stage === 'completed' ? 'completed' : event.stage === 'rollback' ? 'rollback' : 'running',
      stage: event.stage,
      percent: Number(event.percent),
      message: event.message,
    });
  } catch {
    setUpdateProgress({ status: 'running', message: 'WorkForge update is still running...' });
  }
  return true;
}

recordActivity('info', 'Control dashboard started.');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, character => `\\${character}`);
}

function replacePathIgnoreCase(text, value, replacement) {
  if (!value) return text;
  return text.replace(new RegExp(escapeRegExp(value), 'gi'), replacement);
}

function sanitizeText(value) {
  let text = String(value ?? '');
  const userProfile = process.env.USERPROFILE;
  text = replacePathIgnoreCase(text, userProfile, '%USERPROFILE%');
  text = replacePathIgnoreCase(text, toolRoot, '%WORKFORGE_ROOT%');
  text = text.replace(/\btunnel_[a-f0-9]{32}\b/gi, 'tunnel_<redacted>');
  text = text.replace(/\b(?:sk|rk)-(?:proj-)?[A-Za-z0-9_-]{16,}\b/gi, '<redacted-key>');
  text = text.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gi, '<redacted-token>');
  text = text.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, '<redacted-token>');
  text = text.replace(/(CONTROL_PLANE_API_KEY\s*=\s*)[^\s;]+/gi, '$1<redacted>');
  return text;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(header) {
  const output = new Map();
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    output.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return output;
}

function commonHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...commonHeaders('application/json; charset=utf-8'),
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function sendText(response, statusCode, body, contentType, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...commonHeaders(contentType),
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function requireLocalHost(request, response, expectedHost) {
  if (request.headers.host !== expectedHost) {
    sendJson(response, 421, { ok: false, error: 'Invalid local dashboard host.' });
    return false;
  }
  return true;
}

function requireSession(request, response) {
  const observed = parseCookies(request.headers.cookie).get(cookieName) || '';
  if (!safeEqual(observed, sessionToken)) {
    sendJson(response, 401, { ok: false, error: 'Dashboard session is not authorized.' });
    return false;
  }
  return true;
}

function requireMutationOrigin(request, response, expectedOrigin) {
  if (request.headers.origin !== expectedOrigin) {
    sendJson(response, 403, { ok: false, error: 'Cross-origin control request rejected.' });
    return false;
  }
  return true;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 8192) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON object expected.');
  }
  return value;
}

function controlEnvironment() {
  const environment = { ...process.env };
  delete environment.CONTROL_PLANE_API_KEY;
  delete environment.WORKFORGE_CONTROL_TEST_MODE;
  return environment;
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  const killer = spawn(taskkillPath, ['/pid', String(child.pid), '/t', '/f'], {
    cwd: os.tmpdir(),
    env: controlEnvironment(),
    windowsHide: true,
    shell: false,
    stdio: 'ignore',
  });
  killer.unref();
}

function runPowerShell(scriptName, argumentsList = [], timeoutMs = 90_000, options = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptDirectory, scriptName);
    const environment = controlEnvironment();

    const child = spawn(
      powershellPath,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...argumentsList],
      {
        cwd: os.tmpdir(),
        env: environment,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let stderrRemainder = '';
    const maxOutput = 512 * 1024;
    let overflow = false;
    const append = (current, chunk) => {
      if (current.length + chunk.length > maxOutput) {
        overflow = true;
        return current;
      }
      return current + chunk.toString('utf8');
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    const handleStderrLine = line => {
      if (typeof options.onStderrLine === 'function' && options.onStderrLine(line) === true) return;
      stderr = append(stderr, `${line}\n`);
    };
    child.stderr.on('data', chunk => {
      stderrRemainder += chunk.toString('utf8');
      const lines = stderrRemainder.split(/\r?\n/);
      stderrRemainder = lines.pop() || '';
      for (const line of lines) handleStderrLine(line);
    });

    const timer = setTimeout(() => {
      terminateProcessTree(child);
      reject(new Error(`${scriptName} timed out.`));
    }, timeoutMs);

    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (stderrRemainder) {
        handleStderrLine(stderrRemainder);
        stderrRemainder = '';
      }
      if (overflow) {
        reject(new Error(`${scriptName} produced too much output.`));
        return;
      }
      const cleanStdout = sanitizeText(stdout.trim());
      const cleanStderr = sanitizeText(stderr.trim());
      if (code !== 0) {
        const detail = cleanStderr || cleanStdout || `${scriptName} failed with exit code ${code}.`;
        reject(new Error(detail.slice(0, 12_000)));
        return;
      }
      resolve({ stdout: cleanStdout, stderr: cleanStderr, code });
    });
  });
}

function simplifyStatus(snapshot) {
  const running = Boolean(snapshot.running);
  const supervised = Boolean(snapshot.supervised);
  const healthState = snapshot.health ? 'healthy' : running ? 'unreachable' : 'offline';
  const readyState = snapshot.ready ? 'ready' : running ? 'not-ready' : 'offline';
  return {
    profileId: String(snapshot.profileId || profileId),
    running,
    processState: String(snapshot.processState || 'unknown'),
    desiredRunning: Boolean(snapshot.desiredRunning),
    stopRequested: Boolean(snapshot.stopRequested),
    healthState,
    readyState,
    supervised,
    supervisorState: String(snapshot.supervisorState || 'unknown'),
    recoveryState: snapshot.recoveryState == null ? null : String(snapshot.recoveryState),
    recoveryFailureCount: snapshot.recoveryFailureCount == null ? null : Number(snapshot.recoveryFailureCount),
    pid: snapshot.pid == null ? null : Number(snapshot.pid),
    supervisorPid: snapshot.supervisorPid == null ? null : Number(snapshot.supervisorPid),
    error: snapshot.error ? sanitizeText(snapshot.error) : null,
  };
}

function noteStatusTransition(status) {
  const key = `${status.running}|${status.healthState}|${status.readyState}|${status.supervised}|${status.recoveryState ?? ''}`;
  if (lastObservedState === null) {
    lastObservedState = key;
    recordActivity(status.running ? 'success' : 'info', status.running ? 'Tunnel is running.' : 'Tunnel is stopped.');
    return;
  }
  if (key !== lastObservedState) {
    lastObservedState = key;
    if (status.readyState === 'ready') recordActivity('success', 'Tunnel became ready.');
    else if (!status.running) recordActivity('info', 'Tunnel stopped.');
    else if (status.healthState !== 'healthy') recordActivity('warning', 'Tunnel health changed.');
    else recordActivity('info', 'Tunnel status changed.');
  }
}

async function getStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedStatus && now - cachedStatusAt < statusCacheMs) return cachedStatus;
  if (!force && statusPromise) return await statusPromise;

  const request = (async () => {
    let result;
    try {
      result = await runPowerShell('tunnel-status.ps1', ['-ProfileId', profileId, '-Snapshot'], 15_000);
    } catch (error) {
      if (error instanceof Error && error.message.includes(profileRegistrySetupMessage)) {
        throw new Error(profileRegistrySetupMessage);
      }
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(`Could not parse tunnel status: ${result.stdout.slice(0, 2000)}`);
    }
    const status = simplifyStatus(parsed);
    cachedStatus = status;
    cachedStatusAt = Date.now();
    noteStatusTransition(status);
    return status;
  })();

  if (!force) statusPromise = request;
  try {
    return await request;
  } finally {
    if (statusPromise === request) statusPromise = null;
  }
}

async function getUpdateStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedUpdate && now - cachedUpdateAt < updateCacheMs) return cachedUpdate;
  const result = await runPowerShell('Update.ps1', ['-Action', 'Check', '-Json'], 30_000);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Could not parse update status: ${result.stdout.slice(0, 2000)}`);
  }
  cachedUpdate = parsed;
  cachedUpdateAt = Date.now();
  return parsed;
}

async function performUpdate() {
  if (activeAction) throw new Error(`Another control action is already running: ${activeAction}.`);
  activeAction = 'update';
  updateProgress = {
    status: 'running',
    stage: 'starting',
    percent: 2,
    message: 'Starting the WorkForge update...',
    targetVersion: cachedUpdate?.latestVersion ? String(cachedUpdate.latestVersion) : null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    recordActivity('info', 'Downloading and validating the WorkForge update...');
    const result = await runPowerShell(
      'Update.ps1',
      ['-Action', 'Apply', '-Json', '-EmitProgress'],
      10 * 60_000,
      { onStderrLine: consumeUpdateProgressLine },
    );
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(`Could not parse update result: ${result.stdout.slice(0, 2000)}`);
    }
    if (parsed.updated) recordActivity('success', `Updated WorkForge to ${parsed.version}.`);
    else recordActivity('info', parsed.message || 'WorkForge is already up to date.');
    setUpdateProgress({
      status: 'completed',
      stage: 'completed',
      percent: 100,
      message: parsed.message || 'WorkForge update completed.',
      targetVersion: parsed.version || parsed.latestVersion || updateProgress.targetVersion,
    });
    return parsed;
  } catch (error) {
    setUpdateProgress({
      status: 'failed',
      percent: updateProgress.percent,
      message: error.message,
    });
    recordActivity('error', `update failed: ${error.message}`);
    throw error;
  } finally {
    activeAction = null;
  }
}

async function performAction(action) {
  if (activeAction) throw new Error(`Another control action is already running: ${activeAction}.`);
  activeAction = action;
  try {
    if (action === 'start') {
      recordActivity('info', 'Starting secure tunnel...');
      await runPowerShell('start-tunnel.ps1', ['-ProfileId', profileId]);
      recordActivity('success', 'Start command completed.');
    } else if (action === 'stop') {
      recordActivity('info', 'Stopping secure tunnel...');
      await runPowerShell('stop-tunnel.ps1', ['-ProfileId', profileId]);
      recordActivity('success', 'Stop command completed.');
    } else if (action === 'doctor') {
      recordActivity('info', 'Running Doctor...');
      const result = await runPowerShell('Doctor.ps1', ['-ProfileId', profileId, '-Online']);
      recordActivity('success', 'Doctor completed successfully.');
      return { detail: (result.stdout || 'Doctor completed successfully.').slice(-12_000) };
    } else {
      throw new Error(`Unsupported control action: ${action}.`);
    }
    return {};
  } catch (error) {
    recordActivity('error', `${action} failed: ${error.message}`);
    throw error;
  } finally {
    activeAction = null;
  }
}

async function previewUninstall(mode) {
  if (!['KeepWorkspace', 'RemoveEverything'].includes(mode)) throw new Error('Invalid uninstall mode.');
  if (activeAction) throw new Error(`Another control action is already running: ${activeAction}.`);
  activeAction = 'uninstall-preview';
  try {
    const args = ['-Mode', mode, '-ProfileId', profileId, '-NonInteractive', '-WhatIf', '-Plain', '-NoLog'];
    if (mode === 'RemoveEverything') args.push('-ConfirmFullRemoval');
    const result = await runPowerShell('Uninstall.ps1', args, 60_000);
    recordActivity('info', `Uninstall preview completed (${mode}).`);
    return (result.stdout || 'No changes would be made.').slice(-12_000);
  } finally {
    activeAction = null;
  }
}

async function performUninstall(mode, body) {
  if (!['KeepWorkspace', 'RemoveEverything'].includes(mode)) throw new Error('Invalid uninstall mode.');
  if (body.confirm !== true) throw new Error('Explicit uninstall confirmation is required.');
  if (mode === 'RemoveEverything' && body.phrase !== 'REMOVE WORKFORGE') {
    throw new Error('Type REMOVE WORKFORGE exactly to remove the workspace.');
  }
  if (activeAction) throw new Error(`Another control action is already running: ${activeAction}.`);
  activeAction = 'uninstall';
  try {
    const args = ['-Mode', mode, '-ProfileId', profileId, '-NonInteractive', '-Plain'];
    if (mode === 'RemoveEverything') args.push('-ConfirmFullRemoval');
    await runPowerShell('Uninstall.ps1', args, 120_000);
    recordActivity('success', `Uninstall completed (${mode}).`);
  } finally {
    activeAction = null;
  }
}

function closeControlServer(delayMs = 0) {
  shuttingDown = true;
  const close = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  if (delayMs > 0) setTimeout(close, delayMs).unref();
  else close();
}

async function serveStatic(pathname, response, setSession = false) {
  const files = new Map([
    ['/', [path.join(uiRoot, 'index.html'), 'text/html; charset=utf-8']],
    ['/app.js', [path.join(uiRoot, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/style.css', [path.join(uiRoot, 'style.css'), 'text/css; charset=utf-8']],
    ['/logo.png', [path.join(toolRoot, 'docs', 'logo', 'logo.png'), 'image/png']],
  ]);
  const entry = files.get(pathname);
  if (!entry) return false;
  const [filePath, contentType] = entry;
  const body = await readFile(filePath);
  const extraHeaders = setSession
    ? { 'Set-Cookie': `${cookieName}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800` }
    : {};
  sendText(response, 200, body, contentType, extraHeaders);
  return true;
}

const server = http.createServer(async (request, response) => {
  lastRequestAt = Date.now();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const expectedHost = `127.0.0.1:${port}`;
  const expectedOrigin = `http://${expectedHost}`;

  try {
    if (!requireLocalHost(request, response, expectedHost)) return;
    const url = new URL(request.url || '/', expectedOrigin);

    if (request.method === 'GET' && await serveStatic(url.pathname, response, url.pathname === '/')) return;

    if (!url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { ok: false, error: 'Not found.' });
      return;
    }
    if (!requireSession(request, response)) return;

    if (request.method === 'GET' && url.pathname === '/api/meta') {
      sendJson(response, 200, {
        ok: true,
        version,
        profileId,
        localOnly: true,
        activeAction,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      const status = await getStatus();
      sendJson(response, 200, { ok: true, status, activity, activeAction });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/update') {
      const useCachedUpdate = activeAction === 'update' || updateProgress.status === 'completed';
      const update = useCachedUpdate
        ? cachedUpdate || {
            supported: true,
            currentVersion: version,
            latestVersion: updateProgress.targetVersion,
            updateAvailable: true,
          }
        : await getUpdateStatus({ force: url.searchParams.get('refresh') === '1' });
      sendJson(response, 200, { ok: true, update, updateProgress, activity, activeAction });
      return;
    }

    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, POST' });
      return;
    }
    if (!requireMutationOrigin(request, response, expectedOrigin)) return;

    if (url.pathname === '/api/start' || url.pathname === '/api/stop' || url.pathname === '/api/doctor') {
      const action = url.pathname.slice('/api/'.length);
      const result = await performAction(action);
      const status = await getStatus({ force: true }).catch(error => ({ error: sanitizeText(error.message) }));
      sendJson(response, 200, { ok: true, action, ...result, status, activity });
      return;
    }

    if (url.pathname === '/api/update') {
      const body = await readJsonBody(request);
      if (body.confirm !== true) throw new Error('Explicit update confirmation is required.');
      const update = await performUpdate();
      sendJson(response, 200, { ok: true, update, updateProgress, message: update.message || 'WorkForge update completed.' });
      if (update.updated) {
        closeControlServer(900);
      }
      return;
    }

    if (url.pathname === '/api/uninstall/preview') {
      const body = await readJsonBody(request);
      const detail = await previewUninstall(String(body.mode || ''));
      sendJson(response, 200, { ok: true, detail });
      return;
    }

    if (url.pathname === '/api/uninstall') {
      const body = await readJsonBody(request);
      const mode = String(body.mode || '');
      await performUninstall(mode, body);
      sendJson(response, 200, { ok: true, message: 'Uninstall completed. WorkForge Control will now close.' });
      closeControlServer(700);
      return;
    }

    if (url.pathname === '/api/shutdown') {
      sendJson(response, 200, { ok: true, message: 'Control dashboard closed.' });
      closeControlServer(150);
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Unknown control endpoint.' });
  } catch (error) {
    const message = sanitizeText(error instanceof Error ? error.message : String(error));
    recordActivity('error', message);
    sendJson(response, 500, { ok: false, error: message.slice(0, 12_000), activity });
  }
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen({ host: '127.0.0.1', port: requestedPort, exclusive: true }, () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not resolve control dashboard address.');
  const url = `http://127.0.0.1:${address.port}/`;
  if (testMode) {
    process.stdout.write(`WORKFORGE_CONTROL_TEST_READY ${JSON.stringify({ port: address.port })}\n`);
  } else {
    process.stdout.write(`WorkForge Control ready at ${url}\n`);
  }
  if (!noBrowser) {
    const browser = spawn(cmdPath, ['/d', '/s', '/c', 'start', '', url], {
      detached: true,
      env: controlEnvironment(),
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    browser.unref();
  }
});

const idleTimer = setInterval(() => {
  if (!shuttingDown && !activeAction && Date.now() - lastRequestAt > idleTimeoutMs) {
    closeControlServer();
  }
}, 10_000);
idleTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    closeControlServer();
  });
}
