# v0.1 verification record

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

## Remaining before stable release

- Complete ChatGPT sign-in and an actual generated course/open-answer grading
  roundtrip. Simulated protocol tests are not evidence of real inference.
- Browser interaction and visual verification. The installed Chromium could
  not start with its sandbox on this host, and it was not launched with that
  protection disabled. Local HTTP tests do not verify browser rendering.
- Verify the Next route/sidebar integration with the inherited application's
  separately reviewed dependencies and runtime.

## Source and execution boundary

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
