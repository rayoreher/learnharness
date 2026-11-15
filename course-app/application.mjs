import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { Codex } from './codex.mjs';
import { Learning, emptyProgress } from './learning.mjs';
import { sampleCourse } from './sample.mjs';
import { check, text, exerciseTypes, publicCourse, additionalExercises } from './schema.mjs';
import { presentationSettings } from '../public/course-studio/plugin-registry.js';
import { prepareSource } from './transfers.mjs';

export async function createApplication({ directory = process.env.LH_COURSE_DATA_DIR || path.resolve('data/course-studio'), codex } = {}) {
  const store = await new Store(directory).initialize();
  codex ??= new Codex({ directory: path.join(directory, 'codex') });
  codex.model = (await store.read()).settings.model;
  const learning = new Learning(store, codex);
  let activeJob = null, closing = false;
  return {
    store, codex, learning,
    async sample() { return learning.add(sampleCourse()); },
    async generate(input) {
      check(!closing, 'Course Studio is shutting down.', 503);
      const kind = input.kind ?? 'course'; check(['course', 'exercises'].includes(kind), 'Unsupported generation kind.');
      const state = await store.read();
      const target = kind === 'exercises' ? learning.locate(state, input.courseId, input.lessonId) : null;
      if (!target) check(state.courses.length < 100, 'This workspace supports up to 100 learning paths.');
      const goal = text(target?.course.goal ?? input.goal, 'Learning goal', 2000), level = text(target?.course.level ?? input.level ?? 'beginner', 'Level', 100);
      const types = exerciseTypes(input.types);
      if (target) check(target.lesson.exercises.length < 40, 'This lesson already has the maximum of 40 exercises.');
      const source = input.source ? prepareSource(input.source) : null;
      let presentation; try { presentation = presentationSettings(input.presentation); } catch (e) { check(false, e.message); }
      const normalized = kind === 'exercises' ? { kind, courseId: input.courseId, lessonId: input.lessonId, types } : { goal, level, types, presentation, ...(source ? { source } : {}) };
      const requestId = input.requestId === undefined ? randomUUID() : text(input.requestId, 'Request ID', 100);
      const fingerprint = JSON.stringify(normalized), existing = state.jobs.find(j => j.requestId === requestId);
      if (existing) { check(existing.fingerprint === fingerprint, 'Request ID already belongs to a different generation.', 409); return existing; }
      check(!activeJob, 'Content is already being generated. Wait for it to finish.', 409);
      const job = { id: randomUUID(), requestId, fingerprint, kind, goal, status: 'queued', createdAt: Date.now(), input: normalized };
      // Claim synchronously after reading receipts and before the first write.
      activeJob = job.id;
      try { await store.transact(s => { s.jobs.push(job); }); }
      catch (e) { activeJob = null; throw e; }
      const operation = async () => {
        try {
          await store.transact(s => { s.jobs.find(j => j.id === job.id).status = 'running'; });
          check(!closing, 'Generation was interrupted by shutdown.', 503);
          if (target) {
            const raw = await codex.exercises(target.course, target.lesson, types, state.settings.model);
            await store.transact(s => {
              const { course, lesson, progress } = learning.locate(s, input.courseId, input.lessonId);
              const added = additionalExercises(course, lesson.id, types, raw); lesson.exercises.push(...added); course.version++;
              const selected = progress.lessonSettings[lesson.id]?.exerciseTypes ?? course.settings.exerciseTypes;
              progress.lessonSettings[lesson.id] = { ...progress.lessonSettings[lesson.id], exerciseTypes: [...new Set([...selected, ...types])] };
              progress.completedLessons = progress.completedLessons.filter(id => id !== lesson.id);
              Object.assign(s.jobs.find(j => j.id === job.id), { status: 'succeeded', courseId: course.id, lessonId: lesson.id, added: added.length });
            });
          } else {
            const course = await codex.course({ goal, level, types, presentation, source }, state.settings.model);
            if (source) course.source = source;
            // Save content and terminal job status in one durable transaction.
            await store.transact(s => { check(s.courses.length < 100, 'This workspace supports up to 100 learning paths.'); s.courses.push(course); s.progress[course.id] = emptyProgress(); Object.assign(s.jobs.find(j => j.id === job.id), { status: 'succeeded', courseId: course.id }); });
          }
        } catch (e) { await store.transact(s => { Object.assign(s.jobs.find(j => j.id === job.id), { status: 'failed', error: e.status ? e.message : 'Generation failed. No incomplete course was saved.' }); }); }
        finally { activeJob = null; }
      };
      this.runningJob = operation(); this.runningJob.catch(() => {});
      return job;
    },
    async setModel(model) {
      text(model, 'Model', 200);
      const models = await codex.models(); check(models.some(m => m.id === model), 'Choose an available Codex model.');
      codex.model = model;
      return store.transact(s => { s.settings.model = model; return s.settings; });
    },
    async close() { closing = true; await codex.close(); await this.runningJob; await store.close(); }
  };
}

const INSTANCE = Symbol.for('learnharness.course-studio.application');
export function getApplication() {
  globalThis[INSTANCE] ??= createApplication().catch(error => { delete globalThis[INSTANCE]; throw error; });
  return globalThis[INSTANCE];
}
