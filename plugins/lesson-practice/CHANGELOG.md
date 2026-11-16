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
