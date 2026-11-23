# 0.4.2

- Preserve interactive tool content across identical saved-state refreshes so
  slides and captioned-video creation can finish. Verify actual cancellation,
  retry and optional deck/SVG/numeric contributions through the native app.
- Verify the full native lesson and mixed-question flow, accepted confidence,
  visible corrections, plugin recovery and delayed review through the web app.
- Keep lesson prose to a readable measure while allowing code and diagrams
  to use the available width.
- Present lesson completion and review progress in ordinary learner language.
- Include the lesson and code-viewer projects, format example and stable lesson
  contract in the portable authoring kit.

# 0.4.1

- Request both original native teaching question tools through the existing
  plugin tool registration, so mixed lessons can use multiple-choice confidence
  and open responses under either original mechanics setting.
- Preserve native question validation, reserved names, default behavior when
  disabled and per-turn contribution snapshots.
- Add regression coverage for request validation, role/lifecycle boundaries,
  failed factories and the real teacher's tool catalog.

# 0.4.0

- Add lesson title hierarchy, grouped presentation controls, announced slide
  positions and feedback cards with explicit text status.
- Improve answer-editor spacing and flashcard reveal state.
- Keep the idle video canvas hidden and disable Stop while idle.
- Improve narrow code-panel action layout through Code viewer 0.1.1.
- Refine native focus, disclosure, selection semantics and control hit areas.
- Record the UI research and 80-point acceptance rubric separately from scoped
  component checks; full-app quality remains unscored until native verification.

# 0.3.0

- Retain native multiple-choice confidence as accepted evidence, including
  recovering it from historical native records without regrading.
- Surface confidence-aware lesson signals, prioritize due confident mistakes
  and recommend one spaced reinforcement for a hesitant correct first pass.
- Keep grades, coverage, retrieval spacing and missed-concept clearing intact.
- Show accepted wrong-answer corrections visibly through a read-only native
  lesson tool; preserve the original quiz card's Why control and saved grade.
- Add the separate optional Code viewer Core plugin using native highlighting.

# 0.2.1

- Include the empty dependency lockfile required by LearnHarness's original
  plugin setup helper. No packages are added.
- Verify offline setup and package staging through the original native setup
  and Core packaging helpers in an isolated temporary project.

# 0.2.0

- Add selectable quiz, workflow, output and diagram contributions from other
  enabled plugins through the existing native activation and renderer APIs.
- Snapshot chosen contributions with each lesson. Preserve content, grading
  bindings and pending answers through deselection or plugin disable.
- Let custom quiz grading use the ordinary teacher continuation when needed.
- Add an optional dependency-free example plugin with numeric questions,
  reflection-first lessons, a slide deck and SVG flow diagrams.
- Preserve complete code/diagram fences when splitting built-in slides.
- Opt lesson Markdown into existing plugin fence renderers; existing host-only
  Markdown calls retain their original behavior.

Backend/native-loader and browser-widget checks cover these additions. The new
React host integration tests still need the complete app's reviewed dependencies;
full-app browser/model verification remains required.

# 0.1.1

- Select any saved lesson in Lesson options, or change defaults for new lessons.
- Keep delayed saves attached to the selected lesson when switching lessons.
- Preserve multiple quick changes to the quiz mix.
- Retain first-pass mistakes until they return for a correct review response.
- Verify discovery, activation, disabling and saved settings with the original
  pinned LearnHarness backend plugin host and loader in an empty isolated profile.

This is a development version. Full original-app browser/model verification and
selecting formats contributed by other plugins remain required.
