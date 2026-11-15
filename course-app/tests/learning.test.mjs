import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store.mjs';
import { Learning } from '../learning.mjs';
import { sampleCourse } from '../sample.mjs';
import { validateCourse, publicCourse } from '../schema.mjs';

async function fixture(t, { connected = false, grade } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-learning-'));
  const store = await new Store(directory).initialize();
  const codex = { status: async () => ({ connected }), grade: grade ?? (async () => ({ result: 'correct', feedback: 'Equivalent explanation accepted.' })) };
  let now = 100000;
  const learning = new Learning(store, codex, () => now);
  const course = sampleCourse(); await learning.add(course);
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  let count = 0;
  const attempt = (exercise, options = {}) => learning.attempt({ courseId: course.id, lessonId: course.lessons.find(l => l.exercises.includes(exercise)).id, exerciseId: exercise.id, answer: exercise.answer, action: 'answer', requestId: `request-${++count}`, ...options });
  const progress = async () => (await store.read()).progress[course.id];
  return { directory, store, learning, course, attempt, progress, advance: ms => { now += ms; } };
}
test('a miss reveals feedback, permits forward progress and persists across restart', async t => {
  const f = await fixture(t); const [choice, open] = f.course.lessons[0].exercises;
  const wrong = await f.attempt(choice, { answer: choice.options.find(x => x !== choice.answer) });
  assert.equal(wrong.result, 'incorrect'); assert.equal(wrong.solution, choice.answer); assert.ok(wrong.explanation);
  assert.equal((await f.progress()).reviews.length, 1);
  const next = await f.attempt(open, { answer: 'An attempt tests what I remember.' }); assert.equal(next.result, 'pending');
  await f.store.close(); const reloaded = await new Store(f.directory).initialize();
  assert.equal((await reloaded.read()).progress[f.course.id].attempts.length, 2); assert.equal((await reloaded.read()).progress[f.course.id].reviews.length, 1);
  await reloaded.close();
});
test('review waits, varies the question format, then clears only on unassisted success', async t => {
  const f = await fixture(t, { connected: true }); const choice = f.course.lessons[0].exercises[0];
  await f.attempt(choice, { action: 'unknown', answer: '' });
  assert.equal((await f.learning.nextReview(f.course.id)).waiting, true);
  f.advance(31000);
  const review = (await f.learning.nextReview(f.course.id)).question;
  assert.equal(review.type, 'open');
  await f.attempt(f.course.lessons[0].exercises[1], { answer: 'Retrieval shows gaps.', assisted: true });
  assert.equal((await f.progress()).reviews.length, 1);
  f.advance(31000);
  await f.attempt(f.course.lessons[0].exercises[1], { answer: 'Retrieval shows gaps.' });
  assert.equal((await f.progress()).reviews.length, 0);
});
test('revealing a flashcard cannot count as correctness or remove a missed concept', async t => {
  const f = await fixture(t); const [choice, , card] = f.course.lessons[0].exercises;
  await f.attempt(choice, { action: 'unknown', answer: '' }); f.advance(31000);
  const reveal = await f.attempt(card, { action: 'reveal', answer: '' });
  assert.equal(reveal.result, 'pending'); assert.equal((await f.progress()).reviews.length, 1);
  const rated = await f.learning.selfRate(f.course.id, reveal.id, 'good'); assert.equal(rated.grader, 'self-assessment'); assert.equal((await f.progress()).reviews.length, 0);
});
test('a correctly recalled new flashcard leaves no provisional review entry', async t => {
  const f = await fixture(t); const card = f.course.lessons[0].exercises[2];
  const a = await f.attempt(card, { action: 'reveal', answer: '' });
  await f.learning.selfRate(f.course.id, a.id, 'good'); assert.equal((await f.progress()).reviews.length, 0);
  await f.learning.selfRate(f.course.id, a.id, 'good');
  await assert.rejects(f.learning.selfRate(f.course.id, a.id, 'again'), /already rated differently/);
});
test('failed self-assessment remains queued without inventing an objective grade', async t => {
  const f = await fixture(t); const open = f.course.lessons[0].exercises[1];
  const a = await f.attempt(open, { answer: 'Something else.' });
  assert.equal(a.result, 'pending'); assert.equal(a.grader, 'self-assessment');
  await f.learning.selfRate(f.course.id, a.id, 'again'); assert.equal((await f.progress()).reviews.length, 1);
});
test('duplicate simultaneous answers cause one grading operation and one attempt', async t => {
  let grades = 0; const f = await fixture(t, { connected: true, grade: async () => { grades++; await new Promise(r => setTimeout(r, 20)); return { result: 'partial', feedback: 'Explain the gap-finding step too.' }; } });
  const open = f.course.lessons[0].exercises[1];
  const inputs = { answer: 'Trying to remember.', requestId: 'shared-request' };
  const [a, b] = await Promise.all([f.attempt(open, inputs), f.attempt(open, inputs)]);
  assert.equal(a.id, b.id); assert.equal(grades, 1); assert.equal((await f.progress()).attempts.length, 1); assert.equal(a.result, 'partial');
  const replay = await f.attempt(open, inputs); assert.equal(replay.id, a.id); assert.equal(grades, 1);
});
test('completion requires coverage and remains distinct from correctness', async t => {
  const f = await fixture(t); const lesson = f.course.lessons[0];
  await assert.rejects(f.learning.complete(f.course.id, lesson.id), /Try each/);
  for (const e of lesson.exercises) await f.attempt(e, { action: 'unknown', answer: '' });
  await f.learning.complete(f.course.id, lesson.id); const p = await f.progress();
  assert.deepEqual(p.completedLessons, [lesson.id]); assert.equal(p.reviews.length, 1);
  assert.ok((await f.learning.nextReview(f.course.id)).question);
});
test('lesson format selection changes coverage requirements without deleting history', async t => {
  const f = await fixture(t); const l = f.course.lessons[0];
  await f.learning.settings(f.course.id, l.id, { exerciseTypes: ['multiple-choice'] });
  await f.attempt(l.exercises[0]); await f.learning.complete(f.course.id, l.id);
  assert.equal((await f.progress()).attempts.length, 1);
  await assert.rejects(f.learning.settings(f.course.id, l.id, { exerciseTypes: ['fill-blank'] }), /no exercises/);
});
test('answer keys stay off the public course and invalid generated content is refused', () => {
  const c = sampleCourse(); const publicCopy = publicCourse(c);
  assert.equal(publicCopy.lessons[0].exercises[0].answer, undefined);
  assert.equal(publicCopy.lessons[0].exercises[0].explanation, undefined);
  c.lessons[0].exercises[0].answer = 'Not an available option'; assert.throws(() => validateCourse(c), /correct answer/);
  const invalid = sampleCourse(); invalid.lessons[0].exercises[0].conceptIds = ['unrelated']; assert.throws(() => validateCourse(invalid), /objectives/);
});
test('single-writer lease and atomic transaction preserve the last valid records', async t => {
  const f = await fixture(t);
  await assert.rejects(new Store(f.directory).initialize(), /Another Course Studio/);
  await assert.rejects(f.store.transact(s => { s.courses.length = 0; throw new Error('Failed update'); }), /Failed update/);
  assert.equal((await f.store.read()).courses.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(f.directory, 'learning.json'), 'utf8')).courses.length, 1);
});
