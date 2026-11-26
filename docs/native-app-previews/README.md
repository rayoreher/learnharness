# Native application previews, 0.4.2

These are actual screenshots of the original LearnHarness web app with its native
lesson and code-viewer plugins. The normal model endpoint is a scripted local
fixture; these images do not claim real ChatGPT generation. All learner records
are synthetic. Screenshots show actual scroll positions, not marketing mockups.

| View | Evidence |
| --- | --- |
| Desktop dark: native highlighted code, Mermaid, confident wrong answer | [Screenshot](desktop-dark.png) |
| Desktop light: same app and saved lesson | [Screenshot](desktop-light.png) |
| Phone: navigation leaves the lesson its available width | [Screenshot](phone-lesson.png) |
| Correction: committed correct answer and a brief explanation before continuing | [Screenshot](correction.png) |
| Phone Settings: native section selection and Core plugin controls | [Screenshot](phone-settings.png) |
| Optional contribution: deck, SVG and accepted numeric answer | [Screenshot](contributed-formats.png) |
| Actual encoded captioned video and local download | [Screenshot](captioned-video.png) |
| Visible model failure and ordinary recovery | [Error](model-error.png), [Recovered](model-recovered.png) |

See the [verification scope](../native-app-v042-verification.md) and
[machine-readable record](../native-app-v042-verification.json). UI acceptance
remains separate from these screenshots.

The [0.4.3 follow-up](../native-app-v043-verification.md) adds clearer recovery,
a visible phone Retry control and labeled lesson options, with separate current
previews. The images above retain their 0.4.2 scope.

## Final native acceptance

[Final evidence and 85-point assessment](../native-release-acceptance.md) includes
actual real-provider synthetic-topic views at [desktop](real-native/lesson-1440.png)
and [phone](real-native/lesson-390.png). The account identity is excluded.
[Return recovery](../native-sign-in-recovery.md) includes separately labeled
synthetic subscription views at [1440](sign-in-recovery/recovery-1440.png) and
[320](sign-in-recovery/recovery-320.png) pixels.
