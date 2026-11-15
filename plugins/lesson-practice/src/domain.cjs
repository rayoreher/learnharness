'use strict';

const PLUGIN_ID = 'lesson-practice';
const TYPES = ['multiple-choice', 'open', 'fill-blank', 'flashcard'];
const contributedKey = value => typeof value === 'string' && value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const defaults = () => ({ workflow: 'lesson-quiz', output: 'text', visual: 'mermaid', quizTypes: [...TYPES] });
function assert(value, message) { if (!value) throw new Error(message); }
function text(value, label, max = 12000) { assert(typeof value === 'string' && value.trim() && value.length <= max, `${label} is missing or too long.`); return value.trim(); }
function settings(input = {}, previous = defaults()) {
  const next = { ...previous, ...input };
  assert(['lesson-quiz', 'practice-first'].includes(next.workflow) || contributedKey(next.workflow), 'Choose a supported lesson workflow.');
  assert(['text', 'slides', 'video'].includes(next.output) || contributedKey(next.output), 'Choose a supported lesson output.');
  assert(['mermaid', 'ascii'].includes(next.visual) || contributedKey(next.visual), 'Choose a supported diagram format.');
  assert(Array.isArray(next.quizTypes) && next.quizTypes.length && next.quizTypes.length <= 32 && new Set(next.quizTypes).size === next.quizTypes.length && next.quizTypes.every(t => TYPES.includes(t) || contributedKey(t)), 'Choose at least one supported quiz format.');
  return { workflow: next.workflow, output: next.output, visual: next.visual, quizTypes: [...next.quizTypes] };
}
function emptySession() { return { lessons: [], completed: [], feedback: {}, attempts: [], reviews: [], sequence: 0 }; }
function sameOccurrence(a, b) { return a && b && ['messageId', 'contentIndex', 'toolCallId', 'toolName'].every(k => a[k] === b[k]); }

