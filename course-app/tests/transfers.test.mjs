import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApplication } from '../application.mjs';
import { importLearning, exportLearning, prepareSource } from '../transfers.mjs';
import { sampleCourse } from '../sample.mjs';
import { validateCourse } from '../schema.mjs';
import { validateDiagram, diagramLayout, diagramText, diagramMermaid, diagramSVG } from '../../public/course-studio/diagrams.js';
import { slideDocument, lessonMarkdown } from '../../public/course-studio/exports.js';

async function fixture(t, codex = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-transfers-'));
  const app = await createApplication({ directory, codex: { status: async () => ({ connected: false }), close: async () => {}, ...codex } });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); }); return app;
}
test('source preparation retains text as data, bounds bytes and strips unknown fields', () => {
  const source = prepareSource({ kind: 'markdown', name: 'Notes.md', content: '# Heading\r\nA useful idea.', unexpected: 'not retained' });
  assert.equal(source.content, '# Heading\nA useful idea.'); assert.equal(source.digest.length, 64); assert.equal(source.unexpected, undefined);
  assert.throws(() => prepareSource({ kind: 'text', name: 'Large', content: 'x'.repeat(24001) }), /24 KB/);
  assert.throws(() => prepareSource({ kind: 'text', name: 'Binary', content: '\0data' }), /UTF-8 text/);
});
test('source-aware generation retains its source and can retry an interrupted input explicitly', async t => {
  let received, fail = true;
  const app = await fixture(t, { course: async input => { received = input; if (fail) throw new Error('Failed model'); return sampleCourse(); } });
  const input = { goal: 'Understand recall', types: ['open'], source: { kind: 'text', name: 'Recall notes', content: 'Try retrieval before looking at an answer.' } };
  const job = await app.generate(input); await app.runningJob;
  let state = await app.store.read(); assert.equal(state.jobs[0].status, 'failed'); assert.equal(state.jobs[0].input.source.name, 'Recall notes');
  fail = false; await app.generate(state.jobs.find(j => j.id === job.id).input); await app.runningJob;
  state = await app.store.read(); assert.equal(received.source.content, input.source.content); assert.equal(state.courses[0].source.digest, received.source.digest);
});
test('course exports import as independent content without copying mastery', async t => {
  const app = await fixture(t), course = sampleCourse(); await app.learning.add(course);
  const exported = await exportLearning(app, course.id); const result = await importLearning(app, { kind: 'course', data: exported });
  assert.notEqual(result.courses[0].id, course.id); const state = await app.store.read(); assert.equal(state.courses.length, 2); assert.equal(state.progress[result.courses[0].id].attempts.length, 0);
  assert.equal(state.courses[1].lessons[0].exercises[0].answer, course.lessons[0].exercises[0].answer);
});
test('workspace backup restores progress atomically and excludes account configuration', async t => {
  const app = await fixture(t), course = sampleCourse(); await app.learning.add(course); const e = course.lessons[0].exercises[0];
  await app.learning.attempt({ courseId: course.id, lessonId: course.lessons[0].id, exerciseId: e.id, requestId: 'backup-answer', action: 'unknown', answer: '' });
  await app.learning.settings(course.id, course.lessons[0].id, { format: 'slides' });
  await app.store.transact(s => { s.settings.syntheticCredential = 'private-auth-marker'; });
  const backup = await exportLearning(app); assert.doesNotMatch(JSON.stringify(backup), /private-auth-marker/); assert.equal(backup.settings, undefined);
  const restored = await importLearning(app, { kind: 'workspace', data: backup }); const id = restored.courses[0].id, s = await app.store.read();
  assert.equal(s.progress[id].attempts.length, 1); assert.equal(s.progress[id].attempts[0].imported, true); assert.equal(s.progress[id].reviews.length, 1); assert.equal(s.progress[id].lessonSettings[course.lessons[0].id].format, 'slides'); assert.equal(s.courses.length, 2);
});
test('malformed backup cannot partially add courses or destroy existing records', async t => {
  const app = await fixture(t), course = sampleCourse(); await app.learning.add(course);
  const backup = await exportLearning(app); const corrupt = structuredClone(backup.courses[0]); corrupt.progress.completedLessons = ['missing']; backup.courses.push(corrupt);
  await assert.rejects(importLearning(app, { kind: 'workspace', data: backup }), /missing lessons/);
  assert.equal((await app.store.read()).courses.length, 1);
});
test('MindSpark import preserves each mechanic and treats short readings as lesson content', async t => {
  const app = await fixture(t);
  const data = { title: 'Recall', question: 'How should practice work?', answer: 'Try to recall first, then check feedback.', tips: ['Try before reveal'], quiz: {
    open_questions: [{ question: 'Explain recall.', answer: 'Retrieval from memory.' }], multiple_choice_questions: [{ question: 'Which comes first?', answers: [{ text: 'Try', is_correct: true }, { text: 'Reveal', is_correct: false }] }], fill_in_the_blank: [{ question: 'Practice _____ an answer.', answers: [{ text: 'before revealing', is_correct: true }, { text: 'only by reading', is_correct: false }] }], flashcards: [{ front: 'Recall', back: 'Retrieve an idea.' }], micro_reels: [{ text: 'A short reminder.' }]
  } };
  const imported = await importLearning(app, { kind: 'mindspark', data }); const c = imported.courses[0];
  assert.deepEqual(c.lessons[0].exercises.map(e => e.type), ['open', 'multiple-choice', 'fill-blank', 'flashcard']); assert.ok(c.lessons[0].blocks.some(b => b.text === 'A short reminder.'));
  assert.equal((await app.store.read()).progress[c.id].attempts.length, 0);
});
test('MindSpark questions with multiple reference choices retain them in an open rubric', async t => {
  const app = await fixture(t); const result = await importLearning(app, { kind: 'mindspark', data: { title: 'Two properties', answer: 'A and B are both properties.', quiz: { multiple_choice_questions: [{ question: 'Which properties apply?', answers: [{ text: 'A', is_correct: true }, { text: 'B', is_correct: true }] }] } } });
  const stored = (await app.store.read()).courses.find(c => c.id === result.courses[0].id); assert.equal(stored.lessons[0].exercises[0].type, 'open'); assert.equal(stored.lessons[0].exercises[0].answer, 'A; B');
});
test('diagram validation refuses dangling edges and layout terminates for feedback cycles', () => {
  const d = sampleCourse().lessons[0].blocks.find(b => b.type === 'diagram').diagram;
  const layout = diagramLayout(d); assert.equal(layout.nodes.length, d.nodes.length); assert.ok(layout.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))); assert.ok(layout.width > 0 && layout.height > 0);
  assert.throws(() => validateDiagram({ nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'missing' }] }), /known nodes/);
  assert.match(diagramText(d), /Read feedback/); assert.match(diagramMermaid(d), /flowchart LR/);
  const c = sampleCourse(); c.lessons[0].blocks.find(b => b.type === 'diagram').text = ''; assert.equal(validateCourse(c).lessons[0].blocks.find(b => b.type === 'diagram').text, 'Flow diagram');
});
test('exported slides and SVG escape authored labels and contain no executable lesson markup', () => {
  const lesson = sampleCourse().lessons[0]; lesson.title = '</h1><script>alert(1)</script>';
  const diagram = { nodes: [{ id: 'a', label: '<script>alert(1)</script>' }], edges: [] };
  const svg = diagramSVG(diagram); assert.doesNotMatch(svg, /<script>/); assert.match(svg, /&lt;script&gt;/);
  const html = slideDocument(lesson); assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/); assert.match(html, /<svg/); assert.match(html, /default-src 'none'/);
});
test('Markdown export retains diagrams and code fences without truncating content', () => {
  const lesson = sampleCourse().lessons[0]; lesson.blocks.push({ type: 'code', text: 'a ``` nested fence' }); const markdown = lessonMarkdown(lesson);
  assert.match(markdown, /```mermaid/); assert.match(markdown, /````\na ``` nested fence\n````/); assert.ok(markdown.includes(lesson.blocks[0].text));
});
