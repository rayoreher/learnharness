# Native lesson and quiz extension

This change extends the original LearnHarness application. Its home, teaching
sessions, sidebar, plan, graph, settings, provider connections and native answer
flow remain the base. MindSpark supplies examples of quiz mechanics only.

Development version 0.4.4 adds pending sign-in return recovery for browsers on
another computer and accurate question-node validation errors. The real native
ChatGPT connection, master plan, first lesson, confidence and committed correction
have been exercised. The full two-lesson real-provider acceptance and the
85-point project UI bar pass; see [final acceptance](native-release-acceptance.md)
and [return recovery](native-sign-in-recovery.md).

Version 0.4.3 adds clearer model-error recovery, comfortable phone
Retry, labeled options/defaults and actual native Settings acceptance. See the
[0.4.3 follow-up](native-app-v043-verification.md).

Version 0.4.2 adds full-app verification, responsive navigation and
Settings, readable lesson progress and complete authoring packaging. See the
[0.4.2 verification](native-app-v042-verification.md) for exact checks and
remaining real-model/release acceptance.

Version 0.4.1 adds an opt-in request for both original teaching
question tools. Disabled workflows retain the original mechanics setting.
Version 0.4.0 added presentation/accessibility polish to these native
surfaces. The [UI study and acceptance rubric](ui-quality-study.md) records the
research, first-pass changes, component previews and remaining full-app checks.

## Existing extension points

- Package the feature as `plugins/lesson-practice`, using the existing API v1
  Core plugin loader and Settings controls. No second plugin registry.
- Add teacher instructions and native tools with `registerInstructions` and
  `registerTools`. Keep the existing teacher, plan and conversation history.
- Attach short lessons and chosen quiz types to existing native plan node IDs.
  Keep plugin-owned outline/review settings under `ctx.dataDirectory`.
- Reuse native `quiz` and `explain` for existing multiple-choice/open response.
  Request them with `registerTools({ agents: ["teacher"], nativeQuestionTools:
  ["quiz", "explain"], create })`; the host adds its own validated tools to that
  teacher turn. Failed factories and disabled activations add no requests, and
  prober/practice mechanics remain unchanged.
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

## Confidence, visible corrections and code in 0.3.0

Generation stays incremental: agree on the original plan, commit one small
explanation, then pose its selected questions one at a time. The next step uses
the accepted answer and the original teacher's confidence guidance.

The lesson records retain native multiple-choice confidence. `lesson_status`
provides `learningSignals` and suggested `reinforce` checks. Confident mistakes
lead the due review list; hesitant correct answers suggest one spaced reinforcing
check while keeping their correct grade. A successful reinforcement does not
force repeated confidence scoring. Declined answers have no confidence.
Historical confidence can be recovered from accepted native records without
regrading, changing assessment order or advancing the review queue.

`lesson_correction` reads an accepted wrong/partial answer and presents its
precommitted reference and explanation visibly in the lesson. This retains the
original quiz card's collapsed Why control. Open responses still use ordinary
teacher feedback. Correction display cannot change a grade or clear a miss.

The separate optional [Code viewer](../plugins/code-viewer/README.md) Core plugin
registers ordinary code languages through the existing renderer hook. It frames
LearnHarness's native highlighted code and line numbers with a language header,
Copy, Expand and scrolling. It uses host-only nested Markdown to avoid recursion,
leaves diagram fences to their existing renderers and adds no dependencies.

Focused backend, native-helper, widget and packaging verification for this version
is recorded in [the review evidence](native-confidence-code-review.json). Complete
React app/model verification and deployment remain outstanding.

## Checks completed through development version 0.2.1

- Thirteen isolated backend tests cover accepted-answer authority, cancelled/forged
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

Version 0.2.0 adds a metadata hook to the existing native plugin activation, so
other enabled plugins contribute selectable quiz, workflow, output and diagram
formats. It reuses native question types and the existing code-fence renderer
registry. Lesson Markdown explicitly opts into those renderers; other Markdown
widgets retain their original host-only behavior. This requires small additive
host API/Markdown changes alongside the Core plugin catalog entry; no routes,
screens, teaching engine or connection implementation are replaced.

The optional `examples/plugins/lesson-formats` package demonstrates all four
categories. Native-loader checks prove its numeric questions enter and clear
the lesson review queue, and saved metadata survives plugin disable. Browser
fixtures verify its choices, slide controls, SVG arrows and fence preservation.
Full React host integration tests are added but remain unrun behind the complete
application's dependency/coverage gate. These fixtures do not establish full-app
rendering or model-driven sequencing.

Version 0.2.1 adds the dependency-free lockfile required by the unchanged
`setupPlugins` helper. An isolated temporary project runs that original helper
with real offline npm, then uses the original `buildCorePlugins` and
`validateCorePackages` helpers to stage the package. The check confirms source,
dependency metadata and learner-data directories stay outside the staged package.
It does not run the other Core packages or the complete application. Portable SDK
declaration emission and generated API reference refresh remain part of full-host
verification.

Three compatible inherited runtime dependency patches are pinned separately:
DOMPurify 3.4.17, Undici 7.30.1 and Zod 4.6.6. Their scoped isolated checks pass,
including the original native connector tests. No dependency is added and the
lesson/plugin implementation is unchanged. Remaining advisory applicability,
framework intake, SDK generation and full browser/model checks stay open; see
the [current application review](native-app-review.md).
