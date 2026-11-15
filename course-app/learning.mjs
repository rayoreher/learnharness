import { randomUUID } from 'node:crypto';
import { check, text, exerciseTypes, publicCourse, publicExercise } from './schema.mjs';
import { presentationSettings } from '../public/course-studio/plugin-registry.js';

const normalize = value => value.normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
export function emptyProgress() { return { completedLessons: [], lastLessonId: null, attempts: [], reviews: [], sequence: 0, lessonSettings: {} }; }
export class Learning {
  constructor(store, codex, clock = () => Date.now()) { this.store = store; this.codex = codex; this.clock = clock; this.inflight = new Map(); }
  locate(state, courseId, lessonId, exerciseId) {
    const course = state.courses.find(c => c.id === courseId); check(course, 'Course not found.', 404);
    const lesson = course.lessons.find(l => l.id === lessonId); check(lesson, 'Lesson not found.', 404);
    const exercise = exerciseId ? lesson.exercises.find(e => e.id === exerciseId) : null; if (exerciseId) check(exercise, 'Exercise not found.', 404);
    return { course, lesson, exercise, progress: state.progress[courseId] };
  }
  async add(course) { return this.store.transact(s => { s.courses.push(course); s.progress[course.id] = emptyProgress(); return publicCourse(course); }); }
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
      for (const key of ['format', 'workflow', 'template', 'visual']) if (value[key] !== undefined) overrides[key] = presentation[key];
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
    check(typeof input.assisted === 'boolean' || input.assisted === undefined, 'Invalid assistance marker.');
    const key = `${input.courseId}:${input.requestId}`;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const work = this.makeAttempt(input).finally(() => this.inflight.delete(key)); this.inflight.set(key, work); return work;
  }
  async makeAttempt(input) {
    const s = await this.store.read();
    const { exercise, lesson, progress } = this.locate(s, input.courseId, input.lessonId, input.exerciseId);
    const existing = progress.attempts.find(a => a.requestId === input.requestId);
    if (existing) { check(existing.exerciseId === exercise.id && existing.lessonId === lesson.id, 'Request ID already belongs to another answer.', 409); return existing; }
    check(typeof input.answer === 'string' && input.answer.length <= 10000, 'Answer must be text of at most 10000 characters.');
    check(['answer', 'unknown', 'reveal'].includes(input.action), 'Unsupported answer action.');
    let result = 'incorrect', feedback = exercise.explanation, grader = 'answer-key';
    if (input.action === 'reveal' || (exercise.type === 'open' && input.action !== 'unknown')) {
      check(exercise.type === 'flashcard' || exercise.type === 'open', 'This exercise requires an answer.');
      if (exercise.type === 'open') text(input.answer, 'Your answer', 10000);
      result = 'pending'; grader = 'self-assessment';
      if (exercise.type === 'open' && input.action === 'answer') {
        const status = await this.codex.status();
        if (status.connected) {
          const grade = await this.codex.grade(exercise, input.answer);
          check(['correct', 'partial', 'incorrect'].includes(grade.result) && typeof grade.feedback === 'string', 'The grader returned an invalid assessment.', 502);
          result = grade.result; feedback = grade.feedback; grader = 'codex-rubric';
        }
      }
    } else if (input.action === 'answer') {
      check(exercise.type !== 'flashcard', 'Reveal and self-rate this flashcard.');
      text(input.answer, 'Your answer', 10000);
      if (exercise.type === 'multiple-choice') check(exercise.options.includes(input.answer), 'Choose an available answer.');
      result = normalize(input.answer) === normalize(exercise.answer) ? 'correct' : 'incorrect';
    }
    return this.store.transact(state => {
      const current = this.locate(state, input.courseId, input.lessonId, input.exerciseId).progress;
      const saved = current.attempts.find(a => a.requestId === input.requestId); if (saved) return saved;
      const attempt = { id: randomUUID(), requestId: input.requestId, lessonId: lesson.id, exerciseId: exercise.id, conceptIds: exercise.conceptIds, answer: input.answer, result, grader, feedback, solution: exercise.answer, explanation: exercise.explanation, assisted: input.assisted === true, createdAt: this.clock(), sequence: ++current.sequence };
      current.attempts.push(attempt); current.lastLessonId = lesson.id;
      this.updateReview(current, attempt); return attempt;
    });
  }
  updateReview(progress, attempt) {
    for (const conceptId of attempt.conceptIds) {
      const queued = progress.reviews.find(r => r.conceptId === conceptId);
      if (attempt.result === 'pending' && queued) continue;
      if (attempt.result === 'correct' && !attempt.assisted) {
        if (queued && (progress.sequence >= queued.dueAfter || this.clock() >= queued.dueAt || progress.completedLessons.includes(queued.lessonId))) progress.reviews = progress.reviews.filter(r => r !== queued);
      } else {
        const item = { conceptId, lessonId: attempt.lessonId, exerciseId: attempt.exerciseId, dueAfter: progress.sequence + 2, dueAt: this.clock() + 30000, failures: (queued?.failures ?? 0) + (attempt.result === 'pending' ? 0 : 1) };
        if (queued) Object.assign(queued, item); else progress.reviews.push(item);
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
      this.updateReview(p, attempt); return attempt;
    });
  }
  async nextReview(courseId) {
    const state = await this.store.read(); const c = state.courses.find(x => x.id === courseId); check(c, 'Course not found.', 404);
    const p = state.progress[courseId];
    const item = p.reviews.find(r => p.sequence >= r.dueAfter || this.clock() >= r.dueAt || p.completedLessons.includes(r.lessonId));
    if (!item) return { question: null, remaining: p.reviews.length, waiting: p.reviews.length > 0 };
    const lesson = c.lessons.find(l => l.id === item.lessonId);
    const candidates = lesson.exercises.filter(e => e.conceptIds.includes(item.conceptId));
    const exercise = candidates.find(e => e.id !== item.exerciseId) ?? candidates[0];
    return { question: { ...publicExercise(exercise), lessonId: lesson.id, lessonTitle: lesson.title, conceptId: item.conceptId }, remaining: p.reviews.length, waiting: false };
  }
}
