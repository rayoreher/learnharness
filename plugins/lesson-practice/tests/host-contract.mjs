// Explicit integration check against a reviewed, pinned native helper closure.
// This is not a replacement for running the complete original application.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
const core = process.env.LH_NATIVE_HOST_CORE;
assert.ok(core, 'Point LH_NATIVE_HOST_CORE at the reviewed native src/core directory.');
const native = await import(pathToFileURL(path.join(core, 'plugin-questions.ts')));
const { parsePluginManifest } = await import(pathToFileURL(path.join(core, 'plugins.ts')));
const { validatePluginSchema } = await import(pathToFileURL(path.join(core, 'plugin-validation.ts')));
const questionCore = await import(pathToFileURL(path.join(core, 'question-core.ts')));
const { activate } = createRequire(import.meta.url)('../src/backend.cjs');
const { learningResponses } = createRequire(import.meta.url)('../src/domain.cjs');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(parsePluginManifest(manifest, 'lesson-practice', '0.6.1').id, 'lesson-practice');
const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-real-contract-')), abort = new AbortController(), definitions = new Map(), factories = [];
const record = { id: 'test-session', tree: { nodes: [{ id: 'recall' }] }, messages: [] };
const stop = activate({ signal: abort.signal, dataDirectory: directory,
  learning: { getSession: () => record }, registerInstructions: () => () => {}, registerTools: contribution => { factories.push(contribution); return () => {}; },
  registerQuestionType: definition => { const prepared = native.preparePluginQuestionType(definition); definitions.set(prepared.id, prepared); return () => definitions.delete(prepared.id); },
  handle: () => () => {}, events: { emit() {}, on: () => () => {} }
});
try {
  const tools = factories[0].create({ chatId: record.id, agent: 'teacher' });
  for (const tool of tools) validatePluginSchema(tool.parameters);
  const beginInput = { lessonId: 'recall-step', nodeId: 'recall', title: 'Recall', text: 'Retrieve before checking.' };
  const beginning = await tools.find(t => t.name === 'lesson_begin').execute('start', beginInput, abort.signal);
  record.messages.push({ role: 'assistant', id: 'beginning', content: [{ type: 'toolCall', id: 'start', name: 'lesson_begin', arguments: beginInput }] }, { role: 'toolResult', id: 'begin-result', toolCallId: 'start', toolName: 'lesson_begin', details: beginning.details, isError: false });
  for (const [id, definition] of definitions) {
    const type = id.slice('lesson-'.length), input = { type: 'check', nodeId: 'recall', question: 'What comes before feedback?', payload: { quizType: type, lessonId: 'recall-step', conceptId: 'recall-step', reference: 'Recall', explanation: 'Retrieval comes first.', options: type === 'multiple-choice' ? ['Recall', 'Reveal'] : [], review: false } };
    const checked = native.validatePluginQuestionInput(definition, { chatId: record.id, variant: 'teach', input }); assert.equal(checked.ok, true, JSON.stringify(checked));
    const snapshot = { protocolVersion: 2, requiresGrading: true, pluginId: 'lesson-practice', typeId: id, label: definition.label, variant: 'teach', contractVersion: 1, questionId: 'real-' + type,
      occurrence: { messageId: 'assistant', contentIndex: 0, toolCallId: 'call', toolName: definition.teach.toolName }, input,
      questionSchema: definition.questionSchema, answerSchema: definition.answerSchema, showThinking: true, requiresAnswerRefinement: true };
    const answer = { value: type === 'flashcard' ? 'good' : 'Recall', known: true, assisted: false };
    const accepted = native.validatePluginQuestionAnswer(snapshot, { chatId: record.id, answer }, definition); assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(native.validatePluginQuestionAnswer(snapshot, { chatId: record.id, answer: { ...answer, injected: true } }, definition).ok, false);
    if (type === 'multiple-choice') assert.equal(native.validatePluginQuestionAnswer(snapshot, { chatId: record.id, answer: { ...answer, value: 'Not an option' } }, definition).ok, false);
    console.log('PASS original LearnHarness validation:', id);
  }
  const options = questionCore.shuffleOptions(questionCore.normalizeOptions([{ value: 'recall', label: 'Retrieve the idea' }, { value: 'reveal', label: 'Read the answer' }]), questionCore.seededRandom('native-order'));
  const authored = { type: 'check', nodeId: 'recall', question: 'What comes first?', correctAnswer: 'recall', explanation: 'Retrieve before revealing.', options: [{ value: 'recall', label: 'Retrieve the idea' }, { value: 'reveal', label: 'Read the answer' }] };
  const choice = questionCore.buildAnswer({ id: 'original-quiz', kind: 'quiz', questionType: 'check', question: authored.question, mode: 'single-select', options, correctIndices: questionCore.resolveCorrect('recall', options).indices, explanation: authored.explanation, createdAt: new Date().toISOString() }, { values: ['recall'], confidence: 70 }, 'quiz');
  assert.equal(choice.correct, true); assert.equal(choice.confidence, 70);
  record.messages.push({ role: 'assistant', id: 'original-quiz-message', content: [{ type: 'toolCall', id: 'original-quiz', name: 'quiz', arguments: authored }] }, { role: 'toolResult', id: 'original-quiz-answer', toolCallId: 'original-quiz', toolName: 'quiz', details: choice, isError: false });
  const open = questionCore.buildAnswer({ id: 'original-explain', kind: 'explain', questionType: 'check', question: 'Why retrieve first?', mode: 'text', options: [], committedAnswer: 'It tests what memory can produce.', createdAt: new Date().toISOString() }, { text: 'It checks my memory.' }, 'explain');
  record.messages.push({ role: 'assistant', id: 'original-explain-message', content: [{ type: 'toolCall', id: 'original-explain', name: 'explain', arguments: { type: 'check', nodeId: 'recall', question: 'Why retrieve first?', correctAnswer: open.committed } }] }, { role: 'toolResult', id: 'original-explain-answer', toolCallId: 'original-explain', toolName: 'explain', details: open, isError: false });
  const responses = learningResponses(record); assert.equal(responses.length, 2); assert.equal(responses[0].source, 'native'); assert.equal(responses[0].grading.result.result, 'correct'); assert.equal(responses[0].reference, 'Retrieve the idea'); assert.equal(responses[1].quizType, 'open'); assert.equal(responses[1].reference, open.committed); assert.equal(responses[1].grading.result.result, 'needs-feedback');
  console.log('PASS reuse of original native quiz shuffle/confidence/grading and explain commitment records.');
  console.log('PASS native plugin manifest, tool schemas, saved question contracts and answer refinement.');
} finally { abort.abort(); stop(); await rm(directory, { recursive: true, force: true }); }
