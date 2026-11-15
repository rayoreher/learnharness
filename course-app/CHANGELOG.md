# Course Studio changes

## 0.3.0 — exercise and review plugins

- Generalized exercise/assessor dispatch through validated registry interfaces.
  Added true/false and ordering exercises, including keyboard-accessible order
  controls and rejection of malformed answer sequences.
- Added custom content validation and grader identity/version in attempt records.
  Invalid verdicts and missing grader capabilities cannot change progress.
- Added session, reinforced and fixed-interval spaced review policies, keeping
  future retention schedules separate from outstanding mistakes.
- Added a global review page across courses, with per-course scheduling and
  fair selection by recent review activity.
- Added answer fingerprint checks so a receipt cannot be reused for a different
  payload, including simultaneous submissions.
- Passed 35 automated tests and the expanded isolated real-browser journey
  through the new exercise mechanics and global review.

## 0.2.0 — lesson-output preview

- Added plugin API 1 with versioned manifests, explicit extension slots,
  capability checks, collision rejection and readable output fallback.
- Added text, slides, interactive walkthroughs and browser-encoded captioned
  video with actual playback/download. No narration or external media billing.
- Added guided/example-first/reference templates and lesson-first/attempt-first
  workflows, with sparse per-lesson overrides and course defaults.
- Added remote-friendly ChatGPT device sign-in.
- Updated the adapter to Codex 0.166.0's permission-profile protocol. Model
  work uses a fresh temporary workspace outside repository instruction ancestry,
  read-only filesystem grants and disabled command network access.
- Passed 27 automated tests and an isolated real-browser journey covering
  wrong answers, review, reload, keyboard selection, all output formats, actual
  video decoding/download, unchanged progress and mobile navigation.
- Verified real ChatGPT sign-in, generation of a four-lesson HTTP course with
  all four exercise formats, and a correct open-answer rubric assessment.

Remaining: generalized exercise/grader/review/source implementations, semantic
diagram renderers, imports/exports, broader recovery checks and separate
verification of the inherited Next runtime. See delivery issue #1.

## 0.1.0 — first-version preview

- Added a dependency-free local course runner and a Courses entry in LearnHarness.
- Added a responsive learning workspace, sample course, goal-based Codex course
  generation, connection settings and model selection.
- Added text lessons, multiple-choice/open/fill-blank/flashcard exercises,
  immediate feedback, labelled self-assessment, completion and resume.
- Added persisted concept review with delayed reappearance, varied exercise
  formats and protection against counting answer reveal as successful recall.
- Added atomic local records, generation recovery and duplicate-answer handling.
- Added 20 automated acceptance tests and a real unauthenticated Codex handshake.

Preview status: live signed-in inference, browser QA and the inherited Next
integration still require verification. This version is not the completed
plugin/media system; later releases are tracked in GitHub issue #1.
