# Lessons and mixed practice

A native LearnHarness API v1 plugin. It adds the requested lesson/quiz/review
workflow to the existing teacher and session UI. It creates no separate app,
route, sidebar, provider connection, conversation engine or plugin loader.

Enable **Lessons and mixed practice** under **Settings → Core plugins** after
building LearnHarness normally. Existing plugins and sessions remain available.
The plugin defaults to a text explanation followed by multiple choice, open
response, fill-blank and flashcard questions. Existing native `quiz` and
`explain` supply multiple choice and open responses, preserving their original
controls, confidence, answer commitment and feedback. Only fill-blank and
flashcard editors are added. **Lesson options** in a teaching
session selects a saved lesson and changes its quiz mix/presentation. Its ordinary plugin
settings set defaults for future lessons.

Version 0.4.1 explicitly requests both original teaching tools through the native
plugin host, so either original question-mechanics setting supports a mixed
lesson. Disabling this plugin restores the original setting on future turns.

The normal prober and `plan_init` still establish the goal and plan. Additional
teacher tools commit small lessons to existing plan node IDs. Several
micro-lessons can share one coarse plan node; the plan is still a map rather
than lesson chapters. New question types use the
host's `registerQuestionType`/`registerQuestionRenderer` lifecycle: pending input,
accepted responses, thinking, cancellation and continuation stay host-owned.
The plugin's grading callback supplies a pure observation; it does not claim an
answer has saved. Review records are derived only from occurrence-bound accepted
native results. Open responses use the normal teacher continuation for feedback,
with no additional model call or alternate authentication route.

After feedback the first pass continues even after a mistake. Completion records
coverage of the selected formats; missed concepts remain in a separate queue.
They return after other practice, a short retrieval delay or a lesson boundary,
until a later unassisted correct review answer clears them. Correct answers during
the first pass cannot clear an earlier mistake before it returns. Flashcards explicitly record
self-assessment. Displaying a reference alone never clears a concept.

The native multiple-choice confidence slider is retained in accepted lesson
attempts. `lesson_status` reports learning signals: a confident mistake suggests
a misconception, a hesitant correct answer suggests one delayed reinforcing
check, and a confident correct answer permits moving on. Confidence follows the
original teacher rules (90–100 for certainty; doubt at or below chance, or 30%).
It never changes a grade or turns a correct answer into a mistake. Due reviews
prioritize confident mistakes while preserving spacing and forward progression.
Declining to guess carries no confidence. A successful reinforcement does not
force a loop until the learner reports certainty. Old attempts can recover the
signal from their accepted native record without regrading or moving the queue.

Wrong-answer feedback uses `lesson_correction` to show the committed correct
answer and brief explanation visibly before continuing. The original native
card's Why control is unchanged. This tool reads accepted evidence and cannot
regrade an answer or clear review. The optional **Code viewer** Core plugin adds an editor-style
frame to ordinary code fences while reusing native syntax colors and line numbers.

Text remains the default. Slides and browser-local captioned video render inside
the same native lesson tool card, using host Markdown/buttons and inherited theme
colors. Video has no narration or external service. Unsupported video leaves the
lesson readable. Diagram preference asks the original teacher to use the host's
existing Mermaid rendering; ASCII remains available. Other enabled plugins add
selectable quiz/structure/output/diagram choices with `registerLessonFormat`,
alongside their normal native question types and code-fence renderers. Chosen
metadata stays with saved lessons. Output changes apply when the lesson is next
presented; accepted transcript cards are not rewritten. See the optional
`examples/plugins/lesson-formats` package and `docs/plugin-api/lesson-formats.md`.

Build this plugin alone with `node scripts/build.mjs`; it only copies reviewed
source files and installs no dependencies. The host's existing Core plugin build
stages it with the other packages. Writable state is limited to
`ctx.dataDirectory/lessons.json`; core chats, graph and credentials are never
rewritten by the plugin.

MindSpark is only a quiz-format reference. No MindSpark application, routes,
course database or UI is imported.

Native runtime verification is required before calling this implementation
complete. Unit fixtures alone do not establish full LearnHarness compatibility.
The original backend plugin host has also been checked for discovery, activation,
disable, expired registrations and settings restoration in an isolated empty
profile. Its model services were inert; this does not verify the complete web app.
