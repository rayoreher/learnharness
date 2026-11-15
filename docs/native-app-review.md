# Full native application review

The native feature is a development build. The full original application has
not yet passed its required dependency, browser and model verification. This
review preserves the original app and records the remaining work before it runs.

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

The first runtime candidates are:

| Library | Locked version | Candidate | Status |
| --- | --- | --- | --- |
| DOMPurify | 3.4.14 | 3.4.17 | Archive integrity/signatures and text coverage checked; manual review/testing pending |
| Undici | 7.29.0 | 7.30.1 | Archive integrity/signatures and text coverage checked; embedded parser/hook review and testing pending |
| Zod | 4.4.3 | 4.6.6 | Archive integrity/signatures and text coverage checked; locale/hook review and testing pending |

The candidate exact versions returned no advisories in the recorded query. They
are **not installed or adopted**. Their raw scans retain lifecycle warnings;
Zod also retains flags for Unicode characters in locale strings and tests.
Those findings must be resolved for the exact intended operation before use.

Other hits include Hono, brace-expansion, fast-uri, linkify-it, minimatch,
shell-quote, source-map-js and legacy Zod 3. Some fixed versions cross a major
version boundary. Review each dependency's actual caller and compatibility;
do not force a blanket major upgrade. No application dependency changed during
this review. Primary examples: [DOMPurify](https://github.com/advisories/GHSA-6688-9rhm-gjv2),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Remaining execution gates

- The existing framework's 2.6 MB Webpack bundle exceeds the required scanner's
  1 MB per-file limit. The requested 8 MB allowance remains unanswered; no trusted
  scanner rule or limit has changed.
- Complete artifact/hook review and address applicable dependency advisories.
- Emit the portable SDK, refresh generated API references and run the added
  React/Markdown integration tests plus relevant existing checks.
- Run the original web app in a fresh isolated profile, verifying real lesson,
  quiz, contributed presentation, feedback, progression, review and restart.
- Confirm the model connection. Original LearnHarness uses its own ChatGPT
  transport; clarification is pending on adding optional local Codex alongside it.

The lesson plugin's isolated backend, native-host, browser-widget and setup/build
checks cover their stated scopes. They do not prove this full application journey.
