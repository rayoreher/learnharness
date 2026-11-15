// Run the actual pinned LearnHarness backend plugin host, with fresh records
// and inert model services. This does not run Next or prove model sequencing.
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

assert.equal(process.env.LH_NATIVE_HOST_ISOLATED, '1', 'Run only in the reviewed credential-free isolation.');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const { createPluginHost } = await import(pathToFileURL(path.join(process.env.LH_NATIVE_HOST_CORE, '../server/plugin-host.ts')));
const root = await mkdtemp(path.join(os.tmpdir(), 'lh-original-host-'));
const native = { id: 'native-session', kind: 'teach', tree: { nodes: [{ id: 'recall' }] }, messages: [] };
const listeners = new Set(); let disposeCount = 0;
const host = createPluginHost({ directory: path.join(root, 'plugins'), appVersion: '0.6.1',
  core: { directory: path.join(root, 'core-plugins'), dataDirectory: path.join(root, 'core-plugin-data'), ids: ['lesson-practice'] },
  createServices() {
    return { learning: { getSession(id) { assert.equal(id, native.id); return structuredClone(native); } },
      inference: new Proxy({}, { get() { throw new Error('No model or account service belongs in this host lifecycle check.'); } }),
      agents: { async dispose() { disposeCount++; } }, workers: { async dispose() { disposeCount++; } },
      createBackgroundTool() { throw new Error('Unexpected background task.'); } };
  },
  subscribeEvents(listener) { listeners.add(listener); return () => listeners.delete(listener); }
});
try {
  await cp('/tmp/plugin/dist', path.join(root, 'core-plugins/lesson-practice'), { recursive: true });
  await host.initialize();
  assert.equal(host.list().find(p => p.id === 'lesson-practice').status, 'disabled');
  assert.equal(host.agentContributions({ chatId: native.id, agent: 'teacher' }, ['quiz', 'explain']).tools.length, 0);
  await host.setEnabled('lesson-practice', true);
  const enabled = host.list().find(p => p.id === 'lesson-practice');
  assert.equal(enabled.status, 'active', enabled.error);
  const contribution = host.agentContributions({ chatId: native.id, agent: 'teacher' }, ['quiz', 'explain']);
  assert.equal(contribution.tools.length, 6); assert.equal(contribution.questionTypes.length, 2);
  assert.equal(contribution.instructions.length, 1);
  assert.deepEqual(contribution.questionTypes.map(q => q.definition.id).sort(), ['lesson-fill-blank', 'lesson-flashcard']);
  assert.equal(host.agentContributions({ chatId: native.id, agent: 'prober' }, []).tools.length, 0);
  const begin = contribution.tools.find(t => t.name === 'lesson_begin');
  await begin.execute('start', { lessonId: 'recall-step', nodeId: 'recall', title: 'Recall', text: 'Retrieve an idea before revealing it.' });
  await host.call('lesson-practice', 'lesson-settings', { chatId: native.id, lessonId: 'recall-step', settings: { quizTypes: ['fill-blank'], output: 'slides' } });
  const activeQuestion = host.resolveQuestionType('lesson-practice', 'lesson-fill-blank', 1);
  assert.equal(activeQuestion.status, 'available'); activeQuestion.requireActive();
  assert.equal(host.asset('lesson-practice', ['main.js']).contentType, 'text/javascript; charset=utf-8');
  console.log('PASS original host discovers the built Core package, enables it and admits its native teaching tools and question types');

  await host.setEnabled('lesson-practice', false);
  assert.equal(activeQuestion.signal.aborted, true); assert.throws(() => activeQuestion.requireActive());
  assert.equal(host.resolveQuestionType('lesson-practice', 'lesson-fill-blank', 1).status, 'unavailable');
  assert.equal(host.agentContributions({ chatId: native.id, agent: 'teacher' }, []).tools.length, 0);
  await assert.rejects(host.call('lesson-practice', 'get-settings'), /disabled|unavailable/);
  await assert.rejects(begin.execute('expired', {}), /disabled|unavailable/);
  assert.equal(listeners.size, 0);
  await host.setEnabled('lesson-practice', true);
  const saved = await host.call('lesson-practice', 'session', { chatId: native.id });
  assert.equal(saved.session.lessons[0].settings.output, 'slides');
  assert.deepEqual(saved.session.lessons[0].settings.quizTypes, ['fill-blank']);
  const file = path.join(root, 'core-plugin-data/lesson-practice/lessons.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).sessions[native.id].lessons.length, 1);
  console.log('PASS native disable aborts registrations and stale tools; re-enabling restores plugin-owned lesson settings');
} finally {
  await host.dispose(); assert.equal(listeners.size, 0); assert.equal(disposeCount, 4);
  await rm(root, { recursive: true, force: true });
}
