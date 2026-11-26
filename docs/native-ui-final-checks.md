# Native keyboard and reading checks

**26 November follow-up:** [Final native acceptance](native-release-acceptance.md)
records the completed real connection/course/review checks and 85-point UI
assessment. The scoped keyboard/contrast observations below retain their original boundaries.

The real app accepts all seven fixture answers using keyboard response controls,
including multiple choice, open response, fill-blank, flashcard self-assessment
and the contributed numeric question. Space activates native choices/card/Submit
controls, and End sets confidence. Setup and lesson reveal retain the existing
mixed-input fixture; this is not a claim that every app action was keyboard-only.
An unsupported modifier shortcut attempt and a premature control query were
retained, then the test waited for native readiness and used the native controls.
No product behavior was changed to make that check pass.

Actual contrast observations cover 54 lesson, feedback and progress samples plus
eight painted Python keyword/identifier samples in default dark and Ivory light.
Essential text's lowest observed contrast is 4.66:1. Code viewer 0.1.2 fixes two
light-theme keywords that measured 4.34:1 on tinted paper: the native light syntax
palette now uses its intended white background. All eight measured code samples
meet their text minimum after the fix. These are scoped observations, not a
complete WCAG audit.

The three existing Code viewer tests, all Core/authoring builds and original
source-free package gate pass. No external dependency changed. The prior full
app/browser/zoom/recovery and suite results retain their recorded scope in
[0.4.3](native-app-v043-verification.md) and
[0.4.2](native-app-v042-verification.md).

[Exact results and raw observations](native-ui-final-checks.json) ·
[Dark code panel](native-app-previews/code-contrast/default.png) ·
[Light code panel](native-app-previews/code-contrast/ivory.png).
All records/images are synthetic. The real native ChatGPT connection and final
UI score/release decision remain pending.
