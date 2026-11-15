// Exercise the original setup/build helpers for this dependency-free package.
// Other Core packages and the complete web app require separate verification.
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

assert.equal(process.env.LH_NATIVE_SETUP_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const host = path.resolve(process.env.LH_NATIVE_HOST_CORE, '../..');
const { setupPlugins } = await import(pathToFileURL(path.join(host, 'scripts/setup-plugins.mjs')));
const { buildCorePlugins, validateCorePackages } = await import(pathToFileURL(path.join(host, 'scripts/build-core-plugins.mjs')));
const root = await mkdtemp(path.join(os.tmpdir(), 'lh-native-setup-')), project = path.join(root, 'plugins/lesson-practice');
const manifest = JSON.parse(await readFile('/plugin/manifest.json', 'utf8'));
let missingLockChecked = false;
try {
  await cp('/plugin', project, { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.6.1' }));
  await writeFile(path.join(root, 'core-plugins.json'), JSON.stringify(['lesson-practice']));
  await writeFile('/tmp/native-empty-npmrc', '');
  await writeFile('/tmp/native-empty-global-npmrc', '');
  const lockFile = path.join(project, 'package-lock.json'), lock = JSON.parse(await readFile(lockFile, 'utf8'));
  assert.equal(lock.version, manifest.version); assert.deepEqual(Object.keys(lock.packages), ['']);
  await rm(lockFile);
  assert.throws(() => setupPlugins(root, { run() { throw new Error('No command should start without its lockfile.'); } }), /package-lock.json is required/);
  missingLockChecked = true; await writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
  const commands = [];
  const run = (args, cwd) => {
    assert.deepEqual(args, commands.length ? ['run', 'build'] : ['ci']);
    assert.equal(cwd, project); commands.push([...args]);
    const result = spawnSync(process.execPath, ['/usr/share/nodejs/npm/bin/npm-cli.js', ...args,
      '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--update-notifier=false',
      '--userconfig=/tmp/native-empty-npmrc', '--globalconfig=/tmp/native-empty-global-npmrc', '--cache=/tmp/native-npm-cache'],
    { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  setupPlugins(root, { run }); buildCorePlugins(root, { run }); validateCorePackages(root, path.join(root, 'core-plugins'));
  assert.equal(commands.length, 2); assert.equal(missingLockChecked, true);
  const built = JSON.parse(await readFile(path.join(root, 'core-plugins/lesson-practice/manifest.json'), 'utf8'));
  assert.equal(built.version, manifest.version);
  for (const name of ['package.json', 'package-lock.json', 'node_modules', 'src', 'tests', 'data']) await assert.rejects(access(path.join(root, 'core-plugins/lesson-practice', name)));
  console.log('PASS original plugin setup rejects a missing lockfile, then installs the empty lock offline; original Core builder stages the versioned package without source/dependency/data files');
} finally { await rm(root, { recursive: true, force: true }); }
