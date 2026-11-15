import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { Codex } from './codex.mjs';
import { Learning } from './learning.mjs';
import { sampleCourse } from './sample.mjs';
import { check, text, exerciseTypes, publicCourse } from './schema.mjs';
import { presentationSettings } from '../public/course-studio/plugin-registry.js';

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
      check(!activeJob, 'A course is already being generated. Wait for it to finish.', 409);
      check(!closing, 'Course Studio is shutting down.', 503);
      const goal = text(input.goal, 'Learning goal', 2000), level = text(input.level ?? 'beginner', 'Level', 100);
      const types = exerciseTypes(input.types);
      let presentation; try { presentation = presentationSettings(input.presentation); } catch (e) { check(false, e.message); }
      const job = { id: randomUUID(), goal, status: 'queued', createdAt: Date.now() };
      // Claim the slot before the first await to fence simultaneous requests.
      activeJob = job.id;
      let state;
      try { state = await store.read(); await store.transact(s => { s.jobs.push(job); }); }
      catch (e) { activeJob = null; throw e; }
      const operation = async () => {
        try {
          await store.transact(s => { s.jobs.find(j => j.id === job.id).status = 'running'; });
          check(!closing, 'Generation was interrupted by shutdown.', 503);
          const course = await codex.course({ goal, level, types, presentation }, state.settings.model);
          // Save course and terminal job status in one durable transaction.
          await store.transact(s => { s.courses.push(course); s.progress[course.id] = { completedLessons: [], lastLessonId: null, attempts: [], reviews: [], sequence: 0, lessonSettings: {} }; Object.assign(s.jobs.find(j => j.id === job.id), { status: 'succeeded', courseId: course.id }); });
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
