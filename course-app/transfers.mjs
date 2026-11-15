import { createHash } from 'node:crypto';
import { check, validateCourse, publicCourse, text, exerciseTypes } from './schema.mjs';
import { emptyProgress } from './learning.mjs';
import { registry, presentationSettings } from '../public/course-studio/plugin-registry.js';

export function prepareSource(input) {
  const plugin = registry.get('source', input?.kind);
  check(plugin && typeof plugin.implementation.prepare === 'function', 'Choose a supported text or Markdown source.');
  let source; try { source = plugin.implementation.prepare(input); } catch (e) { check(false, e.message); }
  check(source && typeof source.content === 'string' && new TextEncoder().encode(source.content).length <= 24000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source.content), 'The source plugin returned invalid or oversized text.');
  return { kind: input.kind, name: text(source.name, 'Source name', 200), content: source.content, digest: createHash('sha256').update(source.content).digest('hex') };
}
function normalizedCourse(raw) {
  const c = validateCourse(raw);
  if (raw.source) c.source = prepareSource(raw.source);
  return c;
}
function restoredProgress(raw, course) {
  check(raw && typeof raw === 'object', 'Backup progress is missing.');
  const base = emptyProgress(), lessons = new Map(course.lessons.map(l => [l.id, l])), exercises = new Map(course.lessons.flatMap(l => l.exercises.map(e => [e.id, { exercise: e, lesson: l }])));
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 8640000000000000;
  check(Array.isArray(raw.completedLessons) && raw.completedLessons.every(id => lessons.has(id)), 'Backup completion refers to missing lessons.');
  base.completedLessons = [...new Set(raw.completedLessons)];
  check(raw.lastLessonId === null || lessons.has(raw.lastLessonId), 'Backup resume position is invalid.'); base.lastLessonId = raw.lastLessonId;
  check(Array.isArray(raw.attempts) && raw.attempts.length <= 50000, 'Backup answer history is too large.');
  let sequence = 0; const attemptIds = new Set(), receipts = new Set();
  base.attempts = raw.attempts.map(a => {
    const target = exercises.get(a?.exerciseId);
    check(target && target.lesson.id === a.lessonId && Number.isSafeInteger(a.sequence) && a.sequence > sequence && finite(a.createdAt) && ['correct', 'incorrect', 'partial', 'pending'].includes(a.result), 'Backup answer references or sequence are invalid.');
    sequence = a.sequence;
    const id = text(a.id, 'Attempt ID', 100), receipt = text(a.requestId, 'Receipt', 100);
    check(!attemptIds.has(id) && !receipts.has(receipt), 'Backup answer identities are duplicated.'); attemptIds.add(id); receipts.add(receipt);
    const bounded = (value, limit) => { check(typeof value === 'string' && value.length <= limit, 'Backup answer text is invalid.'); return value; };
    check(a.selfRating === undefined || ['again', 'good'].includes(a.selfRating), 'Backup self-assessment is invalid.');
    check(a.result !== 'pending' || a.grader === 'self-assessment', 'Pending backup answers need a supported self-assessment.');
    return { id, requestId: receipt, lessonId: a.lessonId, exerciseId: a.exerciseId, conceptIds: target.exercise.conceptIds, answer: bounded(a.answer, 10000), result: a.result, grader: text(a.grader, 'Grader', 100), ...(a.graderVersion ? { graderVersion: text(a.graderVersion, 'Grader version', 40) } : {}), feedback: bounded(a.feedback, 10000), solution: bounded(a.solution, 6000), explanation: bounded(a.explanation, 6000), assisted: a.assisted === true, createdAt: a.createdAt, sequence: a.sequence, context: a.context === 'review' ? 'review' : 'lesson', ...(a.selfRating ? { selfRating: a.selfRating } : {}), imported: true };
  });
  check(Number.isSafeInteger(raw.sequence) && raw.sequence >= sequence, 'Backup sequence is invalid.'); base.sequence = raw.sequence;
  const concepts = new Map(course.lessons.flatMap(l => l.objectives.map(o => [o.id, l.id])));
  const schedule = (list, retention) => {
    check(Array.isArray(list) && list.length <= concepts.size, 'Backup review schedule is invalid.'); const seen = new Set();
    return list.map(r => {
      check(r && concepts.get(r.conceptId) === r.lessonId && exercises.get(r.exerciseId)?.lesson.id === r.lessonId && !seen.has(r.conceptId) && finite(r.dueAt), 'Backup review references are invalid.'); seen.add(r.conceptId);
      const result = { conceptId: r.conceptId, lessonId: r.lessonId, exerciseId: r.exerciseId, dueAt: r.dueAt, successes: Number.isSafeInteger(r.successes) && r.successes >= 0 ? r.successes : 0 };
      if (!retention) { check(Number.isSafeInteger(r.dueAfter) && r.dueAfter >= 0 && Number.isSafeInteger(r.failures) && r.failures >= 0, 'Backup review counters are invalid.'); Object.assign(result, { dueAfter: r.dueAfter, failures: r.failures, allowBoundary: r.allowBoundary !== false }); }
      return result;
    });
  };
  base.reviews = schedule(raw.reviews, false); base.retention = schedule(raw.retention ?? [], true);
  base.lastReviewAt = finite(raw.lastReviewAt) ? raw.lastReviewAt : 0;
  check(raw.lessonSettings && typeof raw.lessonSettings === 'object' && !Array.isArray(raw.lessonSettings), 'Backup lesson settings are invalid.');
  for (const [id, value] of Object.entries(raw.lessonSettings)) {
    check(lessons.has(id) && value && typeof value === 'object' && !Array.isArray(value), 'Backup settings refer to an invalid lesson.');
    let presentation; try { presentation = presentationSettings(value, course.settings); } catch (e) { check(false, e.message); }
    base.lessonSettings[id] = {};
    for (const key of ['format', 'workflow', 'template', 'visual', 'review']) if (value[key] !== undefined) base.lessonSettings[id][key] = presentation[key];
    if (value.exerciseTypes !== undefined) { const types = exerciseTypes(value.exerciseTypes); check(lessons.get(id).exercises.some(e => types.includes(e.type)), 'Backup selection has no usable exercises.'); base.lessonSettings[id].exerciseTypes = types; }
  }
  return base;
}
export async function importLearning(app, input) {
  check(['course', 'mindspark', 'workspace'].includes(input.kind), 'Choose a supported import type.');
  if (input.kind === 'workspace') {
    const data = input.data; check(data?.format === 'learnharness-workspace' && data.version === 1 && Array.isArray(data.courses) && data.courses.length <= 100, 'Unsupported workspace backup.');
    // Validate the entire restore before committing any record. Import appends
    // independent course identities and never overwrites current learning.
    const prepared = data.courses.map(entry => { const course = normalizedCourse(entry.course); return { course, progress: restoredProgress(entry.progress, course) }; });
    return app.store.transact(s => { for (const entry of prepared) { s.courses.push(entry.course); s.progress[entry.course.id] = entry.progress; } return { imported: prepared.length, courses: prepared.map(e => publicCourse(e.course)) }; });
  }
  let raw = input.data;
  if (input.kind === 'mindspark') {
    const adapter = registry.get('source', 'mindspark'); check(adapter, 'MindSpark importer is unavailable.');
    try { raw = adapter.implementation.prepare(input.data); } catch (e) { check(false, e.message); }
  } else if (raw?.format === 'learnharness-course' && raw.version === 1) raw = raw.course;
  const course = normalizedCourse(raw); await app.learning.add(course); return { imported: 1, courses: [publicCourse(course)] };
}
export async function exportLearning(app, courseId) {
  const s = await app.store.read();
  if (courseId) { const c = s.courses.find(c => c.id === courseId); check(c, 'Course not found.', 404); return { format: 'learnharness-course', version: 1, course: c }; }
  return { format: 'learnharness-workspace', version: 1, exportedAt: new Date().toISOString(), courses: s.courses.map(course => ({ course, progress: s.progress[course.id] })) };
}
