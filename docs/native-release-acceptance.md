# Native 0.4.4 acceptance

The original LearnHarness app now passes the requested native extension acceptance.
Its own teacher, master plan, session/graph, confidence, account transport and
plugin host remain the base. Lesson practice is 0.4.4; Code viewer is 0.1.2.
Runtime source is `f55043c099db8b49d5c7dedf050bb97c6dc5707a`.

The real native ChatGPT run completed two small Python lessons. Each accepted
multiple-choice, open, fill-blank and flashcard answers. Nine lesson attempts
include a deliberately incorrect 100%-confident answer and a later successful
unassisted review. The committed correct answer/explanation was shown; ordinary
first-pass successes did not clear the miss. The final state has two covered
lessons, no queued reviews and no pending feedback. Equivalent code was accepted
by normal teacher assessment. An authoring node mismatch was repaired without
changing the selected formats (#11).

The live exercise uses the ordinary native/occurrence-bound APIs with a simulated
learner in a separate synthetic topic. It does not inject accepted records, inspect
credentials or measure human mastery. The real lesson was also viewed in an empty
isolated browser profile at desktop/phone widths: no page errors, page-level
overflow or visible account identity. [Desktop](native-app-previews/real-native/lesson-1440.png) ·
[Phone](native-app-previews/real-native/lesson-390.png).

The native app is now an enabled user service with the same loopback address and
private profile. An actual process restart preserves the connection, nine accepted
attempts, both covered lessons and zero reviews. The original deployment PID/state
and profile remain unchanged. Startup is configured for the existing lingering
user service manager; a machine reboot was not performed.

## UI acceptance

| Area | Score |
| --- | ---: |
| Lesson and assessment clarity | 22 / 25 |
| Accessibility | 16 / 20 |
| Navigation and orientation | 13 / 15 |
| Visual consistency | 12 / 15 |
| Responsive behavior and input | 13 / 15 |
| Loading, error and recovery | 9 / 10 |
| **Total** | **85 / 100** |

No unresolved P0 was observed in the tested flows. This is an agent assessment
against the [documented project rubric](ui-quality-study.md), not a measured
comparison with Apple or an independent usability/WCAG certification. Deductions
retain the known limits: mixed-input setup, scoped contrast/touch coverage,
inherited dense Settings/code-option chrome, occasional conversational continuation
and manual cross-machine return recovery. The goal’s practical 80-point bar is met.

Current validation includes 115 native/auth and 22 lesson/viewer tests, production
build/TypeScript/lint, all six Core builds/portable authoring kit, the complete
native scripted-model browser journey and final source-free/full plugin-browser
gate. Original full-suite evidence remains 5,335 passes/four platform skips at
its documented 0.4.2 checkpoint. Fresh advisory coverage is 1,412 registry pairs
with zero hits; runtime dependencies are byte-identical and no installer ran.

[Exact final state, rubric reasoning, hashes and boundaries](native-release-acceptance.json) ·
[Current recovery checks](native-sign-in-recovery.md) ·
[Keyboard/contrast scope](native-ui-final-checks.md).
