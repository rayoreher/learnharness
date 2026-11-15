# Course Studio verification record

## v0.5 completed verification

- All 52 automated checks pass. Added cases prove generation receipt replay
  across restart, conflicting receipt refusal, additional-format attachment with
  stable old IDs/history, atomic rejection of invalid practice, corruption
  preservation, interrupted-job recovery and tab-receipt reuse.
- The complete isolated real-browser journey passed. It deliberately lost an
  accepted answer's HTTP response, reloaded, recovered feedback and verified
  exactly one recorded attempt. It also reloaded an unrated flashcard and
  resumed rating, created a source-based course via the form, and added three
  missing quiz formats through lesson controls. Diagram/media/import/backup,
  keyboard and mobile checks remained successful.
- Source review covers the authored standard-library/browser closure. The saved
  scanner recorded complete coverage with review-level process/environment/
  network references: the explicit Codex/browser child processes, selected
  runtime settings, localhost HTTP, same-origin browser requests and the SVG
  namespace URI. These match the documented operations. No package or outside
  executable plugin was added, and no inherited script was run.

## v0.4 completed verification

- All 45 automated checks pass on Node 24.22.3. New cases cover source bounds,
  source-aware generation/retry, fresh-identity course import, atomic backup
  restore with retained progress, MindSpark conversion, cyclic diagram layout,
  safe SVG/HTML exports and Markdown code fences.
- The isolated real-browser journey passed SVG/plain-text/Mermaid-source
  switching, actual HTML/Markdown/JSON downloads, course import and workspace
  restore. A new captioned video with a diagram scene was decoded at 1280×720
  and downloaded (771,162 bytes). Earlier learning, review, focus and mobile
  acceptance checks also passed.
- The browser sees no model-generated executable markup. Slide export is
  script-free and self-contained; Mermaid output is source plus our own SVG,
  rather than a claim that a third-party Mermaid runtime was executed.

## v0.3 completed verification

- 35 automated tests pass on Node 24.22.3. Additional cases run a registered
  custom exercise and grader through real core validation/persistence, reject
  invalid grader results, test ordered and true/false answers, enforce delayed
  reinforced success, schedule spaced recall, move global review between
  courses, and reject conflicting receipt reuse.
- The expanded isolated real-browser journey answered fill-blank, choice,
  true/false and ordering exercises through their actual controls. It continued
  after an incorrect true/false answer, completed the lesson and cleared that
  concept through the global Review page. Earlier lesson/media, download,
  keyboard-focus and mobile checks also passed.
- Provider protocol code is unchanged from the live-verified v0.2 adapter.
  Generation now supplies the selected registered mechanic IDs in its schema.
  Actual generation of the added mechanics is part of the next combined live
  source/diagram acceptance check; it is not claimed by these offline tests.

## v0.2 completed verification

- 27 automated tests pass on Node 24.22.3, including plugin compatibility,
  collisions, output projection/fallback, sparse overrides, preserved records
  and device sign-in. The inherited dependency tree is not executed.
- An existing bubblewrap runner successfully supplied a credential-free browser
  environment when launched with the necessary host execution permission.
  Only installed runtime libraries, Node, Chromium, authored app modules and
  the screenshot output folder were mounted. Host home/runtime directories,
  other projects and daemon sockets were absent. The network namespace had
  no external connectivity; the app and browser shared only its loopback.
- The browser harness uses Chromium's DevTools protocol directly through Node's
  built-in WebSocket, with no automation-package installation. Chromium's inner
  sandbox is disabled only inside this enclosing filesystem/network isolation.
  The browser was not run with access to host account files or credentials.
- The real browser completed wrong-answer feedback, open-answer self-rating,
  flashcard reveal/rating, forward lesson progression, review reappearance,
  successful recall and a page reload with preserved queue state.
- Slides and interactive scenes rendered. A real 1280×720 captioned video was
  encoded, decoded by the video element, downloaded, and its WebM header checked.
  Verified downloads were approximately 670 KB. Switching output preserved all attempt,
  completion and review records.
- Desktop and 390px mobile screenshots were inspected. Keyboard answer choice
  retained focus, main navigation fit, and the page had no horizontal overflow.
- The user completed the official ChatGPT device sign-in. The installed Codex
  CLI 0.166.0 then generated a validated four-lesson HTTP course with sixteen
  exercises covering all four mechanics. A real open-answer request returned
  `correct` from `codex-rubric` with semantically appropriate feedback.
