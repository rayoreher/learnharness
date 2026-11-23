# Native application verification: 0.4.2

The original LearnHarness web app now builds and runs with the native lesson
extension. Its full root suite reports **5,335 passed, four platform-specific
skips and no failures**. Lint, production compilation and TypeScript checks pass.
This is a development checkpoint; real ChatGPT generation, final release and
the complete UI acceptance decision remain open in issues #6 and #9.

## Actual learning flow

The browser check runs the original Next/React application, teacher, SDK,
question tools, plugin host, answer acceptance and storage. It configures the
normal custom-provider endpoint with a scripted local model. It does not replace
the app renderer, insert accepted answer records or use real credentials.

Nineteen scripted model responses exercise plan agreement, two small lessons,
six accepted answers and a delayed review. A wrong multiple-choice answer with
100% confidence produces a visible committed correction and a misconception
signal. Open response, fill-blank and flashcard questions continue normally.
Correct first-pass answers retain the earlier miss; only the subsequent correct
review clears it. Disabling the lesson plugin makes its pending question
unavailable; re-enabling restores the normal answer flow.

A new server process reads the same six accepted attempts and cleared queue
without changes. The actual app renders native highlighting, line numbers,
Mermaid and the lesson's slide output. Light/dark themes use the real cached
Google font files and bundled title font. Browser checks cover 1440, 820, 390 and
320 CSS pixels, 24px reading text, reduced motion, mobile navigation focus,
Escape/focus return, and mobile Settings/plugin selection. No browser page error
or horizontal page overflow was observed in these scoped cases.

An actual 200% browser zoom check now halves the CSS viewport from 1440 to 720
at the same window width and doubles the device pixel ratio, without page
overflow. A tiny local browser controller uses the documented Chrome tab zoom
API only for the synthetic loopback app; it is a test helper, not a product
extension. The earlier ineffective keyboard/preference attempts remain retained.

Stop closes an actual held provider stream. A deliberate model failure shows
its error and ordinary Retry recovers while preserving every accepted answer.
The optional example's deck, SVG flow and numeric answer work through the native
host. The captioned video encodes and decodes at 1280px, with a local download.
These follow the six-answer learning flow, adding one accepted numeric answer.
Real ChatGPT acceptance remains open. The
80-point rubric stays **unassigned** until its required evidence is complete.

## Changes found through verification

- Narrow web navigation now uses the existing modal shell instead of squeezing
  the lesson beside a desktop sidebar. Its temporary state preserves the desktop
  preference; keyboard movement, dismissal and the reopen target work normally.
- Mobile Settings uses the available width and a native section selector.
  Comfortable controls preserve the appearance of switches. The first-run text
  includes subscriptions and local models, without implying an API key is required.
- Lesson prose has a readable measure; code and diagrams retain their available
  width. Completion and review cards use ordinary learner-facing language.
- Identical saved-state refreshes retain interactive tool mounts. Before the
  fix they reset slides and interrupted video creation. A failing regression
  reproduces that problem; all 15 renderer checks pass after the fix, including
  real-content replacement, disable, error fallback and cleanup. The immutable
  context boundary also avoids an excessive compiler type expansion, with its
  runtime capture/freeze behavior and public types preserved.
- The portable authoring kit includes both Core additions, the lesson format
  example and a stable lesson contract. Its stale generated reference is removed.
- The standalone smoke handles frontend-only Core plugins without inventing
  backend data directories, and accepts the existing `CHROME_PATH` test browser.
  Its inherited fixture now follows existing native contracts: page pickers
  stay in the pane, surfaces expose an accessible title without a heading row,
  answer thinking starts collapsed, and multiline editors claim newline keys.
  Assertions still verify original instances, selection, focus, real geometry,
  native acceptance and distinct image channels. Raw failures remain retained.

## Dependencies and intake

The final eight lockfiles contain 1,412 unique registry package/version pairs.
The refreshed OSV lookup reports zero affected pairs. Fixes include compatible
Next, Hono, URI, quoting and source-map patches; narrowly scoped linkify/minimatch
updates have tests against their original callers. Puppeteer stays within its
existing major version and removes the inherited legacy-Zod protocol closure.
The original file matcher, ANSI renderer and native browser API checks pass.

The reviewed Linux toolchain contains 1,232 distinct artifacts at 1,473 module
locations, including four generated local SDK links. Exact archives and file
inventories were retained; 75,995 files were inventoried. Text coverage is
complete for the intended operation; 545 opaque/font/image/native asset records
have separate provenance and operation review, not a claim of text scanning.
Registry signatures mathematically bind each acquired package/version to its
locked integrity. This is not independent verification of every provenance
chain or a safety certificate.

The owner approved only the local checker's 16 MiB per-file allowance. All
detection rules and the 16 MiB total limit remain unchanged; its 21 existing
security regressions pass. The shared server's promoted checker is unchanged.
Raw findings and individual file/line/hash dispositions remain retained. No
dependency hook ran. In temporary execution copies, 123 control-bearing files
use visible escapes: 99 have whole-file AST/literal equivalence checks; the
others are JSON, documentation or inactive fixture/source/template data. Every
changed file was rescanned whole. Repository source and pristine archives were
not silently rewritten as a claim of clean upstream code.

All experiments used the existing credential-free isolation and synthetic
profiles. Existing deployed learner data, accounts and services were untouched.
The established server workshop also retains the earlier source/result history
and the data-only, scripts-disabled lock-resolution work. GitHub Actions remains
disabled; these are recorded manual checks, not a claimed CI run.

## Reproduce the browser regression

After the required intake, dependency preparation and production build, run the
existing tooling inside the approved isolated environment:

```sh
CHROME_PATH=/path/to/reviewed/chrome node scripts/smoke-native-lessons.mjs /path/to/evidence
```

It starts only loopback endpoints, uses a fresh synthetic profile and a bounded
model fixture, and closes its app/browser processes. The normal browser sandbox
stays enabled. `LH_QA_EXTERNAL_ISOLATION=1` is only for an already established
outer isolation such as the credential-free test environment used here; it does
not create that boundary. No browser is downloaded. Evidence includes normal
app configuration, model fixture calls, screenshots and accepted practice state.

The existing standalone gate remains:

```sh
node scripts/build-server.mjs
CHROME_PATH=/path/to/reviewed/chrome node scripts/smoke-server.mjs --isolated --browser
```

See [actual app previews](native-app-previews/README.md), the
[machine-readable scope](native-app-v042-verification.json), and the
[UI acceptance rubric](ui-quality-study.md).
