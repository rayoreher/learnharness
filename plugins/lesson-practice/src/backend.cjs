'use strict';
const { openStore } = require('./store.cjs');
const { assert, text, emptySession, learningResponses, grade, reconcile, beginLesson, completeLesson } = require('./domain.cjs');
const { formatsFor, selectedSettings, afterFirstAnswer } = require('./formats.cjs');
const schema = require('./schemas.cjs');

const instructions = `Lessons and mixed practice is an optional extension inside this native LearnHarness session. Keep the existing probe, teacher, plan, graph, model connection and conversation. Use native plan_init as usual; this extension never creates a replacement plan or app.
After the learner accepts the plan, use lesson_begin with a stable micro-lesson lessonId, an existing native nodeId, a short title and a focused explanation. Each micro-lesson installs one reasoning step. The native plan remains the coarse dependency map, not lesson chapters; several micro-lessons may share a native nodeId. Default cadence: explain one small lesson, then ask its selected quiz formats one at a time. REUSE native quiz for multiple choice (including its existing option shuffle, confidence and feedback UI), and native explain for open responses. Add only lesson_blank and lesson_card for the new formats. All questions use the existing native teaching lifecycle: copy nodeId exactly, use type=check, commit the correctAnswer/reference and explanation before the answer, and pause normally for native learner input. For the two added formats, payload.lessonId and payload.conceptId must both copy that micro-lesson lessonId; top-level nodeId still names its native plan landmark. Copy payload.quizType from the tool's declared format, set options=[] except for multiple choice, and review=false for the first pass. Read lesson_status for the selected types and output preferences.
Always show the committed reference and explanation after an answer. For open responses or grading errors, assess the saved learner response in your ordinary teacher continuation and call lesson_feedback with its actual questionId, result and brief explanation; do not make another model call or modify the reference. Assessment is about meaning, accepting equivalent wording. Deterministic grades and self-assessments retain their provenance.
In this selected lesson workflow, continue through the remaining first-pass questions and lessons after feedback even when an answer is wrong. Use lesson_finish once every selected format has an accepted assessment. Coverage does not mean understanding. Read lesson_status to find missed concepts that are due after other practice, 30 seconds, or a lesson boundary. Call lesson_revisit for the missed lesson before revisiting native quiz/explain questions; use review=true in the two added formats. Revisit them with fresh wording until a later unassisted correct response clears them. Do not clear a concept by merely repeating its answer or showing a flashcard.
Default output is the normal text lesson. For diagrams use native mermaid fences when the visual preference is mermaid, rather than alignment-dependent ASCII. The lesson_begin/lesson_show result uses the host's content renderer and selected text/slides/captioned-video output; do not add a separate screen. If practice-first is selected, begin commits the explanation without showing it, ask one question, then lesson_show reveals the explanation before further questions.
Read the formats metadata in lesson_status for selected contributions from other enabled plugins. The selected workflow replaces the default cadence; follow its instructions and explanation timing while preserving native answer acceptance, feedback and review invariants. Output contributions render the saved Markdown through their declared native code-fence renderer. For a selected diagram contribution, use its declared fence language and instructions inside the lesson text. For a contributed quiz, invoke its questionToolName using the original native question lifecycle. Its payload must commit lessonId, lessonFormat (the selected namespaced key), reference, explanation and review; use the current lesson ID, native nodeId and type=check. Its accepted result is linked only to that lesson's selected, namespaced format. A plugin grade must return result=correct/partial/incorrect plus provenance; otherwise assess the accepted answer with lesson_feedback in the ordinary teacher continuation. Never invent another plugin's tool or silently replace an unavailable selection; ask the learner to enable it or change Lesson options. Do not create a second plugin loader.`;

