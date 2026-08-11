import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(scriptDirectory, '..');
const serverPath = path.join(scriptDirectory, 'control-server.mjs');
const htmlPath = path.join(toolRoot, 'control-ui', 'index.html');
const appPath = path.join(toolRoot, 'control-ui', 'app.js');
const macLauncherPath = path.join(toolRoot, 'scripts', 'macos', 'launch-control.mjs');
const macCommandPath = path.join(toolRoot, 'WorkForge Control.command');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const serverSource = await readFile(serverPath, 'utf8');
const htmlSource = await readFile(htmlPath, 'utf8');
const appSource = await readFile(appPath, 'utf8');
const macLauncherSource = await readFile(macLauncherPath, 'utf8');
const macCommandSource = await readFile(macCommandPath, 'utf8');

assert(serverSource.includes("host: '127.0.0.1'"), 'Control dashboard must bind to 127.0.0.1 only.');
assert(!serverSource.includes('0.0.0.0'), 'Control dashboard must never bind to 0.0.0.0.');
assert(!serverSource.includes('Access-Control-Allow-Origin'), 'Control dashboard must not enable CORS.');
assert(serverSource.includes('HttpOnly; SameSite=Strict'), 'Control dashboard session cookie is not hardened.');
assert(serverSource.includes('request.headers.origin !== expectedOrigin'), 'Mutating requests must verify Origin.');
assert(serverSource.includes('request.headers.host !== expectedHost'), 'Control dashboard must verify Host.');
assert(serverSource.includes("path.join(system32Root, 'WindowsPowerShell', 'v1.0', 'powershell.exe')"), 'Control dashboard must use the System32 PowerShell path.');
assert(serverSource.includes("path.join(system32Root, 'cmd.exe')"), 'Control dashboard must use the System32 cmd path.');
assert(serverSource.includes("path.join(system32Root, 'taskkill.exe')"), 'Control dashboard must use the System32 taskkill path.');
assert(serverSource.includes('terminateProcessTree(child)'), 'Control dashboard timeouts must terminate the child process tree.');
assert(!serverSource.includes("spawn('powershell.exe'"), 'Control dashboard must not resolve PowerShell through the working directory or PATH.');
assert(!serverSource.includes("spawn('cmd.exe'"), 'Control dashboard must not resolve cmd through the working directory or PATH.');
assert(serverSource.includes("process.platform === 'darwin'"), 'Control dashboard is missing the macOS platform adapter.');
assert(serverSource.includes("spawn('/usr/bin/open'"), 'macOS Control must open the browser through /usr/bin/open.');
assert(serverSource.includes("runMacOSScript('start-tunnel.mjs'"), 'macOS Control is missing tunnel start.');
assert(serverSource.includes("runMacOSScript('stop-tunnel.mjs'"), 'macOS Control is missing tunnel stop.');
assert(serverSource.includes("runMacOSScript('doctor.mjs'"), 'macOS Control is missing online Doctor.');
assert(macLauncherSource.includes('scrubControlPlaneEnvironment'), 'macOS Control launcher must scrub the tunnel credential.');
assert(macLauncherSource.includes('installation.engineRoot !== toolRoot'), 'macOS Control launcher must reject a stale engine root.');
assert(macCommandSource.includes('/usr/bin/plutil'), 'macOS Control command must resolve the recorded Node.js runtime without shell JSON parsing.');
assert(htmlSource.includes('Start Tunnel'), 'Control dashboard is missing Start.');
assert(htmlSource.includes('Run Doctor'), 'Control dashboard is missing Doctor.');
assert(htmlSource.includes('Update WorkForge'), 'Control dashboard is missing update flow.');
assert(htmlSource.includes('updateProgressTrack'), 'Control dashboard is missing update progress semantics.');
assert(htmlSource.includes('data-update-stage="downloading"'), 'Control dashboard is missing update stage indicators.');
assert(htmlSource.includes('Remove WorkForge'), 'Control dashboard is missing uninstall flow.');
assert(htmlSource.includes('id="languageSwitch"'), 'Control dashboard is missing the language switch.');
for (const language of ['en', 'ko', 'ja', 'zh']) {
  assert(htmlSource.includes(`data-language="${language}"`), `Control dashboard is missing language option: ${language}`);
}
assert(appSource.includes("workforge-control-language"), 'Control dashboard does not persist the selected language.');
assert(appSource.includes('navigator.languages'), 'Control dashboard does not resolve an initial browser language.');
assert(appSource.includes("language.startsWith('ko')"), 'Control dashboard does not auto-detect Korean.');
assert(appSource.includes("language.startsWith('ja')"), 'Control dashboard does not auto-detect Japanese.');
assert(appSource.includes("language.startsWith('zh')"), 'Control dashboard does not auto-detect Chinese.');
assert(appSource.includes('document.documentElement.lang = currentLanguage'), 'Control dashboard does not update the document language.');
assert(appSource.includes("'brand.title': 'WorkForge 제어판'"), 'Control dashboard is missing Korean translations.');
assert(appSource.includes("'brand.title': 'WorkForge コントロール'"), 'Control dashboard is missing Japanese translations.');
assert(appSource.includes("'brand.title': 'WorkForge 控制台'"), 'Control dashboard is missing Chinese translations.');

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
assert(serverSource.includes("url.pathname === '/api/update'"), 'Control server is missing update endpoints.');
assert(serverSource.includes("runPowerShell('Update.ps1'"), 'Control server does not use the transactional updater.');
assert(serverSource.includes('WORKFORGE_UPDATE_PROGRESS '), 'Control server does not consume updater progress events.');
assert(serverSource.includes("'-EmitProgress'"), 'Control server does not opt into updater progress events.');
assert(appSource.includes("'/api/update'"), 'Control dashboard does not invoke the update API.');
assert(appSource.includes('startUpdateProgressPolling'), 'Control dashboard does not poll update progress.');
assert(appSource.includes('updateProgressBar.style.width'), 'Control dashboard does not render progress width.');
assert(appSource.includes("'/api/uninstall/preview'"), 'Control dashboard does not preview uninstall.');
assert(appSource.includes("phrase: elements.destructivePhrase.value"), 'Destructive uninstall phrase is not forwarded.');

