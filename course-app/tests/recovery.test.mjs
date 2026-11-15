import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApplication } from '../application.mjs';
import { Store } from '../store.mjs';
import { sampleCourse } from '../sample.mjs';
import { PendingReceipts } from '../../public/course-studio/receipts.js';

async function fixture(t, provider = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-recovery-'));
  const codex = { status: async () => ({ connected: false }), close: async () => {}, course: async () => sampleCourse(), ...provider };
  const app = await createApplication({ directory, codex });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); }); return { app, directory, codex };
}
test('generation receipts survive acknowledgement loss, restart and conflicting reuse', async t => {
  let calls = 0; const f = await fixture(t, { course: async () => { calls++; return sampleCourse(); } });
  const input = { goal: 'Learn recall', types: ['open'], requestId: 'generation-receipt' };
  const first = await f.app.generate(input); await f.app.runningJob;
  assert.equal((await f.app.generate(input)).id, first.id); assert.equal(calls, 1);
  await assert.rejects(f.app.generate({ ...input, goal: 'Different' }), /different generation/);
  await f.app.close(); const reopened = await createApplication({ directory: f.directory, codex: f.codex });
  try { assert.equal((await reopened.generate(input)).id, first.id); assert.equal((await reopened.store.read()).courses.length, 1); } finally { await reopened.close(); }
});
test('additional formats attach to saved concepts, preserve history and reopen coverage', async t => {
  const f = await fixture(t, { exercises: async (c, l) => ({ exercises: [{ id: 'model-id', type: 'true-false', conceptIds: [l.objectives[0].id], question: 'Recall requires retrieval.', answer: 'True', explanation: 'Retrieve before checking.', rubric: '', options: ['False', 'True'] }] }) });
  const c = sampleCourse(), l = c.lessons[0]; await f.app.learning.add(c);
  for (const e of l.exercises) await f.app.learning.attempt({ courseId: c.id, lessonId: l.id, exerciseId: e.id, requestId: e.id, action: 'unknown', answer: '' });
  await f.app.learning.complete(c.id, l.id); const before = (await f.app.store.read()).progress[c.id];
  const j = await f.app.generate({ kind: 'exercises', courseId: c.id, lessonId: l.id, types: ['true-false'], requestId: 'new-practice' }); await f.app.runningJob;
  const s = await f.app.store.read(), saved = s.courses[0]; assert.equal(s.jobs.find(x => x.id === j.id).status, 'succeeded');
  assert.deepEqual(s.progress[c.id].attempts, before.attempts); assert.deepEqual(s.progress[c.id].reviews, before.reviews);
  assert.deepEqual(saved.lessons[0].exercises.slice(0, l.exercises.length), l.exercises); assert.equal(saved.version, 2);
  assert.match(saved.lessons[0].exercises.at(-1).id, /^practice-/); assert.ok(s.progress[c.id].lessonSettings[l.id].exerciseTypes.includes('true-false')); assert.equal(s.progress[c.id].completedLessons.includes(l.id), false);
});
test('invalid additional content is rejected atomically without replacing a lesson', async t => {
  const f = await fixture(t, { exercises: async () => ({ exercises: [{ type: 'true-false', conceptIds: ['missing'] }] }) });
  const c = sampleCourse(); await f.app.learning.add(c);
  await f.app.generate({ kind: 'exercises', courseId: c.id, lessonId: c.lessons[0].id, types: ['true-false'] }); await f.app.runningJob;
  const s = await f.app.store.read(); assert.equal(s.jobs[0].status, 'failed'); assert.deepEqual(s.courses[0], c); assert.equal(s.progress[c.id].attempts.length, 0);
});
test('damaged stored references are refused and the original bytes remain untouched', async t => {
  const f = await fixture(t); const c = sampleCourse(); await f.app.learning.add(c); await f.app.close();
  const file = path.join(f.directory, 'learning.json'); const state = JSON.parse(await readFile(file, 'utf8')); state.progress[c.id].completedLessons = ['nonexistent'];
  const corrupt = JSON.stringify(state); await writeFile(file, corrupt); await assert.rejects(new Store(f.directory).initialize(), /missing lessons/); assert.equal(await readFile(file, 'utf8'), corrupt);
});
test('unfinished generation becomes interrupted on restart and never silently replays', async t => {
  const f = await fixture(t); await f.app.store.transact(s => { s.jobs.push({ id: 'interrupted-job', goal: 'Recall', status: 'running', input: { goal: 'Recall', types: ['open'] } }); }); await f.app.close();
  const store = await new Store(f.directory).initialize(); try { const s = await store.read(); assert.equal(s.jobs[0].status, 'interrupted'); assert.equal(s.courses.length, 0); } finally { await store.close(); }
});
test('tab receipts reuse an uncertain request across reload and clear only on acceptance', () => {
  const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; let id = 0;
  const first = new PendingReceipts(storage, () => `id-${++id}`); const receipt = first.prepare('answer', 'attempts', { answer: 'A' });
  const reopened = new PendingReceipts(storage, () => `id-${++id}`); assert.equal(reopened.prepare('answer', 'attempts', { answer: 'A' }).input.requestId, receipt.input.requestId);
  assert.notEqual(reopened.prepare('answer', 'attempts', { answer: 'B' }).input.requestId, receipt.input.requestId); assert.equal(reopened.list().length, 1); reopened.accept('answer'); assert.equal(new PendingReceipts(storage).list().length, 0);
});
