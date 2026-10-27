import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

// Mode evidence rejects symlinked ancestors; macOS tmpdir sits under /var -> /private/var.
const root = await realpath(await mkdtemp(join(tmpdir(), 'workforge-work-api-')));
const engineRoot = fileURLToPath(new URL('..', import.meta.url));
const secret = 'opaque-control-fixture-892791';
let child;
try {
  const primaryRoot = join(root, 'workspace');
  const config = join(primaryRoot, 'tools', 'workforge-mcp');
  await mkdir(config, { recursive: true });
  await writeFile(join(primaryRoot, 'marker'), 'fixture');
  const profile = { id: 'work-api-test', displayName: 'Fixture', appName: 'Fixture', serverName: 'fixture',
    defaultWorkingDirectoryRelative: '.', bootstrapFiles: [], identityMarkers: [{ relativePath: 'marker', expectedLiteral: 'fixture' }] };
  const bytes = JSON.stringify(profile);
  const profilePath = join(config, 'profile.json');
  const registryPath = join(root, 'registry.json');
  await writeFile(profilePath, bytes);
  await writeFile(registryPath, JSON.stringify({ version: 1, profiles: [{ id: profile.id, profilePath,
    profileSha256: createHash('sha256').update(bytes).digest('hex') }] }));
  await writeFile(join(root, 'current.json'), JSON.stringify({ engineRoot, registryPath, nodePath: process.execPath }));
  const taskRoot = join(primaryRoot, 'artifacts', 'workforge-mcp', 'tasks');
  await mkdir(taskRoot, { recursive: true });
  await writeFile(join(taskRoot, 'example.json'), JSON.stringify({ version: 1, taskId: 'example', profileId: profile.id,
    savedAt: new Date().toISOString(), state: { title: secret, objective: 'Private detail', reportedStatus: 'active',
      plan: [], completedSteps: [], blockers: [], nextAction: '', projectPath: primaryRoot, relatedPaths: [], shellJobIds: [] } }));
  child = spawn(process.execPath, ['scripts/control-server.mjs', '--profile', profile.id, '--no-browser', '--port', '0'], {
    cwd: engineRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      CONTROL_PLANE_API_KEY: secret, WORKFORGE_CONTROL_TEST_MODE: '1',
      WORKFORGE_MCP_PROFILE_REGISTRY: registryPath, WORKFORGE_MACOS_STATE_ROOT: root } });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.resume();
  let ready;
  const deadline = Date.now() + 8000;
  while (!ready && Date.now() < deadline) {
    assert.equal(child.exitCode, null, 'Control exited before readiness');
    const line = output.split(/\r?\n/).find(line => line.startsWith('WORKFORGE_CONTROL_TEST_READY '));
    if (line) ready = JSON.parse(line.slice('WORKFORGE_CONTROL_TEST_READY '.length));
    else await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(ready, 'Control readiness timed out');
  const origin = `http://127.0.0.1:${ready.port}`;
  assert.equal((await fetch(`${origin}/api/work`)).status, 401);
  assert.equal((await fetch(`${origin}/api/work/task?id=example`)).status, 401);
  assert.equal((await fetch(`${origin}/api/mode-evidence`)).status, 401);
  const response = await fetch(`${origin}/?k=${ready.launchToken}`, { redirect: 'manual' });
  const cookie = response.headers.get('set-cookie').split(';', 1)[0];
  const logRoot = process.platform === 'darwin' ? join(root, 'tunnel', profile.id) : join(primaryRoot, 'artifacts', 'workforge-mcp', 'tunnel');
  await mkdir(logRoot, { recursive: true });
  await writeFile(join(logRoot, 'tunnel.stderr.log'), 'WorkForge MCP posture: {"toolMode":"read_only","redaction":"on","tools":12}\n');
  const evidence = await (await fetch(`${origin}/api/mode-evidence`, { headers: { Cookie: cookie } })).json();
  assert.equal(evidence.evidence, 'stale');
  assert.equal(evidence.toolMode, 'read_only');
  const work = await (await fetch(`${origin}/api/work`, { headers: { Cookie: cookie } })).json();
  assert.equal(work.available, true);
  assert.equal(work.tasks[0].title, '[WORKFORGE_REDACTED]');
  assert(!JSON.stringify(work).includes(secret));
  assert(!('objective' in work.tasks[0]));
  const detail = await (await fetch(`${origin}/api/work/task?id=example`, { headers: { Cookie: cookie } })).json();
  assert.equal(detail.available, true);
  assert.equal(detail.task.objective, 'Private detail');
  assert.equal(detail.task.title, '[WORKFORGE_REDACTED]');
  assert.equal(detail.evidenceSummary.total, 0);
  for (const [id, code] of [['../invalid', 'invalid_id'], ['missing', 'not_found']]) {
    const response = await (await fetch(`${origin}/api/work/task?id=${encodeURIComponent(id)}`, { headers: { Cookie: cookie } })).json();
    assert.equal(response.code, code);
  }
  const exited = once(child, 'exit');
  await fetch(`${origin}/api/shutdown`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await exited)[0], 0);
  if (process.platform === 'win32') {
    const engine = join(root, 'engine');
    await mkdir(join(engine, 'scripts'), { recursive: true });
    await mkdir(join(engine, 'runtime'));
    await Promise.all([
      cp(join(engineRoot, 'dist'), join(engine, 'dist'), { recursive: true }),
      cp(join(engineRoot, 'control-ui'), join(engine, 'control-ui'), { recursive: true }),
      cp(join(engineRoot, 'scripts', 'control-server.mjs'), join(engine, 'scripts', 'control-server.mjs')),
      cp(join(engineRoot, 'package.json'), join(engine, 'package.json')),
      cp(join(engineRoot, 'workforge-contract.json'), join(engine, 'workforge-contract.json')),
      cp(registryPath, join(engine, 'runtime', 'profile_registry.json')),
      symlink(join(engineRoot, 'node_modules'), join(engine, 'node_modules'), 'junction'),
    ]);
    for (const registry of [undefined, 'relative-registry.json']) {
      const environment = { ...process.env, WORKFORGE_CONTROL_TEST_MODE: '1' };
      delete environment.WORKFORGE_MCP_PROFILE_REGISTRY;
      if (registry !== undefined) environment.WORKFORGE_MCP_PROFILE_REGISTRY = registry;
      child = spawn(process.execPath, [join(engine, 'scripts', 'control-server.mjs'), '--profile', profile.id, '--no-browser', '--port', '0'],
        { cwd: engine, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: environment });
      let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.resume();
      let info;
      const end = Date.now() + 8000;
      while (!info && Date.now() < end) {
        assert.equal(child.exitCode, null);
        const line = log.split(/\r?\n/).find(value => value.startsWith('WORKFORGE_CONTROL_TEST_READY '));
        if (line) info = JSON.parse(line.slice('WORKFORGE_CONTROL_TEST_READY '.length));
        else await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert(info, 'Fixture engine did not start.');
      const base = `http://127.0.0.1:${info.port}`;
      const auth = await fetch(`${base}/?k=${info.launchToken}`, { redirect: 'manual' });
      const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
      const headers = { Cookie: cookie };
      const work = await (await fetch(`${base}/api/work`, { headers })).json();
      const detail = await (await fetch(`${base}/api/work/task?id=example`, { headers })).json();
      const mode = await (await fetch(`${base}/api/mode-evidence`, { headers })).json();
      if (registry === undefined) {
        assert.equal(work.available, true); assert.equal(detail.available, true); assert.notEqual(mode.code, 'registry_invalid');
      } else {
        assert.equal(work.code, 'registry_invalid'); assert.equal(detail.code, 'registry_invalid'); assert.equal(mode.code, 'registry_invalid');
      }
      const finished = once(child, 'exit');
      await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { ...headers, Origin: base }, body: '{}' });
      assert.equal((await finished)[0], 0);
    }
  }
} finally {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  await rm(root, { recursive: true, force: true });
}
console.log('CONTROL_WORK_API_TEST_OK');