const child = spawn(process.execPath, [serverPath, '--profile', 'missing-dashboard-test', '--no-browser', '--port', '0'], {
  cwd: toolRoot,
  env: { ...process.env, WORKFORGE_CONTROL_TEST_MODE: '1' },
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

let port;
let unfinishedRequest;
try {
  ({ port } = await waitForReady());
  const origin = `http://127.0.0.1:${port}`;

  const root = await fetch(`${origin}/`, { redirect: 'manual' });
  assert(root.status === 200, `Dashboard root returned ${root.status}.`);
  const cookieHeader = root.headers.get('set-cookie') || '';
  assert(cookieHeader.includes('workforge_control_session='), 'Dashboard root did not set a session cookie.');
  assert(cookieHeader.includes('HttpOnly'), 'Dashboard cookie is not HttpOnly.');
  assert(cookieHeader.includes('SameSite=Strict'), 'Dashboard cookie is not SameSite=Strict.');
  assert((root.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'Dashboard CSP is missing.');
  assert(root.headers.get('x-frame-options') === 'DENY', 'Dashboard must deny framing.');
  const cookie = cookieHeader.split(';', 1)[0];

  for (const [asset, expectedType] of [
    ['/style.css', 'text/css'],
    ['/app.js', 'text/javascript'],
    ['/logo.png', 'image/png'],
  ]) {
    const assetResponse = await fetch(`${origin}${asset}`);
    assert(assetResponse.status === 200, `${asset} returned ${assetResponse.status}.`);
    assert((assetResponse.headers.get('content-type') || '').startsWith(expectedType), `${asset} has the wrong content type.`);
  }

  const unauthorized = await fetch(`${origin}/api/meta`);
  assert(unauthorized.status === 401, `Unauthenticated API request returned ${unauthorized.status}.`);

  const meta = await fetch(`${origin}/api/meta`, { headers: { Cookie: cookie } });
  assert(meta.status === 200, `Authenticated meta request returned ${meta.status}.`);
  const metaJson = await meta.json();
  assert(metaJson.localOnly === true, 'Dashboard meta does not report local-only mode.');
  assert(metaJson.profileId === 'missing-dashboard-test', 'Dashboard profile id changed unexpectedly.');
  assert(metaJson.platform === (process.platform === 'darwin' ? 'macos' : 'windows'), 'Dashboard platform metadata is incorrect.');
  assert(typeof metaJson.capabilities?.update === 'boolean', 'Dashboard capabilities are missing update support.');
  assert(typeof metaJson.capabilities?.removeEverything === 'boolean', 'Dashboard capabilities are missing destructive uninstall support.');

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
}

console.log('CONTROL_DASHBOARD_TEST_OK');
