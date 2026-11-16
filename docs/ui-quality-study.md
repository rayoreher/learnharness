# LearnHarness interface quality study

The target is a polished learning experience in the original LearnHarness app.
The master plan, incremental teaching, native questions, confidence, graph,
connections and existing plugin system remain the product's structure.
“80% of Apple quality” becomes the practical acceptance rubric below; it is not
a measured comparison with Apple's products or a score already achieved.

## References and what they change

| Primary reference | Useful pattern | Application here |
| --- | --- | --- |
| [Apple: design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles/) and [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Clear hierarchy, concise controls, consistent context and adaptable layout | Make the current lesson and next action easy to find; retain the native app structure and user-selected reading appearance |
| [Linear: a calmer interface](https://linear.app/now/behind-the-latest-design-refresh) | Stable action placement and quieter supporting navigation | Group presentation controls, reduce small uppercase navigation labels and separate lesson content from supporting controls |
| [Brilliant: course structure](https://brilliant.org/help/courses-and-curriculum/what-subjects-does-brilliant-teach/) | Interactive lessons with explanations and immediate feedback | Keep one learning step and one question at a time, with a visible correction and an understandable next step |
| [Khan Academy Wonder Blocks](https://github.com/Khan/wonder-blocks/tree/8a9b4c1a76d9c7e0da2ff612de95435656e761c9) | Explicit button hierarchy, sizing tokens, disabled/busy behavior and semantic controls | Reuse LearnHarness's native widgets; keep controls comfortable, make selected state accessible and distinguish available actions from completed actions |
| [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | A 24 CSS pixel AA minimum, subject to exceptions; 44 CSS pixels is the enhanced target | Enlarge the confidence hit area and small navigation controls; use 44 pixel minima for the scoped touch controls |
| [W3C: contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) | Legible text and visible keyboard position | Restore keyboard outlines, strengthen explanation text and secondary lesson labels, and prevent focus entering the closed sidebar |
| [Apple: motion](https://developer.apple.com/design/human-interface-guidelines/motion.md) | Brief, purposeful motion with accessibility preferences respected | Retain useful feedback; reduce transitions on the scoped surfaces when reduced motion is requested |

These are design inferences applied to this app. No Apple, Linear or Brilliant
assets or code are copied. The selected Wonder Blocks files were pinned, checked
against their Git blob hashes and scanned before source study. The MIT license
was inspected. Its root manifest includes a destructive local cleanup script;
the raw blocked finding is retained, and no repository command, installer,
import or dependency was run or adopted. This is a five-file read-only study,
not approval of the complete repository. The reviewed spacing file is deprecated;
the active button theme uses sizing tokens. This pass uses existing LearnHarness
tokens and widgets, with no outside code or new dependencies added.

## Findings in the native source

The audit uses source at `feec0f8`; it is not a runtime audit of the older preview.

| Priority | Finding | First-pass action |
| --- | --- | --- |
| P0 | The global stylesheet suppresses focus outlines, and several custom controls have no replacement | Restore a consistent keyboard-only outline; preserve native selection and pointer behavior |
| P0 | A closed sidebar is clipped and marked aria-hidden while descendants remain focusable | Make the closed sidebar inert |
| P1 | Search, session filters, mode controls and the confidence slider have small hit areas | Increase desktop geometry; enlarge scoped touch targets without changing confidence values or grading |
| P1 | The Why disclosure lacks expanded-state semantics and dims explanation text substantially | Add disclosure semantics and readable explanation text; keep its existing collapsed default |
| P1 | Lesson output is largely unstructured plugin DOM | Add a clear title/eyebrow, reading rhythm, grouped controls and announced slide position |
| P1 | Feedback and code actions lack consistent grouping at narrow widths | Give correction feedback a clear text status; wrap code controls and preserve local horizontal scrolling |
| P1 | Video output presents a blank canvas before creation, and its Stop action is initially available | Hide the idle canvas and disable Stop while idle |
| P1, open | Browser sidebar behavior and the full composition need narrow-screen verification | Verify real navigation, dialogs and composer at 320 CSS pixels before deciding on a broader navigation change |
| P1, open | First-run connection setup and returning to an unfinished lesson need end-to-end usability review | Observe these real flows before changing their structure or adding dashboard chrome |

## The 80-point acceptance bar

| Area | Weight | Evidence required |
| --- | ---: | --- |
| Lesson and assessment clarity | 25 | A real learner can follow plan → lesson → question → correction → next step; review and coverage are visibly distinct |
| Accessibility | 20 | Keyboard completion, visible focus, semantic controls, text contrast and readable larger text on actual screens |
| Navigation and orientation | 15 | Current location and next action are clear; sidebar, dialogs and settings preserve context |
| Visual consistency | 15 | Coherent spacing, type, status, controls and theme behavior throughout the native app |
| Responsive behavior and input | 15 | Native screens work at desktop, tablet and narrow widths, with comfortable pointer/touch targets and local code scrolling |
| Loading, error and recovery | 10 | Real generation, save, connection, cancellation and restart states are understandable and recoverable |

Delivery needs at least 80/100 **and no unresolved P0 failures**. A good screenshot
alone earns no complete-flow or recovery credit. Full-app testing must include
light/dark themes, keyboard input, larger text/zoom, the native model connection,
plugin disable/re-enable, cancellation and restart. Current full-app score is
**unassigned** until those checks run; component results are recorded separately.

## Verification boundary

This pass changes presentation and accessibility attributes in the original UI
and existing plugins. It adds no routes, teaching engine, account connection or
plugin loader. Component browser fixtures mount the real plugin modules and CSS
with controlled substitutes for native widgets. Screenshots are labeled component
previews; they are not screenshots of the complete React app.

The earlier full-app review gates in [native-app-review.md](native-app-review.md)
remain open, including the unanswered scanner-size decision. Existing deployed
learner and account data are untouched. The target stays open until real native
app verification supports the rubric.
