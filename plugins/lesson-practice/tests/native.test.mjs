import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { activate } = require('../src/backend.cjs');

async function fixture(t, formats = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-native-lessons-')), controller = new AbortController();
  const native = { id: 'native-session', kind: 'teach', tree: { nodes: [{ id: 'recall' }, { id: 'spacing' }] }, messages: [] };
  const questions = new Map(), handlers = new Map(), instructions = [], factories = [], events = new Set();
  const register = (map, key, value) => { map.set(key, value); return () => map.delete(key); };
  const context = { dataDirectory: directory, signal: controller.signal,
    listLessonFormats() { return structuredClone(formats); },
    learning: { getSession(id) { assert.equal(id, native.id); return structuredClone(native); } },
    registerInstructions(value) { instructions.push(value); return () => {}; },
    registerTools(value) { factories.push(value); return () => {}; },
    registerQuestionType(value) { return register(questions, value.id, value); },
    handle(name, handler) { return register(handlers, name, handler); },
    events: { emit() {}, on(listener) { events.add(listener); return () => events.delete(listener); } }
  };
  const stop = activate(context), tools = new Map(factories.flatMap(f => f.create({ chatId: native.id, agent: 'teacher' })).map(tool => [tool.name, tool]));
  const tool = async (name, input) => {
    const details = (await tools.get(name).execute('native-tool-call', input, controller.signal)).details;
    if (name === 'lesson_revisit') {
      const id = 'revisit-' + ++serial;
      native.messages.push({ role: 'assistant', id, content: [{ type: 'toolCall', id, name, arguments: input }] }, { role: 'toolResult', id: id + '-result', toolCallId: id, toolName: name, details, isError: false });
    }
    return details;
  };
  const call = (name, input = {}) => handlers.get(name)(input);
  let serial = 0;
  async function begin(nodeId = 'recall', selected, lessonId = nodeId + '-step') {
    const input = { lessonId, nodeId, title: 'Retrieve an idea', text: 'Try recall before checking feedback.', ...(selected ? { settings: { quizTypes: selected } } : {}) }, details = await tool('lesson_begin', input), id = 'begin-' + ++serial;
    native.messages.push({ role: 'assistant', id, content: [{ type: 'toolCall', id, name: 'lesson_begin', arguments: input }] }, { role: 'toolResult', id: id + '-result', toolCallId: id, toolName: 'lesson_begin', details, isError: false }); return details;
  }
  function pose(type, { nodeId = 'recall', conceptId = nodeId + '-step', review = false } = {}) {
    if (['multiple-choice', 'open'].includes(type)) {
      const id = 'native-call-' + ++serial, name = type === 'multiple-choice' ? 'quiz' : 'explain', input = { type: 'check', nodeId, question: 'What should happen before feedback?', correctAnswer: 'Recall', explanation: 'Retrieval comes first.', ...(name === 'quiz' ? { options: [{ value: 'Recall', label: 'Recall' }, { value: 'Reveal', label: 'Reveal' }] } : {}) };
      native.messages.push({ role: 'assistant', id: 'native-assistant-' + serial, content: [{ type: 'toolCall', id, name, arguments: input }] });
      return { source: 'native', questionId: id, input, occurrence: { toolCallId: id, toolName: name } };
    }
    const definition = questions.get('lesson-' + type), questionId = 'question-' + ++serial, callId = 'call-' + serial, messageId = 'assistant-' + serial;
    const input = { type: 'check', nodeId, question: 'What should happen before checking feedback?', payload: { quizType: type, lessonId: nodeId + '-step', conceptId, reference: 'Recall', explanation: 'Retrieval makes the attempt informative.', options: type === 'multiple-choice' ? ['Recall', 'Reveal'] : [], review } };
    assert.deepEqual(definition.validateQuestion({ chatId: native.id, input }), []);
    const occurrence = { messageId, contentIndex: 0, toolCallId: callId, toolName: definition.teach.toolName };
    const snapshot = { protocolVersion: 2, requiresGrading: true, pluginId: 'lesson-practice', typeId: definition.id, contractVersion: 1, questionId, occurrence, input };
    native.messages.push({ role: 'assistant', id: messageId, content: [{ type: 'toolCall', id: callId, name: definition.teach.toolName, arguments: input }], lhQuestions: { 0: snapshot } });
    return { definition, input, snapshot, occurrence, questionId };
  }
  function accept(posed, answer, { accepted = true, date = new Date().toISOString() } = {}) {
    if (posed.source === 'native') {
      const choice = posed.occurrence.toolName === 'quiz', result = { result: !answer.known ? 'incorrect' : choice ? answer.value === 'Recall' ? 'correct' : 'incorrect' : 'needs-feedback' };
      const message = { role: 'toolResult', id: 'native-answer-' + serial, toolCallId: posed.questionId, toolName: posed.occurrence.toolName, isError: false, details: { kind: choice ? 'quiz' : 'explain', tool: posed.occurrence.toolName, questionText: posed.input.question, dontKnow: !answer.known, answers: choice ? [{ label: answer.value }] : [], ...(choice ? { correct: answer.known && answer.value === 'Recall', explanation: posed.input.explanation } : { text: answer.value, committed: posed.input.correctAnswer }), answeredAt: date } };
      if (choice && answer.confidence !== undefined) message.details.confidence = answer.confidence;
      if (accepted) native.messages.push(message); return { result, message };
    }
    assert.deepEqual(posed.definition.validateAnswer({ input: posed.input, answer }) ?? [], []);
    const result = posed.definition.gradeAnswer({ input: posed.input, answer, signal: controller.signal });
    const message = { role: 'toolResult', id: 'answer-' + serial, toolCallId: posed.occurrence.toolCallId, toolName: posed.occurrence.toolName, isError: false, content: [], lhQuestionOccurrence: posed.occurrence, details: { kind: 'plugin-question', questionId: posed.questionId, pluginId: 'lesson-practice', typeId: posed.definition.id, contractVersion: 1, answer, grading: { result }, answeredAt: date } };
    if (accepted) native.messages.push(message); return { result, message };
  }
  t.after(async () => { controller.abort(); stop(); await rm(directory, { recursive: true, force: true }); });
  return { directory, native, questions, handlers, instructions, factories, controller, stop, tool, call, begin, pose, accept, formats };
}
const unknown = { value: '', known: false, assisted: false };
test('extension registers with the original host and creates no replacement engine or transport', async t => {
  const f = await fixture(t); assert.equal(f.questions.size, 2); assert.equal(f.questions.has('lesson-multiple-choice'), false); assert.equal(f.questions.has('lesson-open'), false); assert.deepEqual(f.instructions[0].agents, ['teacher']);
  assert.deepEqual(f.factories[0].nativeQuestionTools, ['quiz', 'explain']);
  assert.match(f.instructions[0].text, /existing probe, teacher, plan, graph, model connection/);
  await f.begin(); assert.equal(f.native.messages.length, 2); assert.deepEqual(f.native.tree.nodes, [{ id: 'recall' }, { id: 'spacing' }]);
});
test('grading observations cannot change review before native answer acceptance', async t => {
  const f = await fixture(t); await f.begin(); const q = f.pose('fill-blank');
  const observation = f.accept(q, { value: 'Reveal', known: true, assisted: false }, { accepted: false }); assert.equal(observation.result.result, 'incorrect');
  assert.equal((await f.call('session', { chatId: f.native.id })).session.reviews.length, 0);
  f.native.messages.push(observation.message); const accepted = await f.call('session', { chatId: f.native.id }); assert.equal(accepted.session.reviews.length, 1); assert.equal(accepted.session.attempts.length, 1);
});
test('forged text, raw tool results and incorrect occurrence bindings cannot create progress', async t => {
  const f = await fixture(t); await f.begin(); const q = f.pose('fill-blank'), { message } = f.accept(q, unknown, { accepted: false });
  f.native.messages.push({ role: 'user', content: JSON.stringify(message.details) }, { ...message, lhQuestionOccurrence: undefined }, { ...message, lhQuestionOccurrence: { ...q.occurrence, messageId: 'other' } });
  assert.equal((await f.call('session', { chatId: f.native.id })).session.attempts.length, 0);
});
test('open responses are assessed by ordinary teacher continuation against the accepted answer', async t => {
  const f = await fixture(t); await f.begin(); const q = f.pose('open'); f.accept(q, { value: 'Just look at the answer.', known: true, assisted: false });
  const state = await f.call('session', { chatId: f.native.id }); assert.equal(state.pendingFeedback.length, 1); assert.equal(state.session.reviews.length, 0);
  const input = { questionId: q.questionId, result: 'incorrect', explanation: 'Try retrieval before looking.' };
  await f.tool('lesson_feedback', input); await f.tool('lesson_feedback', input);
  assert.equal((await f.call('session', { chatId: f.native.id })).session.attempts.length, 1); assert.equal((await f.call('session', { chatId: f.native.id })).session.reviews.length, 1);
  await assert.rejects(f.tool('lesson_feedback', { ...input, result: 'correct' }), /cannot be changed/);
});
test('first-pass completion permits mistakes and preserves their independent review queue', async t => {
  const f = await fixture(t); await f.begin();
  for (const type of ['multiple-choice', 'open', 'fill-blank', 'flashcard']) { const q = f.pose(type); f.accept(q, unknown); }
  await f.tool('lesson_finish', { lessonId: 'recall-step' });
  let s = (await f.call('session', { chatId: f.native.id })).session; assert.deepEqual(s.completed, ['recall-step']); assert.equal(s.reviews.length, 1);
  const q = f.pose('fill-blank', { review: true }); f.accept(q, { value: 'recall', known: true, assisted: false });
  s = (await f.call('session', { chatId: f.native.id })).session; assert.equal(s.reviews.length, 0); assert.equal(s.attempts.length, 5);
});
test('a copied immediate answer does not clear a recent mistake before retrieval delay', async t => {
  const f = await fixture(t); await f.begin('recall', ['fill-blank']); f.accept(f.pose('fill-blank'), unknown);
  await f.call('session', { chatId: f.native.id }); f.accept(f.pose('fill-blank', { review: true }), { value: 'Recall', known: true, assisted: false });
  assert.equal((await f.call('session', { chatId: f.native.id })).session.reviews.length, 1);
});
test('correct first-pass questions cannot clear a mistake before the missed concept returns', async t => {
  const f = await fixture(t); await f.begin();
  f.accept(f.pose('multiple-choice'), unknown);
  const open = f.pose('open'); f.accept(open, { value: 'Recall', known: true, assisted: false });
  await f.tool('lesson_feedback', { questionId: open.questionId, result: 'correct', explanation: 'Retrieval comes first.' });
  f.accept(f.pose('fill-blank'), { value: 'Recall', known: true, assisted: false });
  f.accept(f.pose('flashcard'), { value: 'good', known: true, assisted: false });
  await f.tool('lesson_finish', { lessonId: 'recall-step' });
  const before = (await f.call('session', { chatId: f.native.id })).session;
  assert.equal(before.reviews.length, 1); assert.equal(before.attempts.length, 4);
  f.accept(f.pose('fill-blank', { review: true }), { value: 'Recall', known: true, assisted: false });
  assert.equal((await f.call('session', { chatId: f.native.id })).session.reviews.length, 0);
});
test('lesson settings reopen coverage when newly selected formats have not been attempted', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']); f.accept(f.pose('multiple-choice'), unknown); await f.tool('lesson_finish', { lessonId: 'recall-step' });
  await f.call('lesson-settings', { chatId: f.native.id, lessonId: 'recall-step', settings: { quizTypes: ['multiple-choice', 'open'], output: 'slides' } });
  const s = await f.call('session', { chatId: f.native.id }); assert.equal(s.session.completed.length, 0); assert.equal(s.session.attempts.length, 1); assert.equal(s.session.lessons[0].settings.output, 'slides');
});
test('native plan IDs and selected question types remain authoritative', async t => {
  const f = await fixture(t); await assert.rejects(f.begin('invented'), /existing native plan/); await f.begin('recall', ['multiple-choice']);
  const definition = f.questions.get('lesson-fill-blank'); assert.match(definition.validateQuestion({ chatId: f.native.id, input: { nodeId: 'recall', payload: {} } })[0], /not selected/);
  await assert.rejects(f.tool('lesson_finish', { lessonId: 'recall-step' }), /every selected quiz format/);
});
test('canonical reconciliation is idempotent and survives plugin restart without regrading', async t => {
  const f = await fixture(t); await f.begin(); f.accept(f.pose('multiple-choice'), unknown); await f.call('session', { chatId: f.native.id });
  const file = path.join(f.directory, 'lessons.json'), before = await readFile(file, 'utf8'); await f.call('session', { chatId: f.native.id }); assert.equal(await readFile(file, 'utf8'), before);
  f.stop(); assert.equal(f.handlers.size, 0);
  assert.equal(JSON.parse(before).sessions[f.native.id].reviews.length, 1);
});
test('single-step lessons can share a coarse native plan node without sharing coverage or mastery', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']); f.accept(f.pose('multiple-choice'), unknown); await f.tool('lesson_finish', { lessonId: 'recall-step' });
  await f.begin('recall', ['multiple-choice'], 'recall-second-step'); f.accept(f.pose('multiple-choice'), { value: 'Recall', known: true, assisted: false });
  const state = (await f.call('session', { chatId: f.native.id })).session;
  assert.equal(state.lessons.length, 2); assert.deepEqual(state.completed, ['recall-step']); assert.equal(state.attempts[1].lessonId, 'recall-second-step'); assert.equal(state.reviews[0].lessonId, 'recall-step');
  assert.equal(f.native.tree.nodes.length, 2);
});
test('contributed choices are validated, snapshotted and retained when their plugin is disabled', async t => {
  const formats = [{ pluginId: 'example', key: 'example:reflection', format: { kind: 'workflow', id: 'reflection', label: 'Reflect', instructions: 'Try before reading.', explanation: 'after-first-answer' } }];
  const f = await fixture(t, formats);
  await f.call('save-settings', { workflow: 'example:reflection' });
  const result = await f.begin('recall', ['fill-blank']); assert.equal(result.showExplanation, false);
  assert.equal(result.lesson.formats[0].key, 'example:reflection'); formats.length = 0;
  await f.call('lesson-settings', { chatId: f.native.id, lessonId: 'recall-step', settings: { output: 'slides' } });
  const saved = (await f.call('session', { chatId: f.native.id })).session.lessons[0];
  assert.equal(saved.settings.workflow, 'example:reflection'); assert.equal(saved.formats[0].format.explanation, 'after-first-answer');
  await assert.rejects(f.begin('spacing'), /unavailable/);
  await assert.rejects(async () => f.call('save-settings', { output: 'example:reflection' }), /output plugin is unavailable/);
});
test('an already posed contributed quiz survives deselection and uses its committed reference for ordinary teacher feedback', async t => {
  const formats = [{ pluginId: 'example', key: 'example:custom', format: { kind: 'quiz', id: 'custom', label: 'Custom', questionTypeId: 'custom', instructions: 'Use the committed reference.' } }];
  const f = await fixture(t, formats); await f.begin('recall', ['example:custom']);
  const input = { type: 'check', nodeId: 'recall', question: 'What should happen first?', payload: { lessonId: 'recall-step', lessonFormat: 'example:custom', reference: 'Recall', explanation: 'Try retrieval first.', review: false } };
  const occurrence = { messageId: 'custom-assistant', contentIndex: 0, toolCallId: 'custom-call', toolName: 'custom_question' };
  const snapshot = { protocolVersion: 2, pluginId: 'example', typeId: 'custom', contractVersion: 3, questionId: 'custom-question', occurrence, input };
  const result = { role: 'toolResult', id: 'custom-result', toolCallId: occurrence.toolCallId, toolName: occurrence.toolName, isError: false, lhQuestionOccurrence: occurrence, details: { kind: 'plugin-question', pluginId: 'example', typeId: 'custom', contractVersion: 3, questionId: 'custom-question', answer: { value: 'Look at the answer.', known: true, assisted: false }, grading: { result: { score: 0.2, reference: 'An uncommitted replacement' } }, answeredAt: new Date().toISOString() } };
  f.native.messages.push({ role: 'assistant', id: occurrence.messageId, content: [{ type: 'toolCall', id: occurrence.toolCallId, name: occurrence.toolName, arguments: input }], lhQuestions: { 0: snapshot } });
  await f.call('lesson-settings', { chatId: f.native.id, lessonId: 'recall-step', settings: { quizTypes: ['fill-blank'] } });
  f.native.messages.push({ ...result, lhQuestionOccurrence: { ...occurrence, messageId: 'another-assistant' } });
  assert.equal((await f.call('session', { chatId: f.native.id })).pendingFeedback.length, 0);
  f.native.messages.push(result);
  const waiting = await f.call('session', { chatId: f.native.id }); assert.equal(waiting.pendingFeedback.length, 1); assert.equal(waiting.pendingFeedback[0].reference, 'Recall');
  await f.tool('lesson_feedback', { questionId: 'custom-question', result: 'incorrect', explanation: 'Recall before looking.' });
  f.accept(f.pose('fill-blank'), { value: 'Recall', known: true, assisted: false });
  await f.tool('lesson_finish', { lessonId: 'recall-step' });
  const assessed = (await f.call('session', { chatId: f.native.id })).session;
  assert.equal(assessed.attempts[0].provenance, 'teacher'); assert.equal(assessed.reviews.length, 1);
});
test('native confidence is saved, backfilled from accepted evidence and retained through restart without regrading', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']);
  f.accept(f.pose('multiple-choice'), { value: 'Recall', known: true, confidence: 95 });
  let snapshot = await f.call('session', { chatId: f.native.id });
  assert.equal(snapshot.session.attempts[0].confidence, 95); assert.equal(snapshot.learningSignals[0].signal, 'secure');
  assert.equal(snapshot.reinforce.length, 0); assert.equal(snapshot.session.reviews.length, 0);
  const file = path.join(f.directory, 'lessons.json'), stored = JSON.parse(await readFile(file, 'utf8'));
  const original = structuredClone(stored.sessions[f.native.id].attempts[0]);
  const { learningSignals, reconcile } = require('../src/domain.cjs');
  const legacy = structuredClone(stored.sessions[f.native.id]); delete legacy.attempts[0].confidence; delete legacy.attempts[0].optionCount; delete legacy.attempts[0].known; delete legacy.attempts[0].review;
  reconcile(legacy, f.native); assert.deepEqual(legacy.attempts[0], original);
  assert.equal(learningSignals(stored.sessions[f.native.id]).signals[0].confidence, 95);
  assert.equal(legacy.sequence, 1); assert.equal(legacy.attempts.length, 1);
});
test('a hesitant correct answer suggests one delayed reinforcement without becoming a mistake', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']);
  f.accept(f.pose('multiple-choice'), { value: 'Recall', known: true, confidence: 50 });
  let snapshot = await f.call('session', { chatId: f.native.id });
  assert.equal(snapshot.learningSignals[0].signal, 'fragile'); assert.equal(snapshot.reinforce[0].due, false);
  assert.equal(snapshot.session.attempts[0].result, 'correct'); assert.equal(snapshot.session.reviews.length, 0);
  await assert.rejects(f.tool('lesson_revisit', { lessonId: 'recall-step' }), /due reinforcement/);
  await f.tool('lesson_finish', { lessonId: 'recall-step' });
  snapshot = await f.tool('lesson_status', {}); assert.equal(snapshot.reinforce[0].due, true);
  await f.tool('lesson_revisit', { lessonId: 'recall-step' });
  f.accept(f.pose('multiple-choice'), { value: 'Recall', known: true, confidence: 50 });
  snapshot = await f.call('session', { chatId: f.native.id });
  assert.equal(snapshot.session.attempts[1].review, true); assert.equal(snapshot.reinforce.length, 0);
  assert.equal(snapshot.learningSignals[0].signal, 'fragile'); assert.equal(snapshot.session.reviews.length, 0);
});
test('confident mistakes lead due reviews without being erased by correct first-pass answers', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']);
  f.accept(f.pose('multiple-choice'), { value: 'Reveal', known: true, confidence: 20 });
  await f.tool('lesson_finish', { lessonId: 'recall-step' });
  await f.begin('spacing', ['multiple-choice']);
  f.accept(f.pose('multiple-choice', { nodeId: 'spacing' }), { value: 'Reveal', known: true, confidence: 100 });
  await f.tool('lesson_finish', { lessonId: 'spacing-step' });
  f.accept(f.pose('multiple-choice', { nodeId: 'spacing' }), { value: 'Recall', known: true, confidence: 100 });
  const snapshot = await f.tool('lesson_status', {});
  assert.equal(snapshot.learningSignals[0].signal, 'possible-misconception');
  assert.equal(snapshot.learningSignals[0].confidence, 100); assert.equal(snapshot.due[0].lessonId, 'spacing-step');
  assert.equal(snapshot.missed.length, 2); assert.equal(snapshot.covered.length, 2);
});
test('missing, invalid and declined confidence never becomes an invented learning signal', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']);
  for (const confidence of [undefined, NaN, Infinity, -1, 101, '95']) f.accept(f.pose('multiple-choice'), { value: 'Recall', known: true, confidence });
  f.accept(f.pose('multiple-choice'), { value: '', known: false, confidence: 100 });
  const snapshot = await f.call('session', { chatId: f.native.id });
  assert(snapshot.session.attempts.every(a => !('confidence' in a))); assert.equal(snapshot.learningSignals[0].signal, 'gap');
  assert.equal(snapshot.reinforce.length, 0);
});
test('visible correction reads the accepted committed answer without regrading or clearing review', async t => {
  const f = await fixture(t); await f.begin('recall', ['multiple-choice']);
  const question = f.pose('multiple-choice');
  await assert.rejects(f.tool('lesson_correction', { questionId: question.questionId }), /accepted lesson answer/);
  f.accept(question, { value: 'Reveal', known: true, confidence: 100 });
  const before = await f.call('session', { chatId: f.native.id });
  const correction = await f.tool('lesson_correction', { questionId: question.questionId });
  assert.equal(correction.reference, 'Recall'); assert.equal(correction.explanation, question.input.explanation); assert.equal(correction.result, 'incorrect');
  const after = await f.call('session', { chatId: f.native.id });
  assert.deepEqual(after.session.attempts, before.session.attempts); assert.deepEqual(after.session.reviews, before.session.reviews);
  const right = f.pose('multiple-choice'); f.accept(right, { value: 'Recall', known: true });
  await assert.rejects(f.tool('lesson_correction', { questionId: right.questionId }), /needing correction/);
});
