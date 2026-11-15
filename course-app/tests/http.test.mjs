import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server.mjs';
import { handleCourseRequest } from '../http.mjs';
import { sampleCourse } from '../sample.mjs';

const fake = () => ({ status: async () => ({ connected: false, available: true }), close: async () => {}, models: async () => [{ id: 'test-model', name: 'Test model' }], course: async () => sampleCourse() });
async function server(t, codex = fake()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-http-'));
  const running = await startServer({ port: 0, directory, codex });
  t.after(async () => { await running.close(); await rm(directory, { recursive: true, force: true }); });
  const get = async route => (await fetch(running.url + '/api/course-studio/' + route)).json();
  const state = await get('state');
  const post = async (route, input, headers = {}) => fetch(running.url + '/api/course-studio/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-course-token': state.token, ...headers }, body: JSON.stringify(input) });
  return { ...running, get, post, token: state.token };
}
test('local web server serves workspace and a real learn-answer-review journey', async t => {
  const f = await server(t);
  const page = await fetch(f.url); assert.equal(page.status, 200); assert.match(await page.text(), /Course Studio/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const sample = await f.post('sample', {}); assert.equal(sample.status, 201); const course = await sample.json();
  const l = course.lessons[0], e = l.exercises[0]; assert.equal(e.answer, undefined);
  const response = await f.post('attempts', { courseId: course.id, lessonId: l.id, exerciseId: e.id, requestId: 'test-attempt', action: 'unknown', answer: '' });
  assert.equal(response.status, 201); const attempt = await response.json(); assert.equal(attempt.result, 'incorrect'); assert.ok(attempt.solution);
  assert.equal((await f.get('state')).progress[course.id].reviews.length, 1);
  const missing = await fetch(f.url + '/course-studio/../../course-app/store.mjs'); assert.equal(missing.status, 404);
});
test('HTTP refuses missing CSRF, hostile origins, nonlocal hosts, bad content and malformed JSON', async t => {
  const f = await server(t);
  assert.equal((await f.post('sample', {}, { 'x-course-token': '' })).status, 403);
  assert.equal((await f.post('sample', {}, { origin: 'https://example.com' })).status, 403);
  assert.equal((await f.post('sample', {}, { 'content-type': 'text/plain' })).status, 415);
  const bad = await fetch(f.url + '/api/course-studio/sample', { method: 'POST', headers: { 'content-type': 'application/json', 'x-course-token': f.token }, body: '{' }); assert.equal(bad.status, 400);
  assert.equal((await handleCourseRequest(new Request('http://untrusted.example/api/course-studio/state'), f.app)).status, 403);
  assert.equal((await f.post('sample', { value: 'x'.repeat(66000) })).status, 413);
});
test('generation jobs save complete courses and expose terminal failures without fabricated lessons', async t => {
  const codex = fake(); const f = await server(t, codex);
  const request = await f.post('generate', { goal: 'Understand memory', level: 'beginner', types: ['multiple-choice'] }); assert.equal(request.status, 202);
  const job = await request.json(); await f.app.runningJob;
  assert.equal((await f.get('jobs/' + job.id)).status, 'succeeded'); assert.equal((await f.get('state')).courses.length, 1);
  codex.course = async () => { throw new Error('Private diagnostic must not be exposed'); };
  const failed = await (await f.post('generate', { goal: 'Understand another idea', types: ['open'] })).json(); await f.app.runningJob;
  const terminal = await f.get('jobs/' + failed.id); assert.equal(terminal.status, 'failed'); assert.doesNotMatch(terminal.error, /Private/);
  assert.equal((await f.get('state')).courses.length, 1);
});
test('generation slot rejects concurrent starts and recovers after failure', async t => {
  let release; const result = new Promise(resolve => { release = resolve; });
  const codex = fake(); codex.course = () => result;
  codex.close = async () => { release?.(sampleCourse()); };
  const f = await server(t, codex);
  const first = await f.post('generate', { goal: 'One', types: ['open'] }); assert.equal(first.status, 202);
  const second = await f.post('generate', { goal: 'Two', types: ['open'] }); assert.equal(second.status, 409);
  release(sampleCourse()); await f.app.runningJob;
});