// Read accepted native results only. Text that happens to resemble an answer,
// raw tool arguments and temporary pose acknowledgements confer no authority.
function acceptedAnswers(record, owner = PLUGIN_ID) {
  const poses = new Map(), accepted = [], seen = new Set();
  for (const message of record?.messages ?? []) {
    if (message.role === 'assistant' && message.lhQuestions) {
      for (const [index, snapshot] of Object.entries(message.lhQuestions)) {
        const call = message.content?.[Number(index)], occurrence = snapshot?.occurrence;
        if ((owner && snapshot?.pluginId !== owner) || typeof snapshot?.pluginId !== 'string' || typeof snapshot.typeId !== 'string' || !Number.isSafeInteger(snapshot.contractVersion) || snapshot.contractVersion < 1 || !snapshot.questionId || !occurrence || ![1, 2].includes(snapshot.protocolVersion)) continue;
        if (call?.type !== 'toolCall' || occurrence.messageId !== message.id || occurrence.contentIndex !== Number(index) || occurrence.toolCallId !== call.id || occurrence.toolName !== call.name) continue;
        poses.set(snapshot.questionId, snapshot);
      }
    }
    const answer = message.details, snapshot = poses.get(answer?.questionId);
    if (message.role !== 'toolResult' || message.isError || !snapshot || answer?.kind !== 'plugin-question' || answer.pluginId !== snapshot.pluginId || answer.typeId !== snapshot.typeId || answer.contractVersion !== snapshot.contractVersion || !sameOccurrence(message.lhQuestionOccurrence, snapshot.occurrence) || message.toolCallId !== snapshot.occurrence.toolCallId || message.toolName !== snapshot.occurrence.toolName || seen.has(answer.questionId)) continue;
    if (!Number.isFinite(Date.parse(answer.answeredAt))) continue;
    seen.add(answer.questionId); accepted.push({ snapshot, answer });
  }
  return accepted;
}
function learningResponses(record, formats = []) {
  const messages = record?.messages ?? [], calls = new Map(), duplicates = new Set(), native = [];
  for (const message of messages) if (message.role === 'assistant') for (const call of message.content ?? []) if (call.type === 'toolCall') {
    if (calls.has(call.id)) duplicates.add(call.id); else calls.set(call.id, call);
  }
  let lesson = null, reviewing = false;
  for (const message of messages) {
    if (message.role !== 'toolResult' || message.isError || duplicates.has(message.toolCallId)) continue;
    const call = calls.get(message.toolCallId); if (!call || call.name !== message.toolName) continue;
    if (call.name === 'lesson_begin' && message.details?.lesson?.id === call.arguments?.lessonId && message.details.lesson.nodeId === call.arguments?.nodeId) { lesson = message.details.lesson; reviewing = false; continue; }
    if (call.name === 'lesson_revisit' && message.details?.lessonContext?.lessonId === call.arguments?.lessonId) { lesson = { id: message.details.lessonContext.lessonId, nodeId: message.details.lessonContext.nodeId }; reviewing = true; continue; }
    if (!lesson || !['quiz', 'explain'].includes(call.name) || call.arguments?.nodeId !== lesson.nodeId || call.arguments?.type !== 'check') continue;
    const data = message.details;
    if (data?.kind !== (call.name === 'quiz' ? 'quiz' : 'explain') || data.dismissed || typeof data.dontKnow !== 'boolean' || !Array.isArray(data.answers) || data.questionText !== call.arguments.question || !Number.isFinite(Date.parse(data.answeredAt))) continue;
    if (call.name === 'quiz' && typeof data.correct !== 'boolean') continue;
    const references = Array.isArray(call.arguments.correctAnswer) ? call.arguments.correctAnswer : [call.arguments.correctAnswer];
    const reference = call.name === 'explain' ? data.committed : references.map(value => call.arguments.options?.find(o => o.value === value)?.label ?? value).join('; ');
    if (typeof reference !== 'string' || !reference.trim()) continue;
    native.push({ source: 'native', questionId: call.id, lessonId: lesson.id, nodeId: lesson.nodeId, conceptId: lesson.id, quizType: call.name === 'quiz' ? 'multiple-choice' : 'open', question: call.arguments.question, reference, explanation: data.explanation ?? '', review: reviewing,
      answer: { value: data.text ?? data.answers.map(a => a.label ?? a.value ?? '').join('; '), known: !data.dontKnow, assisted: false }, answeredAt: data.answeredAt,
      grading: { result: { result: data.dontKnow ? 'incorrect' : call.name === 'quiz' ? data.correct ? 'correct' : 'incorrect' : 'needs-feedback', provenance: call.name === 'quiz' ? 'native-quiz' : 'teacher' } } });
  }
  const plugin = acceptedAnswers(record, null).flatMap(({ snapshot, answer }) => {
    const p = snapshot.input?.payload;
    if (snapshot.input?.type !== 'check' || !p || typeof p.lessonId !== 'string' || typeof p.reference !== 'string' || !p.reference.trim() || p.reference.length > 6000 || typeof p.explanation !== 'string' || p.explanation.length > 6000 || typeof p.review !== 'boolean') return [];
    const own = snapshot.pluginId === PLUGIN_ID;
    const format = own ? null : formats.find(f => f.key === p.lessonFormat && f.pluginId === snapshot.pluginId && f.format.kind === 'quiz' && f.format.questionTypeId === snapshot.typeId && f.lessonId === p.lessonId && f.nodeId === snapshot.input.nodeId);
    if (!own && !format) return [];
    if (own && (!['fill-blank', 'flashcard'].includes(p.quizType) || snapshot.typeId !== `lesson-${p.quizType}`)) return [];
    const observation = answer.grading?.result;
    const grading = ['correct', 'incorrect', 'partial', 'needs-feedback'].includes(observation?.result) ? answer.grading : { result: { result: 'needs-feedback', provenance: snapshot.pluginId } };
    return [{ source: 'plugin', questionId: answer.questionId, lessonId: p.lessonId, nodeId: snapshot.input.nodeId, conceptId: own ? p.conceptId : p.lessonId, quizType: own ? p.quizType : format.key,
      question: snapshot.input.question, reference: p.reference, explanation: p.explanation, review: p.review, answer: own ? answer.answer : { value: typeof answer.answer?.value === 'string' ? answer.answer.value : JSON.stringify(answer.answer), known: answer.answer?.known !== false, assisted: answer.answer?.assisted === true || observation?.assisted === true }, answeredAt: answer.answeredAt, grading }];
  });
  const order = new Map(messages.map((message, index) => [message.details?.questionId ?? message.toolCallId, index]));
  return [...native, ...plugin].sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0));
}
const normalize = value => String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
function grade(type, input, answer) {
  const payload = input.payload;
  let result, provenance = type === 'flashcard' ? 'self-assessment' : 'answer-key';
  if (!answer.known) result = 'incorrect';
  else if (type === 'open') { result = 'needs-feedback'; provenance = 'teacher'; }
  else if (type === 'flashcard') { result = answer.value === 'good' ? 'correct' : 'incorrect'; provenance = 'self-assessment'; }
  else result = (type === 'multiple-choice' ? answer.value === payload.reference : normalize(answer.value) === normalize(payload.reference)) ? 'correct' : 'incorrect';
  return { result, provenance, reference: payload.reference, explanation: payload.explanation, assisted: answer.assisted === true };
}
function reconcile(session, record, now = Date.now()) {
  const previous = new Map(session.attempts.map(a => [a.questionId, a]));
  const responses = learningResponses(record, session.lessons.flatMap(lesson => (lesson.formats ?? []).map(format => ({ ...format, lessonId: lesson.id, nodeId: lesson.nodeId }))));
  for (const response of responses) {
    if (previous.has(response.questionId)) continue;
    const outcome = session.feedback[response.questionId] ?? response.grading?.result;
    if (!session.lessons.some(l => l.id === response.lessonId && l.nodeId === response.nodeId && l.id === response.conceptId) || !outcome || !['correct', 'incorrect', 'partial'].includes(outcome.result)) continue;
    const attempt = { questionId: response.questionId, lessonId: response.lessonId, nodeId: response.nodeId, conceptId: response.conceptId, quizType: response.quizType, result: outcome.result, provenance: outcome.provenance ?? 'teacher', assisted: response.answer?.assisted === true, answeredAt: response.answeredAt, sequence: ++session.sequence };
    session.attempts.push(attempt); previous.set(attempt.questionId, attempt);
    const queued = session.reviews.find(r => r.conceptId === attempt.conceptId);
    if (attempt.result === 'correct' && !attempt.assisted) {
      if (queued && response.review === true && (attempt.sequence >= queued.dueAfter || Date.parse(attempt.answeredAt) >= queued.dueAt || session.completed.includes(queued.lessonId))) session.reviews = session.reviews.filter(r => r !== queued);
    } else {
      const next = { conceptId: attempt.conceptId, lessonId: attempt.lessonId, nodeId: attempt.nodeId, questionId: attempt.questionId, dueAfter: attempt.sequence + 2, dueAt: Date.parse(attempt.answeredAt) + 30000 };
      if (queued) Object.assign(queued, next); else session.reviews.push(next);
    }
  }
  return { due: session.reviews.filter(r => session.sequence >= r.dueAfter || now >= r.dueAt || session.completed.includes(r.lessonId)), pendingFeedback: responses.filter(r => !previous.has(r.questionId)).map(r => ({ questionId: r.questionId, question: r.question, reference: r.reference, response: r.answer })) };
}
function beginLesson(session, record, input, globalSettings, formats = []) {
  assert(record?.tree?.nodes?.some(n => n.id === input.nodeId), 'Use an existing native plan node ID.');
  const id = text(input.lessonId, 'Lesson ID', 128); assert(/^[a-zA-Z0-9_-]+$/.test(id), 'Use a simple stable lesson ID.');
  const existing = session.lessons.find(l => l.id === id);
  const next = { id, nodeId: input.nodeId, title: text(input.title, 'Lesson title', 200), text: text(input.text, 'Lesson explanation'), settings: settings(input.settings, globalSettings) };
  if (existing) { assert(existing.nodeId === next.nodeId && existing.title === next.title && existing.text === next.text, 'This lesson is already committed; keep its explanation and native node identity.'); return existing; }
  next.formats = structuredClone(formats.filter(f => [next.settings.workflow, next.settings.output, next.settings.visual, ...next.settings.quizTypes].includes(f.key)));
  session.lessons.push(next); return next;
}
function completeLesson(session, record, lessonId) {
  reconcile(session, record);
  const lesson = session.lessons.find(l => l.id === lessonId); assert(lesson, 'Start this lesson first.');
  assert(lesson.settings.quizTypes.every(t => session.attempts.some(a => a.lessonId === lessonId && a.quizType === t)), 'Try every selected quiz format and finish feedback before continuing.');
  if (!session.completed.includes(lessonId)) session.completed.push(lessonId);
}
module.exports = { PLUGIN_ID, TYPES, assert, text, defaults, settings, emptySession, sameOccurrence, acceptedAnswers, learningResponses, grade, reconcile, beginLesson, completeLesson };
