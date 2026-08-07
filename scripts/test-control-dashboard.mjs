import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(scriptDirectory, '..');
const serverPath = path.join(scriptDirectory, 'control-server.mjs');
const htmlPath = path.join(toolRoot, 'control-ui', 'index.html');
const appPath = path.join(toolRoot, 'control-ui', 'app.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const serverSource = await readFile(serverPath, 'utf8');
const htmlSource = await readFile(htmlPath, 'utf8');
const appSource = await readFile(appPath, 'utf8');

assert(serverSource.includes("host: '127.0.0.1'"), 'Control dashboard must bind to 127.0.0.1 only.');
assert(!serverSource.includes('0.0.0.0'), 'Control dashboard must never bind to 0.0.0.0.');
assert(!serverSource.includes('Access-Control-Allow-Origin'), 'Control dashboard must not enable CORS.');
assert(serverSource.includes('HttpOnly; SameSite=Strict'), 'Control dashboard session cookie is not hardened.');
assert(serverSource.includes('request.headers.origin !== expectedOrigin'), 'Mutating requests must verify Origin.');
assert(serverSource.includes('request.headers.host !== expectedHost'), 'Control dashboard must verify Host.');
assert(htmlSource.includes('Start Tunnel'), 'Control dashboard is missing Start.');
assert(htmlSource.includes('Run Doctor'), 'Control dashboard is missing Doctor.');
assert(htmlSource.includes('Remove WorkForge'), 'Control dashboard is missing uninstall flow.');
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

let port;
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

  const statusFailure = await fetch(`${origin}/api/status`, { headers: { Cookie: cookie } });
  assert(statusFailure.status === 500, `Missing-profile status returned ${statusFailure.status}.`);
  const statusFailureText = await statusFailure.text();
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
  assert(exitCode === 0, `Control server exited with ${exitCode}. stderr=${stderr}`);
} finally {
  if (child.exitCode === null) child.kill();
}

console.log('CONTROL_DASHBOARD_TEST_OK');
