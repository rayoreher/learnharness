// Bounded runtime compatibility checks for the reviewed schema-library patch.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

assert.equal(process.env.LH_SCHEMA_PATCH_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const proof = JSON.parse(await readFile('/proof.json', 'utf8'));
const unicode = JSON.parse(await readFile('/unicode-proof.json', 'utf8'));
const locked = JSON.parse(await readFile('/lock.json', 'utf8')).packages['node_modules/zod'];
assert.equal(proof.name, 'zod'); assert.equal(proof.version, locked.version); assert.equal(proof.integrity, locked.integrity);
const manifest = structuredClone(proof.manifest); delete manifest.scripts.prepublishOnly;
assert.deepEqual(JSON.parse(await readFile('/candidate/package.json', 'utf8')), manifest);
for (const file of proof.inventory) {
  if (file.path === 'package.json') continue;
  const expected = unicode.find(item => item.path === file.path)?.reviewed_sha256 ?? file.sha256;
  assert.equal(createHash('sha256').update(await readFile('/candidate/' + file.path)).digest('hex'), expected, file.path);
}
const esm = await import(pathToFileURL('/candidate/index.js'));
const cjs = createRequire(import.meta.url)('/candidate/index.cjs');
for (const [format, api] of [['ESM', esm], ['CJS', cjs]]) {
  assert.equal(typeof api.z?.object, 'function'); assert.equal(api.object, api.z.object);
  const z = api.z;
  for (const jitless of [true, false]) {
    z.config({ jitless, ...z.locales.en() });
    const schema = z.object({ name: z.string().min(1), count: z.number().int().min(1), formats: z.array(z.enum(['choice', 'open'])).max(4) }).strict();
    const input = { name: 'Recall', count: 2, formats: ['choice', 'open'] };
    assert.deepEqual(schema.parse(input), input);
    assert.equal(schema.safeParse({ ...input, count: 1.5 }).success, false);
    assert.equal(schema.safeParse({ ...input, unexpected: true }).success, false);
    const json = z.toJSONSchema(schema); assert.equal(json.type, 'object'); assert.equal(json.additionalProperties, false); assert.deepEqual(json.properties.formats.items.enum, ['choice', 'open']);

    const items = Array(4); Object.defineProperty(items, 0, { get() { throw new Error('An oversized array must fail its size check before reading elements.'); } });
    const bounded = z.array(z.string()).max(3), rejected = bounded.safeParse(items);
    assert.equal(rejected.success, false); assert.equal(rejected.error.issues.length, 1); assert.equal(rejected.error.issues[0].code, 'too_big');
    assert.equal((await bounded.safeParseAsync(items)).success, false);
    assert.deepEqual(bounded.parse(['a', 'b']), ['a', 'b']);

    const key = 'x"];globalThis.__schemaInjected=true;//'; globalThis.__schemaInjected = false;
    const keyed = z.object(Object.fromEntries([[key, z.string()]])), value = Object.fromEntries([[key, 'data']]);
    assert.deepEqual(keyed.parse(value), value); assert.equal(globalThis.__schemaInjected, false); delete globalThis.__schemaInjected;
    console.log(`PASS ${format} jitless=${jitless}: native schema/JSON contracts, bounded collection rejection before traversal, quoted property names`);
  }
  for (const language of ['fa', 'kn']) {
    z.config(z.locales[language]()); const result = z.string().safeParse(12);
    assert.equal(result.success, false); const message = result.error.issues[0].message;
    assert.equal(typeof message, 'string'); assert.ok(message.length > 0); assert.equal(message.includes('\\u200c'), false);
  }
  z.config({ jitless: false, ...z.locales.en() });
  console.log(`PASS ${format}: reviewed locale callbacks retain readable runtime messages`);
}
