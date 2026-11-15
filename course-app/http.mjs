import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Problem, check, VERSION } from './schema.mjs';
import { getApplication } from './application.mjs';
import { importLearning, exportLearning } from './transfers.mjs';

const tokens = new WeakMap();
function token(app) { if (!tokens.has(app)) tokens.set(app, randomBytes(32).toString('hex')); return tokens.get(app); }
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
function local(url) { return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
function sameToken(a, b) { return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
async function readBody(request, limit) {
  check(!request.headers.has('content-length') || Number(request.headers.get('content-length')) <= limit, 'Request is too large.', 413);
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Problem('Request is too large.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Problem('Request must contain valid UTF-8 text.'); }
}

export async function handleCourseRequest(request, suppliedApplication) {
  try {
    const url = new URL(request.url);
    check(local(url), 'Course Studio currently accepts local connections only.', 403);
    const origin = request.headers.get('origin');
    check(!origin || origin === url.origin, 'This request came from a different site.', 403);
    check(request.headers.get('sec-fetch-site') !== 'cross-site', 'Cross-site requests are refused.', 403);
    const app = suppliedApplication ?? await getApplication();
    const method = request.method;
    const route = url.pathname.replace(/^\/api\/course-studio\/?/, '').split('/').filter(Boolean);
    let input;
    if (method === 'POST') {
      check(sameToken(request.headers.get('x-course-token'), token(app)), 'Refresh the page before submitting.', 403);
      check(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'Send JSON content.', 415);
      const raw = await readBody(request, route[0] === 'import' ? 9 * 1024 * 1024 : 65536);
      try { input = JSON.parse(raw); } catch { throw new Problem('Request contains invalid JSON.'); }
      check(input && typeof input === 'object' && !Array.isArray(input), 'Send a JSON object.');
    }
    if (method === 'GET' && route.join('/') === 'state') return json({ ...(await app.learning.snapshot()), version: VERSION, token: token(app) });
    if (method === 'GET' && route.join('/') === 'connection') return json(await app.codex.status());
    if (method === 'GET' && route.join('/') === 'models') return json({ models: await app.codex.models() });
    if (method === 'POST' && route.join('/') === 'login') return json(await app.codex.login(input.method ?? 'device'));
    if (method === 'POST' && route.join('/') === 'settings') return json(await app.setModel(input.model));
    if (method === 'POST' && route.join('/') === 'sample') return json(await app.sample(), 201);
    if (method === 'POST' && route.join('/') === 'generate') return json(await app.generate(input), 202);
    if (method === 'POST' && route.join('/') === 'import') return json(await importLearning(app, input), 201);
    if (method === 'POST' && route.join('/') === 'export') return json(await exportLearning(app, input.courseId));
    if (method === 'POST' && route[0] === 'jobs' && route.length === 3 && route[2] === 'retry') { const s = await app.store.read(); const job = s.jobs.find(j => j.id === route[1]); check(job?.input && ['failed', 'interrupted'].includes(job.status), 'This generation cannot be retried.', 409); return json(await app.generate(job.input), 202); }
    if (method === 'GET' && route[0] === 'jobs' && route.length === 2) { const state = await app.store.read(); const job = state.jobs.find(j => j.id === route[1]); check(job, 'Generation not found.', 404); return json(job); }
    if (method === 'POST' && route.join('/') === 'attempts') return json(await app.learning.attempt(input), 201);
    if (method === 'GET' && route.join('/') === 'review') return json(await app.learning.nextGlobalReview());
    if (route[0] === 'courses' && route[1]) {
      if (method === 'POST' && route.length === 3 && route[2] === 'settings') return json(await app.learning.courseSettings(route[1], input));
      if (method === 'GET' && route.length === 3 && route[2] === 'review') return json(await app.learning.nextReview(route[1]));
      if (method === 'POST' && route.length === 5 && route[2] === 'attempts' && route[4] === 'rate') return json(await app.learning.selfRate(route[1], route[3], input.rating));
      if (method === 'POST' && route.length === 5 && route[2] === 'lessons') {
        if (route[4] === 'visit') return json(await app.learning.visit(route[1], route[3]));
        if (route[4] === 'complete') return json(await app.learning.complete(route[1], route[3]));
        if (route[4] === 'settings') return json(await app.learning.settings(route[1], route[3], input));
      }
    }
    return json({ error: 'Route not found.' }, 404);
  } catch (error) {
    return json({ error: error instanceof Problem ? error.message : 'Something went wrong. Your saved learning data has been preserved.' }, error instanceof Problem ? error.status : 500);
  }
}
