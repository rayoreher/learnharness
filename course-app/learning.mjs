import { randomUUID } from 'node:crypto';
import { check, text, exerciseTypes, publicCourse, publicExercise } from './schema.mjs';
import { presentationSettings, registry } from '../public/course-studio/plugin-registry.js';

export function emptyProgress() { return { completedLessons: [], lastLessonId: null, attempts: [], reviews: [], retention: [], sequence: 0, lessonSettings: {}, lastReviewAt: 0 }; }
export class Learning {
  constructor(store, codex, clock = () => Date.now()) { this.store = store; this.codex = codex; this.clock = clock; this.inflight = new Map(); }
  locate(state, courseId, lessonId, exerciseId) {
    const course = state.courses.find(c => c.id === courseId); check(course, 'Course not found.', 404);
    const lesson = course.lessons.find(l => l.id === lessonId); check(lesson, 'Lesson not found.', 404);
    const exercise = exerciseId ? lesson.exercises.find(e => e.id === exerciseId) : null; if (exerciseId) check(exercise, 'Exercise not found.', 404);
    return { course, lesson, exercise, progress: state.progress[courseId] };
  }
  async add(course) { return this.store.transact(s => { check(s.courses.length < 100, 'This workspace supports up to 100 learning paths.'); s.courses.push(course); s.progress[course.id] = emptyProgress(); return publicCourse(course); }); }
  async courseSettings(courseId, value) {
    return this.store.transact(s => {
      const course = s.courses.find(c => c.id === courseId); check(course, 'Course not found.', 404);
      const selected = exerciseTypes(value.exerciseTypes ?? course.settings.exerciseTypes);
      let presentation; try { presentation = presentationSettings(value, course.settings); } catch (e) { check(false, e.message); }
      const p = s.progress[course.id];
      check(course.lessons.every(l => l.exercises.some(e => (p.lessonSettings[l.id]?.exerciseTypes ?? selected).includes(e.type))), 'Some lessons have no exercises in these formats. Choose another mix or set a lesson override.');
      course.settings = { exerciseTypes: selected, ...presentation }; return publicCourse(course);
    });
  }
  async snapshot() {
    const s = await this.store.read();
    return { courses: s.courses.map(publicCourse), progress: s.progress, jobs: s.jobs.map(({ prompt, ...job }) => job), settings: s.settings };
  }
  async settings(courseId, lessonId, value) {
    return this.store.transact(s => {
      const { course, progress } = this.locate(s, courseId, lessonId);
      if (value.inherit === true) { delete progress.lessonSettings[lessonId]; return progress; }
      const previous = { ...course.settings, ...progress.lessonSettings[lessonId] };
      const selected = exerciseTypes(value.exerciseTypes ?? previous.exerciseTypes);
      check(course.lessons.find(l => l.id === lessonId).exercises.some(e => selected.includes(e.type)), 'This lesson has no exercises of the selected types.');
      let presentation; try { presentation = presentationSettings(value, previous); } catch (e) { check(false, e.message); }
      const overrides = { ...progress.lessonSettings[lessonId] };
      if (value.exerciseTypes !== undefined) overrides.exerciseTypes = selected;
      for (const key of ['format', 'workflow', 'template', 'visual', 'review']) if (value[key] !== undefined) overrides[key] = presentation[key];
      progress.lessonSettings[lessonId] = overrides; return progress;
    });
  }
  async visit(courseId, lessonId) { return this.store.transact(s => { const { progress } = this.locate(s, courseId, lessonId); progress.lastLessonId = lessonId; return progress; }); }
  async complete(courseId, lessonId) {
    return this.store.transact(s => {
      const { course, lesson, progress } = this.locate(s, courseId, lessonId);
      const types = progress.lessonSettings[lessonId]?.exerciseTypes ?? course.settings.exerciseTypes;
      const selected = lesson.exercises.filter(e => types.includes(e.type));
      check(selected.length > 0 && selected.every(e => progress.attempts.some(a => a.exerciseId === e.id)), 'Try each selected exercise before completing this lesson.');
      if (!progress.completedLessons.includes(lessonId)) progress.completedLessons.push(lessonId);
      return progress;
    });
  }
  async attempt(input) {
    text(input.requestId, 'Request ID', 100);
    check(typeof input.answer === 'string' && input.answer.length <= 10000, 'Answer must be text of at most 10000 characters.');
    check(typeof input.assisted === 'boolean' || input.assisted === undefined, 'Invalid assistance marker.');
    check(input.context === undefined || ['lesson', 'review'].includes(input.context), 'Unsupported answer context.');
    const fingerprint = JSON.stringify([input.lessonId, input.exerciseId, input.answer, input.action, input.assisted === true, input.context ?? 'lesson']);
    const key = `${input.courseId}:${input.requestId}`;
    const pending = this.inflight.get(key);
    if (pending) { check(pending.fingerprint === fingerprint, 'Request ID already belongs to a different answer.', 409); return pending.work; }
    const work = this.makeAttempt(input, fingerprint).finally(() => this.inflight.delete(key)); this.inflight.set(key, { fingerprint, work }); return work;
  }
  async makeAttempt(input, fingerprint) {
    const s = await this.store.read();
    const { course, exercise, lesson, progress } = this.locate(s, input.courseId, input.lessonId, input.exerciseId);
    const existing = progress.attempts.find(a => a.requestId === input.requestId);
    if (existing) { check(existing.exerciseId === exercise.id && existing.lessonId === lesson.id && (existing.fingerprint ? existing.fingerprint === fingerprint : existing.answer === input.answer), 'Request ID already belongs to another answer.', 409); return existing; }
    check(typeof input.answer === 'string' && input.answer.length <= 10000, 'Answer must be text of at most 10000 characters.');
    check(['answer', 'unknown', 'reveal'].includes(input.action), 'Unsupported answer action.');
    const mechanic = registry.get('exercise', exercise.type)?.implementation;
    check(mechanic, 'The exercise plugin is unavailable. Existing answers have been preserved.', 409);
    let result = 'incorrect', feedback = exercise.explanation, grader = mechanic.grader;
    if (input.action !== 'unknown') {
      if (input.action === 'reveal') check(['recall', 'text'].includes(mechanic.input), 'This exercise requires an answer.');
      if (mechanic.input === 'recall') check(input.action === 'reveal', 'Reveal and self-rate this flashcard.');
      else text(input.answer, 'Your answer', 10000);
      if (mechanic.input === 'choice') check(exercise.options.includes(input.answer), 'Choose an available answer.');
      if (mechanic.input === 'ordered') {
        let order; try { order = JSON.parse(input.answer); } catch { check(false, 'Arrange the items before submitting.'); }
        check(Array.isArray(order) && order.length === exercise.options.length && new Set(order).size === order.length && order.every(x => exercise.options.includes(x)), 'Submit every ordering item exactly once.');
      }
      if (input.action === 'reveal' || (grader === 'codex-rubric' && !(await this.codex.status()).connected)) grader = 'self-assessment';
      const provider = registry.get('grader', grader);
      const capabilities = [];
      if (provider?.manifest.requires.includes('codex-chatgpt') && (await this.codex.status()).connected) capabilities.push('codex-chatgpt');
      check(provider && provider.manifest.requires.every(r => capabilities.includes(r)), 'The requested grading plugin needs an unavailable capability.', 409);
      const assessor = provider.implementation.grade;
      check(typeof assessor === 'function', 'The requested grading plugin is unavailable.', 409);
      const grade = await assessor({ exercise: structuredClone(exercise), answer: input.answer }, { assess: (e, answer) => this.codex.grade(e, answer) });
      check(grade && (['correct', 'partial', 'incorrect'].includes(grade.result) || (grader === 'self-assessment' && grade.result === 'pending')) && typeof grade.feedback === 'string' && grade.feedback.length <= 10000, 'The grader returned an invalid assessment.', 502);
      result = grade.result; feedback = grade.feedback;
    }
    return this.store.transact(state => {
      const current = this.locate(state, input.courseId, input.lessonId, input.exerciseId).progress;
      const saved = current.attempts.find(a => a.requestId === input.requestId); if (saved) { check(!saved.fingerprint || saved.fingerprint === fingerprint, 'Request ID already belongs to another answer.', 409); return saved; }
      const attempt = { id: randomUUID(), requestId: input.requestId, fingerprint, action: input.action, context: input.context ?? 'lesson', lessonId: lesson.id, exerciseId: exercise.id, conceptIds: exercise.conceptIds, answer: input.answer, result, grader, graderVersion: registry.get('grader', grader)?.manifest.version, feedback, solution: exercise.answer, explanation: exercise.explanation, assisted: input.assisted === true, createdAt: this.clock(), sequence: ++current.sequence };
      current.attempts.push(attempt); current.lastLessonId = lesson.id;
      if (attempt.context === 'review') current.lastReviewAt = this.clock();
      this.updateReview(current, attempt, this.reviewPolicy(course, lesson.id, current)); return attempt;
    });
  }
  reviewPolicy(course, lessonId, progress) {
    return registry.get('review', progress.lessonSettings[lessonId]?.review ?? course.settings.review ?? 'session')?.implementation ?? registry.get('review', 'session').implementation;
  }
  reviewDue(progress, item) { return progress.sequence >= item.dueAfter || this.clock() >= item.dueAt || (item.allowBoundary !== false && progress.completedLessons.includes(item.lessonId)); }
  updateReview(progress, attempt, policy = registry.get('review', 'session').implementation) {
    progress.retention ??= [];
    for (const conceptId of attempt.conceptIds) {
      const queued = progress.reviews.find(r => r.conceptId === conceptId);
      if (attempt.result === 'pending' && queued) continue;
      if (attempt.result === 'correct' && !attempt.assisted) {
        if (queued && this.reviewDue(progress, queued)) {
          queued.successes = (queued.successes ?? 0) + 1;
          if (queued.successes >= policy.requiredCorrect) progress.reviews = progress.reviews.filter(r => r !== queued);
          else { queued.dueAfter = progress.sequence + policy.delayAttempts; queued.dueAt = this.clock() + policy.delayMs; queued.allowBoundary = false; }
        }
        if (policy.spacedDays) {
          const past = progress.retention.find(r => r.conceptId === conceptId), successes = (past?.successes ?? 0) + 1;
          const spaced = { conceptId, lessonId: attempt.lessonId, exerciseId: attempt.exerciseId, successes, dueAt: this.clock() + policy.spacedDays[Math.min(successes - 1, policy.spacedDays.length - 1)] * 86400000 };
          if (past) Object.assign(past, spaced); else progress.retention.push(spaced);
        }
      } else {
        const item = { conceptId, lessonId: attempt.lessonId, exerciseId: attempt.exerciseId, dueAfter: progress.sequence + policy.delayAttempts, dueAt: this.clock() + policy.delayMs, failures: (queued?.failures ?? 0) + (attempt.result === 'pending' ? 0 : 1), successes: 0, allowBoundary: true };
        if (queued) Object.assign(queued, item); else progress.reviews.push(item);
        const retention = progress.retention.find(r => r.conceptId === conceptId); if (retention && attempt.result !== 'pending') { retention.successes = 0; retention.dueAt = this.clock() + 86400000; }
      }
    }
  }
  async selfRate(courseId, attemptId, rating) {
    check(['again', 'good'].includes(rating), 'Choose whether you recalled the answer.');
    return this.store.transact(s => {
      const p = s.progress[courseId]; check(p, 'Course not found.', 404);
      const attempt = p.attempts.find(a => a.id === attemptId); check(attempt && attempt.grader === 'self-assessment', 'Self-assessment not available.', 404);
      if (attempt.result !== 'pending') { check(attempt.selfRating === rating, 'This answer was already rated differently.', 409); return attempt; }
      attempt.result = rating === 'good' ? 'correct' : 'incorrect'; attempt.selfRating = rating;
      // A pending reveal is provisional: rating Good must use the pre-reveal queue,
      // rather than turning the provisional entry into a fresh failed retrieval.
      for (const conceptId of attempt.conceptIds) {
        const queue = p.reviews.find(r => r.conceptId === conceptId);
        if (rating === 'good' && !attempt.assisted && queue?.failures === 0) p.reviews = p.reviews.filter(r => r !== queue);
      }
      const c = s.courses.find(c => c.id === courseId);
      this.updateReview(p, attempt, this.reviewPolicy(c, attempt.lessonId, p)); return attempt;
    });
  }
  async nextReview(courseId) {
    const state = await this.store.read(); const c = state.courses.find(x => x.id === courseId); check(c, 'Course not found.', 404);
    const p = state.progress[courseId];
    const activeRetention = (p.retention ?? []).filter(r => this.reviewPolicy(c, r.lessonId, p).spacedDays);
    const spaced = activeRetention.filter(r => r.dueAt <= this.clock() && !p.reviews.some(q => q.conceptId === r.conceptId));
    const remaining = p.reviews.length + spaced.length;
    const item = p.reviews.find(r => this.reviewDue(p, r)) ?? spaced[0];
    if (!item) return { question: null, remaining, waiting: p.reviews.length > 0, scheduled: activeRetention.length };
    const lesson = c.lessons.find(l => l.id === item.lessonId);
    const candidates = lesson.exercises.filter(e => e.conceptIds.includes(item.conceptId));
    const exercise = candidates.find(e => e.id !== item.exerciseId) ?? candidates[0];
    return { question: { ...publicExercise(exercise), lessonId: lesson.id, lessonTitle: lesson.title, conceptId: item.conceptId }, remaining, waiting: false, scheduled: activeRetention.length };
  }
  async nextGlobalReview() {
    const state = await this.store.read(); const candidates = [...state.courses].sort((a, b) => (state.progress[a.id].lastReviewAt ?? 0) - (state.progress[b.id].lastReviewAt ?? 0));
    let selected = null, remaining = 0, scheduled = 0;
    for (const course of candidates) { const next = await this.nextReview(course.id); remaining += next.remaining; scheduled += next.scheduled ?? 0; if (!selected && next.question) selected = { courseId: course.id, ...next }; }
    return { ...(selected ?? { courseId: null, question: null }), remaining, scheduled, waiting: !selected && remaining > 0 };
  }
}
