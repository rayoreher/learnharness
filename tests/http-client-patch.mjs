// Run the pinned original connector tests against the reviewed HTTP-client patch.
// The full app and real account connections are not loaded.
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

assert.equal(process.env.LH_HTTP_PATCH_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const proof = JSON.parse(await readFile('/proof.json', 'utf8'));
const compiled = JSON.parse(await readFile('/compiled-proof.json', 'utf8'));
const locked = JSON.parse(await readFile('/lock.json', 'utf8')).packages['node_modules/undici'];
assert.equal(proof.name, 'undici'); assert.equal(proof.version, locked.version); assert.equal(proof.integrity, locked.integrity);
const expectedManifest = structuredClone(proof.manifest); delete expectedManifest.scripts.prepare;
assert.deepEqual(JSON.parse(await readFile('/candidate/package.json', 'utf8')), expectedManifest);
for (const file of proof.inventory) {
  if (file.path === 'package.json') continue;
  assert.equal(createHash('sha256').update(await readFile('/candidate/' + file.path)).digest('hex'), file.sha256, file.path);
}
assert.equal(createHash('sha256').update(await readFile('/native-helper.ts')).digest('hex'), compiled.sha256);
const root = await mkdtemp(path.join(os.tmpdir(), 'lh-http-client-'));
try {
  const test = path.join(root, 'tests/safe-fetch-connector.test.ts');
  const fixture = path.join(root, 'tests/fixtures/security-tls');
  await mkdir(fixture, { recursive: true });
  await mkdir(path.join(root, 'src/agent/tools'), { recursive: true });
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  await cp('/candidate', path.join(root, 'node_modules/undici'), { recursive: true });
  await cp('/native-helper.ts', path.join(root, 'src/agent/tools/safe-fetch.ts'));
  await cp('/source-test.ts', test);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  // New test-only keys stay inside this disposable namespace; no account or
  // externally supplied private-key file is mounted or reused.
  const certificate = spawnSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-config', '/dev/null',
    '-keyout', path.join(fixture, 'key.pem'), '-out', path.join(fixture, 'cert.pem'),
    '-days', '1', '-nodes', '-subj', '/CN=research.invalid', '-addext', 'subjectAltName=DNS:research.invalid', '-addext', 'basicConstraints=critical,CA:TRUE'], { encoding: 'utf8' });
  assert.equal(certificate.status, 0, certificate.stderr);
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--test', '--test-reporter=spec', test], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  process.stdout.write(result.stdout);
  console.log('PASS original native DNS-peer and HTTPS/SNI boundary tests against locked Undici ' + locked.version);
} finally { await rm(root, { recursive: true, force: true }); }
