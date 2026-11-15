import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PluginRegistry, registry, projectLesson, lessonScenes, presentationSettings, SLOTS } from '../../public/course-studio/plugin-registry.js';
import { Store } from '../store.mjs';
import { Learning } from '../learning.mjs';
import { sampleCourse } from '../sample.mjs';

test('plugin registry rejects incompatible contracts and collisions without replacing the original', () => {
  const r = new PluginRegistry(); const manifest = { apiVersion: 1, id: 'custom-deck', version: '1.0.0', label: 'Custom deck', slot: 'output', requires: [] };
  const dispose = r.register(manifest, { project: () => 'original' });
  assert.throws(() => r.register(manifest, {}), /already exists/); assert.equal(r.get('output', 'custom-deck').implementation.project(), 'original');
  assert.throws(() => r.register({ ...manifest, id: 'another', apiVersion: 2 }, {}), /incompatible/);
  dispose(); assert.equal(r.get('output', 'custom-deck'), undefined);
});
test('all extension slots are declared and video capability failures preserve readable text', () => {
  assert.equal(SLOTS.length, 8); assert.ok(SLOTS.every(slot => registry.list(slot).length > 0));
  const l = sampleCourse().lessons[0];
  const fallback = projectLesson(l, presentationSettings({ format: 'video' }), []);
  assert.equal(fallback.type, 'text'); assert.match(fallback.warning, /unavailable/); assert.equal(fallback.blocks.length, l.blocks.length);
  const supported = projectLesson(l, presentationSettings({ format: 'video' }), ['canvas', 'media-recorder', 'canvas-stream']);
  assert.equal(supported.type, 'video'); assert.ok(supported.scenes.length > 0);
});
test('output formats project the same lesson without modifying objectives, exercises or source content', () => {
  const lesson = sampleCourse().lessons[0], before = structuredClone(lesson);
  for (const format of ['text', 'slides', 'interactive', 'video']) {
    const output = projectLesson(lesson, presentationSettings({ format }), ['canvas', 'media-recorder', 'canvas-stream']);
    assert.equal(output.type, format); assert.ok(output.plugin.version);
  }
  assert.deepEqual(lesson, before);
});
test('slide scenes preserve explanation text and example-first templates reorder explicit example blocks', () => {
  const lesson = sampleCourse().lessons[0]; lesson.blocks[2].role = 'example';
  const arranged = projectLesson(lesson, presentationSettings({ template: 'example-first' }));
  assert.equal(arranged.blocks[0].text, lesson.blocks[2].text);
  const combined = lessonScenes(lesson).map(x => x.text).join(' ').replace(/\s+/g, ' ');
  assert.ok(combined.includes(lesson.blocks[0].text.replace(/\s+/g, ' ')));
});
test('per-lesson plugin overrides stay sparse, survive restart and preserve all progress', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-plugin-settings-'));
  const store = await new Store(directory).initialize();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  const learning = new Learning(store, { status: async () => ({ connected: false }) });
  const course = sampleCourse(); await learning.add(course); const lesson = course.lessons[0], e = lesson.exercises[0];
  await learning.attempt({ courseId: course.id, lessonId: lesson.id, exerciseId: e.id, requestId: 'plugin-attempt', answer: '', action: 'unknown' });
  await learning.settings(course.id, lesson.id, { format: 'slides' });
  await learning.courseSettings(course.id, { format: 'interactive', template: 'reference' });
  let state = await store.read(); assert.deepEqual(state.progress[course.id].lessonSettings[lesson.id], { format: 'slides' }); assert.equal(state.courses[0].settings.template, 'reference');
  assert.equal(state.progress[course.id].attempts.length, 1); assert.equal(state.progress[course.id].reviews.length, 1);
  await store.close(); const restored = await new Store(directory).initialize();
  state = await restored.read(); assert.equal(state.progress[course.id].lessonSettings[lesson.id].format, 'slides'); await restored.close();
});
test('unknown lesson formats are rejected and restoring inheritance does not delete learning history', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-plugin-invalid-'));
  const store = await new Store(directory).initialize(); t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  const learning = new Learning(store, {}), c = sampleCourse(); await learning.add(c);
  await assert.rejects(learning.settings(c.id, c.lessons[0].id, { format: 'nonexistent' }), /Unsupported format/);
  await learning.settings(c.id, c.lessons[0].id, { format: 'slides' }); await learning.settings(c.id, c.lessons[0].id, { inherit: true });
  assert.equal((await store.read()).progress[c.id].lessonSettings[c.lessons[0].id], undefined);
});
