'use strict';
exports.activate = function activate(ctx) {
  if (!ctx.registerLessonFormat) throw new Error('This example requires the LearnHarness lesson extension API.');
  const off = [], string = { type: 'string', minLength: 1, maxLength: 6000 };
  off.push(ctx.registerQuestionType({ id: 'numeric', label: 'Numeric response', contractVersion: 1, showThinking: true,
    teach: { toolName: 'lesson_numeric', description: 'Ask a numeric question in a selected lesson. Commit a finite numeric reference, lessonId, explanation and review flag before learner input.' },
    questionSchema: { type: 'object', properties: { lessonId: { ...string, maxLength: 128 }, lessonFormat: { const: 'lesson-formats:numeric' }, reference: string, explanation: string, review: { type: 'boolean' } }, required: ['lessonId', 'lessonFormat', 'reference', 'explanation', 'review'], additionalProperties: false },
    answerSchema: { type: 'object', properties: { value: { type: 'string', maxLength: 200 }, known: { type: 'boolean' }, assisted: { type: 'boolean' } }, required: ['value', 'known', 'assisted'], additionalProperties: false },
    validateQuestion({ input }) { return input.type === 'check' && input.payload.reference.trim() && Number.isFinite(Number(input.payload.reference)) ? [] : ['Commit a finite numeric answer for this lesson check.']; },
    validateAnswer({ answer }) { return !answer.known || (answer.value.trim() && Number.isFinite(Number(answer.value))) ? [] : ['Enter a finite number, or choose I don’t know.']; },
    gradeAnswer({ input, answer }) { const reference = Number(input.payload.reference); return { result: answer.known && Math.abs(Number(answer.value) - reference) <= 1e-9 * Math.max(1, Math.abs(reference)) ? 'correct' : 'incorrect', provenance: 'numeric-answer-key', assisted: answer.assisted, reference: input.payload.reference, explanation: input.payload.explanation }; }
  }));
  for (const format of [
    { kind: 'quiz', id: 'numeric', label: 'Numeric response', questionTypeId: 'numeric', instructions: 'Use lesson_numeric for a calculation with a finite numeric reference. Keep lessonId, lessonFormat=lesson-formats:numeric, explanation and review in its payload. Do not force numeric questions onto nonnumeric material.' },
    { kind: 'workflow', id: 'reflection', label: 'Reflect, then learn', explanation: 'after-first-answer', instructions: 'Ask the learner to predict or reason through one question before revealing the explanation. Then use lesson_show, give feedback and complete the remaining selected questions. Retain mistakes for later review.' },
    { kind: 'output', id: 'deck', label: 'Slide deck', language: 'lesson-deck', instructions: 'Write the lesson as a few small slides separated by a line containing ---. Preserve Markdown, math and diagram fences within each slide.' },
    { kind: 'diagram', id: 'flow', label: 'Flow diagram', language: 'lesson-flow', instructions: 'Use a lesson-flow fence containing JSON {"nodes":[{"id":"a","label":"Start"},{"id":"b","label":"Next"}],"edges":[["a","b"]]}. Use at most 12 short labelled nodes. This renderer draws real SVG arrows.' }
  ]) off.push(ctx.registerLessonFormat(format));
  return () => { for (const dispose of off.reverse()) dispose(); };
};