function activate(ctx) {
  const store = openStore(ctx.dataDirectory), disposers = [];
  const catalog = () => ctx.listLessonFormats?.() ?? [];
  const alive = () => assert(!ctx.signal.aborted, 'Lessons and mixed practice is disabled.');
  const record = id => { const found = ctx.learning.getSession(id); assert(found && found.kind !== 'practice', 'Open a native teaching session first.'); return found; };
  const notify = () => { if (!ctx.signal.aborted) ctx.events.emit('changed'); };
  const readSession = id => {
    const native = record(id); let result;
    store.change(state => { const session = state.sessions[id] ??= emptySession(); result = { session, ...reconcile(session, native), settings: state.settings }; });
    return structuredClone({ ...result, formats: catalog() });
  };
  const changeSession = (id, change) => {
    alive(); const native = record(id);
    const result = store.change(state => { const session = state.sessions[id] ??= emptySession(); reconcile(session, native); return change(session, native, state); });
    notify(); return result;
  };
  function tool(name, description, parameters, action) {
    return { name, label: name, description, parameters, executionMode: 'sequential', execute: async (_id, input, signal) => {
      alive(); assert(!signal?.aborted, 'Lesson operation was cancelled.');
      const details = action(input);
      const summary = details.lesson ? { lessonId: details.lesson.id, nodeId: details.lesson.nodeId, title: details.lesson.title, settings: details.lesson.settings, showExplanation: details.showExplanation } : details;
      return { content: [{ type: 'text', text: JSON.stringify(summary) }], details };
    } };
  }
  disposers.push(ctx.registerInstructions({ agents: ['teacher'], text: instructions }));
  disposers.push(ctx.registerTools({ agents: ['teacher'], create({ chatId }) { return [
    tool('lesson_status', 'Read this native session’s lesson settings, contributed formats, covered lessons, accepted assessments and missed concepts due for later practice.', schema.object({}), () => { const value = readSession(chatId); return { settings: value.settings, formats: value.formats, lessons: value.session.lessons.map(({ id, nodeId, title, settings, formats }) => ({ lessonId: id, nodeId, title, settings, formats })), covered: value.session.completed, missed: value.session.reviews, due: value.due, pendingFeedback: value.pendingFeedback }; }),
    tool('lesson_begin', 'Commit one single-step micro-lesson attached to an existing native plan node; several micro-lessons may share a node. Text is the complete learner-facing explanation; optional settings choose this lesson’s workflow, output, diagrams and quiz mix.', schema.beginSchema, input => changeSession(chatId, (session, native, state) => {
      const formats = catalog(), existing = session.lessons.find(l => l.id === input.lessonId);
      const selected = existing?.settings ?? selectedSettings(input.settings, state.settings, formats, true);
      const lesson = beginLesson(session, native, { ...input, settings: selected }, state.settings, formats); return { lesson, showExplanation: !afterFirstAnswer(lesson) };
    })),
    tool('lesson_revisit', 'Select a missed micro-lesson for later native quiz/explain practice, without revealing its explanation or altering accepted answers.', schema.object({ lessonId: schema.string(128) }), input => changeSession(chatId, session => { const lesson = session.lessons.find(l => l.id === input.lessonId); assert(lesson && session.reviews.some(r => r.lessonId === lesson.id), 'Choose a lesson with missed concepts.'); return { lessonContext: { lessonId: lesson.id, nodeId: lesson.nodeId } }; })),
    tool('lesson_show', 'Show the saved explanation after the first question of a practice-first lesson, or present it again in its selected output.', schema.object({ lessonId: schema.string(128) }), input => changeSession(chatId, session => {
      const lesson = session.lessons.find(l => l.id === input.lessonId); assert(lesson, 'Start this lesson first.');
      assert(!afterFirstAnswer(lesson) || session.attempts.some(a => a.lessonId === lesson.id), 'Try a question before revealing a practice-first lesson.');
      return { lesson, showExplanation: true };
    })),
    tool('lesson_finish', 'Record first-pass coverage after all selected quiz formats have accepted feedback. Wrong answers remain queued; finish does not declare mastery or change the native graph.', schema.object({ lessonId: schema.string(128) }), input => changeSession(chatId, (session, native) => { completeLesson(session, native, input.lessonId); return { covered: input.lessonId, missedConcepts: session.reviews.length }; })),
    tool('lesson_feedback', 'Assess an accepted open response, or a response whose grading failed, using this ordinary teacher continuation. The native host has already saved the answer. Supply its real questionId; never invent acceptance or alter the reference.', schema.object({ questionId: schema.string(128), result: { enum: ['correct', 'partial', 'incorrect'] }, explanation: schema.string(6000) }), input => changeSession(chatId, (session, native) => {
      const accepted = learningResponses(native, session.lessons.flatMap(l => (l.formats ?? []).map(f => ({ ...f, lessonId: l.id, nodeId: l.nodeId })))).find(a => a.questionId === input.questionId); assert(accepted, 'Feedback requires an accepted native answer.');
      const original = accepted.grading?.result;
      assert(original?.result === 'needs-feedback' || accepted.grading?.error, 'This question already has a deterministic assessment.');
      const feedback = { result: input.result, provenance: 'teacher', explanation: text(input.explanation, 'Feedback', 6000), reference: accepted.reference };
      const previous = session.feedback[input.questionId]; assert(!previous || JSON.stringify(previous) === JSON.stringify(feedback), 'An accepted assessment cannot be changed by retry.');
      session.feedback[input.questionId] = feedback; reconcile(session, native); return { questionId: input.questionId, ...feedback, missedConcepts: session.reviews.length };
    }))
  ]; } }));

  const labels = { 'fill-blank': ['Fill in the blank', 'lesson_blank'], flashcard: ['Flashcard', 'lesson_card'] };
  for (const type of ['fill-blank', 'flashcard']) {
    disposers.push(ctx.registerQuestionType({
      id: `lesson-${type}`, label: labels[type][0], contractVersion: 1, showThinking: true,
      questionSchema: schema.questionSchema(type), answerSchema: schema.answerSchema,
      teach: { toolName: labels[type][1], description: `Ask a ${labels[type][0].toLowerCase()} question in the current native lesson. Commit a reference, explanation, live conceptId and review flag. Native host owns posing, answer acceptance and continuation.` },
      validateQuestion({ chatId, input }) {
        try {
          record(chatId); const state = store.read(), session = state.sessions[chatId], p = input.payload, lesson = session?.lessons.find(l => l.id === p.lessonId && l.nodeId === input.nodeId);
          assert(lesson && lesson.settings.quizTypes.includes(type), 'This quiz format is not selected for this lesson.');
          assert(p.conceptId === lesson.id, 'Use this micro-lesson ID as the reviewed concept.');
          assert(!p.options.length, 'These added formats do not have answer options.');
          if (p.review) assert(session.reviews.some(r => r.conceptId === p.conceptId), 'Only missed concepts can be posed as remediation.');
          return [];
        } catch (error) { return [error.message]; }
      },
      validateAnswer({ input, answer }) {
        if (!answer.known) return [];
        if (!answer.value.trim()) return ['Enter an answer, or choose I don’t know.'];
        if (type === 'flashcard' && !['again', 'good'].includes(answer.value)) return ['Rate your recall after revealing the card.'];
        return [];
      },
      // Pure observation only: native acceptance can still be cancelled later.
      gradeAnswer({ input, answer }) { alive(); return grade(type, input, answer); }
    }));
  }
  disposers.push(ctx.handle('get-settings', () => { alive(); return store.read().settings; }));
  disposers.push(ctx.handle('formats', () => { alive(); return catalog(); }));
  disposers.push(ctx.handle('save-settings', input => { alive(); const result = store.change(s => (s.settings = selectedSettings(input, s.settings, catalog()))); notify(); return result; }));
  disposers.push(ctx.handle('session', input => { alive(); return readSession(text(input?.chatId, 'Session', 128)); }));
  disposers.push(ctx.handle('lesson-settings', input => changeSession(text(input?.chatId, 'Session', 128), session => {
    const lesson = session.lessons.find(l => l.id === input.lessonId); assert(lesson, 'Lesson not found.');
    const formats = catalog(); lesson.settings = selectedSettings(input.settings, lesson.settings, formats);
    const selected = formatsFor(lesson.settings, formats);
    // Retain historical bindings for a question already posed when its format is
    // deselected. Its later accepted answer must still enter the review loop.
    lesson.formats = [...selected, ...(lesson.formats ?? []).filter(f => !selected.some(active => active.key === f.key))];
    if (!lesson.settings.quizTypes.every(t => session.attempts.some(a => a.lessonId === lesson.id && a.quizType === t))) session.completed = session.completed.filter(id => id !== lesson.id);
    return lesson;
  })));
  disposers.push(ctx.events.on(event => {
    if (ctx.signal.aborted || typeof event.chatId !== 'string' || !store.read().sessions[event.chatId]) return;
    try { readSession(event.chatId); notify(); } catch { /* No grade or completion is invented for unavailable native data. */ }
  }));
  return () => { for (const dispose of disposers.reverse()) dispose(); };
}
module.exports = { activate, instructions };
