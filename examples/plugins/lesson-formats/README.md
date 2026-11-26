# Example lesson formats

An optional, dependency-free plugin for the lesson extension in this fork.
Install its existing `dist` directory as `plugins/lesson-formats/dist` under
LearnHarness's data directory, then enable **Example lesson formats** through
the normal plugin settings. It is not enabled or added to the default catalog.

Lesson options then offers numeric questions, a reflection-first structure, a
plugin slide deck and SVG flow diagrams. The backend uses the existing native
question API and the additive `registerLessonFormat` metadata hook. Presentations
use the existing `registerCodeBlock` API; there is no separate loader or model
connection. The native teacher still generates content and continues the lesson.

Quiz contributions commit `lessonId`, `lessonFormat` (the namespaced choice key),
`reference`, `explanation` and `review` in
their question payload. Native accepted answers supply progress; grading alone
does not. Unrecognized grading results go to ordinary teacher feedback. A custom
format must implement its own question/answer validation and reveal presentation.

Output renderers receive the saved Markdown as their code-fence source. Diagram
renderers receive the generated diagram source. Missing, disabled or failed
renderers retain the host's readable fallback. Enabling third-party code remains
subject to the owner's intake rules.
