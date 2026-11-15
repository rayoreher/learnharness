# Native lesson and quiz extension

This change extends the original LearnHarness application. Its home, teaching
sessions, sidebar, plan, graph, settings, provider connections and native answer
flow remain the base. MindSpark supplies examples of quiz mechanics only.

## Existing extension points

- Package the feature as `plugins/lesson-practice`, using the existing API v1
  Core plugin loader and Settings controls. No second plugin registry.
- Add teacher instructions and native tools with `registerInstructions` and
  `registerTools`. Keep the existing teacher, plan and conversation history.
- Attach short lessons and chosen quiz types to existing native plan node IDs.
  Keep plugin-owned outline/review settings under `ctx.dataDirectory`.
- Reuse native `quiz` and `explain` for existing multiple-choice/open response.
  Register only the new fill-blank/flashcard schemas/editors through `registerQuestionType` and
  `registerQuestionRenderer`. The host owns pending input, answer acceptance,
  cancellation, persistence, keyboard handling and teacher continuation.
- Use saved grading observations and ordinary teacher feedback. Derive review
  only from accepted, occurrence-bound native records. A grading callback alone
  cannot mark a concept learned or write an accepted answer.
- Show explanations and feedback through the host's Markdown and UI widgets.
  Use its existing Mermaid renderer for diagrams instead of an ASCII layout.
  Lesson-output contributions use ordinary registered content renderers; they
  do not replace the whole interface.

## Requested behavior

1. The learner chooses a goal through the existing new-session flow.
2. The teacher divides it into small explanations attached to its plan, with
   a selectable quiz mix for each lesson. A native plan node can contain
   multiple single-step micro-lessons; it remains the coarse dependency map.
3. Present the explanation, then its questions. Multiple choice, open response,
   fill-blank and flashcards are the initial mixed formats.
4. After each accepted answer, show the committed answer and explanation.
   Continue the lesson sequence after errors; retain missed concepts for later.
5. Return missed concepts in later practice until a subsequent unassisted
   correct response clears them. Coverage remains separate from that queue.
6. Keep existing LearnHarness behavior available. Plugin settings select the
   lesson workflow/output and quiz mix without replacing provider settings.

## Verification boundary

The earlier standalone Course Studio prototype is not this implementation and
does not establish native LearnHarness compatibility. Its branch/release is
preserved as history, and its deployed data is not modified by this work.
The corrected branch starts at upstream commit
`cb25c8e49b85eed9e78315584731cad73a0118a6`.

Review the new plugin closure before isolated tests, and verify its activation,
native question lifecycle and host UI against the original application before
claiming completion. Original dependencies and scripts remain subject to the
owner's outside-code intake requirement; isolated plugin fixtures alone do not
prove that the full application runs.

## Checks completed for the first native draft

- Eleven isolated backend tests cover accepted-answer authority, cancelled/forged
  answers, ordinary teacher feedback, separate coverage/remediation, delay,
  settings inheritance, restart/idempotency and multiple micro-lessons under a
  single native plan landmark. A correct first-pass answer cannot clear an
  earlier mistake before the concept returns for review.
- Original pinned LearnHarness helpers validate the added question definitions,
  saved answer schemas, refinements, manifest and tool parameters. Its original
  `question-core` supplies real shuffled-quiz/confidence/grading and committed
  open-answer records, which the plugin reads without replacing them.
- An isolated Chromium fixture checks native editor/control contracts, reveal
  versus recall, host settings rows, inline slides and real encoded/decoded
  captioned video. It uses a simulated host-widget adapter, so this is not a
  claim of a full original-app browser run.
- The plugin's dependency-free package build passes in isolation. No packages
  are added to the application, no new routes/UI shell/provider are introduced,
  and existing data/deployments are untouched.
- The original pinned backend plugin host and sidecar loader discover the built
  Core package and admit its teacher tools and question types. Disabling aborts
  the saved live registration and invalidates stale tools; re-enabling restores
  per-lesson options. This uses a fresh isolated profile and inert model services.
- Browser fixtures select any saved lesson and verify delayed saves and quick
  quiz-mix changes retain the intended target and values.

Full native application activation/browser QA and model-driven sequencing remain
required. This draft is not a replacement completion claim for the rejected
standalone prototype.

The initial four quiz types and three output choices are currently explicit
options. Wiring additional plugin-contributed formats into those lesson choices
is still required; the underlying host registration APIs alone do not establish
that integration. Mermaid is built into the host, while host-only Markdown
intentionally excludes other plugins' code-fence renderers. Custom diagrams in
saved lesson cards therefore also need an explicit extension path.
