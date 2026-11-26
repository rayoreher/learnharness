# Full native application review

Development checkpoint **0.4.2** now builds and runs the complete original app.
The root suite has 5,335 passes, four platform-specific skips and no failures;
actual browser flows verify mixed questions, corrections, accepted confidence,
review and restart with a scripted local model. The final dependency lookup
reports zero affected registry pairs. See the
[current full-app evidence and remaining acceptance](native-app-v042-verification.md).
Real ChatGPT generation, the final UI decision and release remain open.
The earlier baseline review below retains its original scope and results.

## Source review

The pinned upstream snapshot has 1,257 tracked files. The saved scanner covered
1,246 original text files; 30 high findings have individual source/line/hash
dispositions in [the machine-readable evidence](native-app-review.json).
They include protective credential/network denylists, negative security-test
inputs, mock answers, test-only secrets, packaging cleanup and lifecycle metadata.
Raw findings remain recorded; this is not an execution approval.

One file initially classified as binary was actually a TypeScript test containing
a literal form-feed in a LaTeX-repair fixture. In a disposable copy only, replacing
that character with its Unicode escape preserved the JavaScript string value and
allowed complete text scanning. The original repository file is unchanged. The
remaining ten nontext files are inventoried image/font assets.

The six lock entries lacking individual tarball integrity belong to the optional
Tailwind WASI package's bundled dependencies. They have versions and are covered
by their parent's archive integrity. Four versionless links point to the plugins'
generated local `.sdk` trees. These are distinct from unpinned remote packages;
artifact review and SDK generation still need verification.

## Dependency review

The exact-version lookup across six existing lockfiles found advisories for
14 package/version combinations across 11 packages. The evidence records lookup
time, lock hashes, affected locations, advisory identifiers and fixed-version
candidates. A database hit alone does not establish exploitability in this app.

The first compatible runtime patches are now pinned:

| Library | Previous lock | Updated lock | Scoped checks passed |
| --- | --- | --- | --- |
| DOMPurify | 3.4.14 | 3.4.17 | Browser ESM/UMD formatting, SVG arrows, hooks and rawtext-root regression |
| Undici | 7.29.0 | 7.30.1 | Original native DNS-peer and HTTPS/SNI tests with fresh local TLS fixtures |
| Zod | 4.4.3 | 4.6.6 | ESM/CJS validation, JSON schema, early size rejection, quoted keys and locales |

The exact patch versions returned no advisories in the recorded query. No package
was added or removed. Only three version/integrity entries and two existing direct
dependency minimums changed. The experiments execute reviewed disposable copies,
with their development/publish hooks removed; Zod's locale/emoji controls are
visible escapes with full-file AST/value equivalence proved. Pristine artifacts
and raw findings remain recorded. No installer or package hook was run.

The refreshed lookup covers 1,418 registry package/version pairs across seven
lockfiles and still flags 11 combinations across nine packages. The original
lookup also included one generated local SDK pair, which is now explicitly
excluded from registry coverage. Full evidence, source remediations and exact
test boundaries: [runtime patch review](native-runtime-patch-review.json) and
[finding locations](native-runtime-patch-findings.json).

The standalone checks are [sanitizer browser verification](../tests/sanitizer-browser.mjs),
[native connector verification](../tests/http-client-patch.mjs) and
[schema verification](../tests/schema-patch.mjs). They require the reviewed,
credential-free experiment inputs recorded in the review; they do not start the
application or use existing account/profile data.

Development version 0.3.0 adds a dependency-free Code viewer and updates the empty
lesson-package lock's version. There are now eight lockfiles, with the same
registry package/version set as the recorded seven-lockfile lookup. Its separate
[confidence/code review](native-confidence-code-review.json) refreshes the pinned
native test dependency's advisory check; it does not claim a fresh full-app query
or resolve the inherited findings below.

Other hits include Hono, brace-expansion, fast-uri, linkify-it, minimatch,
shell-quote, source-map-js and legacy Zod 3. Some fixed versions cross a major
version boundary. Review each dependency's actual caller and compatibility;
do not force a blanket major upgrade. The remaining findings require caller and
compatibility analysis before full-app verification. Primary examples:
[DOMPurify](https://github.com/advisories/GHSA-6688-9rhm-gjv2),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Remaining execution gates

- On 23 November the owner approved a 16 MiB per-file reading allowance. Only
  that local checker constant changed; detection rules and its 16 MiB total
  limit are unchanged, and all 21 existing checker regressions passed. Large
  compiler and framework files can now be reviewed whole. Artifact/dependency
  review still applies before execution.
- Complete artifact/hook review and address applicable dependency advisories.
- The portable SDK now emits successfully, the original portability/type test
  passes, and all 23 generated API pages have been refreshed for the native
  additions. Added React/Markdown integration tests and full app checks remain.
- Run the original web app in a fresh isolated profile, verifying real lesson,
  quiz, contributed presentation, feedback, progression, review and restart.
- Confirm the model connection. Original LearnHarness uses its own ChatGPT
  transport; clarification is pending on adding optional local Codex alongside it.

The lesson plugin's isolated backend, native-host, browser-widget and setup/build
checks cover their stated scopes. They do not prove this full application journey.
