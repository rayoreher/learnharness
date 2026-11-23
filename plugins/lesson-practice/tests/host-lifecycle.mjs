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
const questions = await import(pathToFileURL(path.join(process.env.LH_NATIVE_HOST_CORE, 'plugin-questions.ts')));
const root = await mkdtemp(path.join(os.tmpdir(), 'lh-original-host-'));
const native = { id: 'native-session', kind: 'teach', tree: { nodes: [{ id: 'recall' }] }, messages: [] };
const listeners = new Set(); let disposeCount = 0, completed = false;
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
  await cp('/example', path.join(root, 'plugins/lesson-formats/dist'), { recursive: true });
  await host.initialize();
  assert.equal(host.list().find(p => p.id === 'lesson-practice').status, 'disabled');
  assert.equal(host.agentContributions({ chatId: native.id, agent: 'teacher' }, ['quiz', 'explain']).tools.length, 0);
  await host.setEnabled('lesson-practice', true);
  const enabled = host.list().find(p => p.id === 'lesson-practice');
  assert.equal(enabled.status, 'active', enabled.error);
  const contribution = host.agentContributions({ chatId: native.id, agent: 'teacher' }, ['quiz', 'explain']);
  assert.deepEqual(contribution.nativeQuestionTools, ['quiz', 'explain']);
  assert.equal(contribution.tools.length, 7); assert.equal(contribution.questionTypes.length, 2);
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

  await host.setEnabled('lesson-formats', true);
  assert.equal(host.list().find(p => p.id === 'lesson-formats').status, 'active');
  const formats = host.listLessonFormats(); assert.equal(formats.length, 4);
  formats[0].format.instructions = 'Modified detached copy';
  assert.notEqual(host.listLessonFormats()[0].format.instructions, 'Modified detached copy');
  assert.equal((await host.call('lesson-practice', 'formats')).length, 4);
  const input = { lessonId: 'extensions', nodeId: 'recall', title: 'Addition', text: 'Two plus two is four.', settings: { quizTypes: ['lesson-formats:numeric'], workflow: 'lesson-formats:reflection', output: 'lesson-formats:deck', visual: 'lesson-formats:flow' } };
  const created = await begin.execute('custom-start', input); assert.equal(created.details.showExplanation, false); assert.equal(created.details.lesson.formats.length, 4);
  const numeric = host.resolveQuestionType('lesson-formats', 'numeric', 1); assert.equal(numeric.status, 'available');
  let counter = 0;
  async function answerNumber(value, review = false) {
    const questionId = 'numeric-' + ++counter, messageId = 'assistant-' + counter, toolName = 'lesson_numeric';
    const input = { type: 'check', nodeId: 'recall', question: 'What is two plus two?', payload: { lessonId: 'extensions', lessonFormat: 'lesson-formats:numeric', reference: '4', explanation: 'Combine two pairs.', review } };
    assert.equal(questions.validatePluginQuestionInput(numeric.definition, { chatId: native.id, variant: 'teach', input }).ok, true);
    const occurrence = { messageId, contentIndex: 0, toolCallId: questionId, toolName };
    const snapshot = { protocolVersion: 2, requiresGrading: true, requiresAnswerRefinement: true, pluginId: 'lesson-formats', typeId: 'numeric', contractVersion: 1, label: 'Numeric response', variant: 'teach', questionId, occurrence, input, questionSchema: numeric.definition.questionSchema, answerSchema: numeric.definition.answerSchema, showThinking: true };
    const answer = { value, known: true, assisted: false };
    assert.equal(questions.validatePluginQuestionAnswer(snapshot, { chatId: native.id, answer }, numeric.definition).ok, true);
    const grading = { result: numeric.definition.gradeAnswer({ chatId: native.id, input, answer }) };
    native.messages.push({ role: 'assistant', id: messageId, content: [{ type: 'toolCall', id: questionId, name: toolName, arguments: input }], lhQuestions: { 0: snapshot } },
      { role: 'toolResult', id: 'result-' + counter, toolCallId: questionId, toolName, isError: false, lhQuestionOccurrence: occurrence, details: { kind: 'plugin-question', pluginId: 'lesson-formats', typeId: 'numeric', contractVersion: 1, questionId, answer, grading, answeredAt: new Date().toISOString() } });
  }
  await answerNumber('5');
  const status = await host.call('lesson-practice', 'session', { chatId: native.id }); assert.equal(status.session.reviews.length, 1); assert.equal(status.session.attempts[0].quizType, 'lesson-formats:numeric');
  const correction = await contribution.tools.find(t => t.name === 'lesson_correction').execute('correct-numeric', { questionId: 'numeric-1' });
  assert.equal(correction.details.reference, '4'); assert.equal(correction.details.explanation, 'Combine two pairs.');
  assert.deepEqual((await host.call('lesson-practice', 'session', { chatId: native.id })).session.reviews, status.session.reviews);
  await contribution.tools.find(t => t.name === 'lesson_finish').execute('finish', { lessonId: 'extensions' });
  await answerNumber('4', true);
  assert.equal((await host.call('lesson-practice', 'session', { chatId: native.id })).session.reviews.length, 0);
  await host.setEnabled('lesson-formats', false); assert.equal(host.listLessonFormats().length, 0);
  const retained = await host.call('lesson-practice', 'session', { chatId: native.id }); assert.equal(retained.session.lessons[1].formats.length, 4); assert.equal(retained.session.attempts.length, 2);
  await assert.rejects(begin.execute('unavailable', { ...input, lessonId: 'unavailable' }), /unavailable/);
  await host.setEnabled('lesson-formats', true); assert.equal(host.listLessonFormats().length, 4);
  console.log('PASS a separate native plugin contributes all four format categories; accepted numeric answers enter and clear the lesson review loop; disabled choices retain saved content');

  await host.setEnabled('lesson-practice', false);
  assert.equal(host.agentContributions({ chatId: native.id, agent: 'teacher' }, []).nativeQuestionTools, undefined);
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
  assert.equal(JSON.parse(await readFile(file, 'utf8')).sessions[native.id].lessons.length, 2);
  console.log('PASS native disable aborts registrations and stale tools; re-enabling restores plugin-owned lesson settings');
  completed = true;
} finally {
  await host.dispose(); assert.equal(listeners.size, 0); if (completed) assert.equal(disposeCount, 8);
  await rm(root, { recursive: true, force: true });
}