- Live testing caught an obsolete `readOnly.access` request rejected by this
  Codex version. The adapter now selects its own `learning-content` permission
  profile with only minimal-runtime/workspace read grants and command network
  access disabled. A fresh-profile protocol check confirmed the effective
  read-only policy; signed-in generation and grading passed after the change.

## v0.2 source review

The authored closure now includes the browser-safe registry imported by the
server. No outside package was added. A saved-scanner high flag at the original
browser harness line 10 was a negative assertion that a daemon endpoint was
inaccessible, using read-only `fs.access`; it did not open that endpoint or
request privileges. The check was strengthened to require that the entire host
home and runtime directories are absent, rather than checking one endpoint.
The complete authored directories were rescanned after this change. Raw reports
are retained in the task's temporary intake location; no detector was disabled.

## Remaining before complete delivery

- Finish the generalized plugin implementations and remaining acceptance items
  in GitHub issue #1. Slot declarations alone are not complete implementations.
- Verify the optional Next route/sidebar bridge with the inherited application's
  independently reviewed dependencies. The standalone application has the
  verified learning, media and signed-in inference path.

## Historical v0.1 verification

## Completed

- 20 automated acceptance tests passed on the authored course workspace with
  the installed Node 24.22.3 runtime (also passed with Node 18.19.1, which is
  outside the supported production runtime range).
- Real HTTP requests exercise creation of the sample course, wrong answers,
  answer reveal, persisted review state, generation job lifecycle, request
  boundaries and duplicate/concurrent work handling.
- Learning tests cover restart persistence, review delay, varied question
  formats, assisted answers, flashcard reveal/self-rating, explicit open-answer
  self-assessment, lesson completion independent of correctness, per-lesson
  exercise selection, malformed generated material and single-writer ownership.
- Protocol tests cover initialization, ChatGPT-only admission, event ordering,
  structured-response failures, login destination validation, timeouts and
  refusal of unexpected approval requests.
- A real installed Codex CLI `0.166.0` successfully completed initialization and
  `account/read` using a fresh temporary app profile. It correctly reported no
  signed-in account. No real inference was performed.
- Syntax checks passed for the server modules and browser JavaScript.

### Limits at the v0.1 checkpoint

- Complete ChatGPT sign-in and an actual generated course/open-answer grading
  roundtrip. Simulated protocol tests are not evidence of real inference.
- Browser interaction and visual verification. The installed Chromium could
  not start with its sandbox on this host, and it was not launched with that
  protection disabled. Local HTTP tests do not verify browser rendering.
- Verify the Next route/sidebar integration with the inherited application's
  separately reviewed dependencies and runtime.

## Inherited source and execution boundary

Base: `amosblomqvist/learnharness` commit
`cb25c8e49b85eed9e78315584731cad73a0118a6`, archive SHA-256
`e57d01a57d7826ad34d6278cf274b860c838ceafba98204e1bc43e42bb1d7258`.
The standing outside-code intake scan recorded unresolved inherited findings
and incomplete bounded coverage. It was not reclassified as successful.
Inherited agent instructions were read as untrusted source data, not adopted
as authority. No inherited package script, installer, test, Pi module or plugin
was executed for this version's verification.

The executed closure consists of newly authored `course-app/*.mjs` and
`course-app/tests/*.test.mjs`, importing only each other and Node's standard
library. The standalone HTTP server serves the newly authored
`public/course-studio/` files. No outside dependencies were introduced or
installed, and there is no new package lockfile or lifecycle hook. The optional
Next integration is outside the tested execution closure. No dependency or
advisory-closure approval is claimed for the inherited application.

Existing installed Node and Codex executables were used as local runtime tools.
Tests used isolated temporary learning directories and fake model responses;
the real Codex handshake used an empty temporary profile without credentials.
Browser verification awaits usable existing isolation. Original source review
records remain in the task's temporary intake directory.

The authored server and browser closures were also scanned with the saved
outside-code scanner. Its first pass flagged README lines 28–29, a negative
statement about credential transport, as `agent-injection`. Manual inspection
confirmed this was explanatory prose describing backend-only authentication,
not an instruction to disclose credentials. The sentence was clarified to
describe the actual browser response fields, then the complete authored
directories were rescanned. No blanket rule exclusions were used.
