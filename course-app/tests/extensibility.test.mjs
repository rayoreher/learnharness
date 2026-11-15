import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registry } from '../../public/course-studio/plugin-registry.js';
import { Store } from '../store.mjs';
import { Learning } from '../learning.mjs';
import { sampleCourse } from '../sample.mjs';
import { validateCourse } from '../schema.mjs';

async function fixture(t, raw) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-extensible-'));
  const store = await new Store(directory).initialize();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  let clock = 100000, serial = 0;
  const learning = new Learning(store, { status: async () => ({ connected: false }) }, () => clock);
  const course = raw ? validateCourse(raw) : sampleCourse(); await learning.add(course);
  const attempt = (e, options = {}, c = course) => learning.attempt({ courseId: c.id, lessonId: c.lessons.find(l => l.exercises.some(x => x.id === e.id)).id, exerciseId: e.id, answer: e.answer, action: 'answer', requestId: `extension-${++serial}`, ...options });
  return { store, learning, course, attempt, advance: ms => { clock += ms; }, progress: async () => (await store.read()).progress[course.id] };
}
test('registered exercises and custom graders run through core validation and persistence', async t => {
  const unregisterGrade = registry.register({ apiVersion: 1, id: 'test-semantic', slot: 'grader', version: '1.0.0', label: 'Test semantic', requires: [] }, { grade: async ({ answer }) => ({ result: answer.includes('retrieve') ? 'correct' : 'incorrect', feedback: 'Checks the retrieval concept.' }) });
  const unregisterType = registry.register({ apiVersion: 1, id: 'test-short-explanation', slot: 'exercise', version: '1.0.0', label: 'Short explanation', requires: [] }, { input: 'text', grader: 'test-semantic' });
  t.after(() => { unregisterType(); unregisterGrade(); });
  const raw = sampleCourse(); raw.lessons[0].exercises.push({ id: 'custom-retrieval', type: 'test-short-explanation', question: 'Name the action used in active recall.', answer: 'retrieve', explanation: 'Retrieve before checking.', conceptIds: ['active-recall'], options: [] });
  const f = await fixture(t, raw), e = f.course.lessons[0].exercises.at(-1);
  const a = await f.attempt(e, { answer: 'retrieve the idea from memory' });
  assert.equal(a.result, 'correct'); assert.equal(a.grader, 'test-semantic'); assert.equal(a.graderVersion, '1.0.0'); assert.equal((await f.progress()).attempts.length, 1);
});
test('an invalid grader verdict cannot modify learning progress', async t => {
  const disposeGrade = registry.register({ apiVersion: 1, id: 'test-invalid-grade', slot: 'grader', version: '1.0.0', label: 'Invalid test', requires: [] }, { grade: async () => ({ result: 'mastered-forever', feedback: 'Invalid.' }) });
  const disposeType = registry.register({ apiVersion: 1, id: 'test-invalid-exercise', slot: 'exercise', version: '1.0.0', label: 'Invalid test', requires: [] }, { input: 'text', grader: 'test-invalid-grade' });
  t.after(() => { disposeType(); disposeGrade(); });
  const raw = sampleCourse(); raw.lessons[0].exercises[0].type = 'test-invalid-exercise';
  const f = await fixture(t, raw); await assert.rejects(f.attempt(f.course.lessons[0].exercises[0]), /invalid assessment/);
  assert.equal((await f.progress()).attempts.length, 0);
});
test('ordering is graded by sequence and rejects duplicate or missing items', async t => {
  const raw = sampleCourse(); raw.lessons[0].exercises.push({ id: 'recall-order', type: 'ordering', question: 'Arrange a recall practice cycle.', options: ['Check the answer', 'Attempt recall', 'Return later'], answer: JSON.stringify(['Attempt recall', 'Check the answer', 'Return later']), explanation: 'Try first, check, then return.', conceptIds: ['active-recall'] });
  const f = await fixture(t, raw), e = f.course.lessons[0].exercises.at(-1);
  assert.equal((await f.attempt(e, { answer: JSON.stringify(e.options) })).result, 'incorrect');
  assert.equal((await f.attempt(e)).result, 'correct');
  await assert.rejects(f.attempt(e, { answer: JSON.stringify(['Attempt recall', 'Attempt recall', 'Return later']) }), /exactly once/);
  await assert.rejects(f.attempt(e, { answer: 'not an array' }), /Arrange the items/);
});
test('true-false exercises use the normal choice contract', async t => {
  const raw = sampleCourse(); raw.lessons[0].exercises.push({ id: 'recall-true', type: 'true-false', question: 'Active recall includes trying before checking.', options: ['True', 'False'], answer: 'True', explanation: 'The attempt precedes feedback.', conceptIds: ['active-recall'] });
  const f = await fixture(t, raw), e = f.course.lessons[0].exercises.at(-1);
  assert.equal((await f.attempt(e, { answer: 'False' })).result, 'incorrect'); assert.equal((await f.attempt(e)).result, 'correct');
});
test('reinforced review requires two spaced successes even after lesson completion', async t => {
  const f = await fixture(t), e = f.course.lessons[0].exercises[0];
  await f.learning.courseSettings(f.course.id, { review: 'reinforced', exerciseTypes: ['multiple-choice'] });
  await f.attempt(e, { action: 'unknown', answer: '' }); await f.learning.complete(f.course.id, f.course.lessons[0].id);
  await f.attempt(e); assert.equal((await f.progress()).reviews.length, 1);
  assert.equal((await f.learning.nextReview(f.course.id)).waiting, true);
  f.advance(31000); await f.attempt(e); assert.equal((await f.progress()).reviews.length, 0);
});
test('spaced policy schedules future retrieval separately from session mistakes', async t => {
  const f = await fixture(t), e = f.course.lessons[0].exercises[0];
  await f.learning.courseSettings(f.course.id, { review: 'spaced' }); await f.attempt(e);
  assert.equal((await f.progress()).reviews.length, 0); assert.equal((await f.learning.nextReview(f.course.id)).scheduled, 1);
  assert.equal((await f.learning.nextReview(f.course.id)).question, null);
  f.advance(86400001); assert.ok((await f.learning.nextReview(f.course.id)).question);
  await f.attempt(e, { context: 'review' }); assert.equal((await f.progress()).retention[0].successes, 2);
  f.advance(2 * 86400000); assert.equal((await f.learning.nextReview(f.course.id)).question, null);
  await f.learning.courseSettings(f.course.id, { review: 'session' }); assert.equal((await f.learning.nextReview(f.course.id)).scheduled, 0);
  assert.equal((await f.progress()).retention.length, 1);
});
test('global review advances between courses and keeps course records separate', async t => {
  const f = await fixture(t), second = sampleCourse(); await f.learning.add(second);
  const firstExercise = f.course.lessons[0].exercises[0], secondExercise = second.lessons[0].exercises[0];
  await f.attempt(firstExercise, { action: 'unknown', answer: '' }); await f.attempt(secondExercise, { action: 'unknown', answer: '' }, second);
  f.advance(31000); const first = await f.learning.nextGlobalReview(); assert.equal(first.courseId, f.course.id); assert.equal(first.remaining, 2);
  await f.attempt(firstExercise, { context: 'review' }); const next = await f.learning.nextGlobalReview(); assert.equal(next.courseId, second.id); assert.equal(next.remaining, 1);
});
test('a request receipt cannot be reused for a different answer or target', async t => {
  const f = await fixture(t), e = f.course.lessons[0].exercises[0];
  const first = f.attempt(e, { requestId: 'fixed-receipt' });
  await assert.rejects(f.attempt(e, { requestId: 'fixed-receipt', action: 'unknown', answer: '' }), /different answer/);
  await first;
  await assert.rejects(f.attempt(e, { requestId: 'fixed-receipt', answer: 'Different' }), /another answer/);
  assert.equal((await f.progress()).attempts.length, 1);
});
