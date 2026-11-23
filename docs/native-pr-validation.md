# Native extension: PR and server validation

PR [#7](https://github.com/rayoreher/learnharness/pull/7) extends the original
LearnHarness app. Its current release decision is **draft; do not merge yet**.
This review checked the server's existing tools and working method before using
them. It adds test evidence and release tracking, without a feature version bump.

The later 0.4.1 fix and its isolated verification are recorded in
[the mixed-question review](native-mixed-questions-review.json). Both original
question tools now appear in the real teacher's catalog under either mechanics
setting. Full application flows remain required before merge. The owner has
also approved the checker capacity increase, and SDK/API generation now passes.
The dated 0.4.0 results below retain their original source identity.

## Existing tools and method

- Search the reusable capability catalog and inspect a suitable tool before
  generating a replacement. The installed intake checker is promoted at version
  1.0.0, with current runtime evidence. The browser search returned no matching
  capability; that search is not an inventory of every possible browser tool.
- Reuse the existing isolated workshop for Node experiments. It has Node
  24.22.2, npm 11.19.1 and Python 3.11.2. Save exact source, locks, tests and
  results in its local Git history. Keep public source and synthetic records in
  this environment; use the established transport without changing services.
- Check source provenance, exact hashes, import closure, hooks and dependencies
  before execution. Run the saved checker and inspect its findings. Complete
  scanning still requires manual review; it does not certify arbitrary code.
- Use the project's existing browser tools for real UI flows. Pair assertions
  with screenshots, page/accessibility state and persistence checks; inspect the
  images. Keep failure evidence, repair narrowly, then rerun the affected flow.
  Component fixtures, syntax checks and screenshots have distinct scopes.
- The server's model experiment service uses explicit per-instance allowances
  and a Python-focused worker. It is not the Node/browser test environment.
  No model experiment or allowance was started for this review.

## Verified in the server workshop

The complete tracked source of `plugins/lesson-practice` and
`plugins/code-viewer` at commit
`2d7cb262bfc04983ddbccf4ddca5b5537718deff` was copied to the new workshop project
`learnharness-native-pr7`: 29 files, 219,573 source bytes, plus an origin/hash
manifest. No dependencies were installed. Neither package declares dependencies.

Before testing, the server checked every file against the pinned manifest and
verified the saved checker's own hash. The complete scan covered all 30 text
files, with no truncation or high findings. The review-level findings were
examined: license/origin URLs, a regular-expression `exec` call, and separate
browser/setup/host harnesses outside the selected test import closure. Local and
server content hashes and findings agree. Their scanner tree hashes differ
because the workshop creates private file/directory permissions, which the
checker includes in its tree digest.

The exact command was:

```sh
node --test plugins/lesson-practice/tests/native.test.mjs plugins/code-viewer/tests/viewer.test.mjs
```

**21 passed; 0 failed, skipped or cancelled.** This covers 18 lesson backend
cases and 3 code-viewer unit cases. Source and result commits were saved in the
workshop; the result file was read back and parsed successfully. The public
[evidence record](native-pr-validation.json) binds the result to the exact source.

## Review findings and merge conditions

1. **Mixed native question tools are unavailable together** ([#10](https://github.com/rayoreher/learnharness/issues/10)).
   At the reviewed 0.4.0 source, the lesson plugin selects both native quiz
   formats, while the teacher exposes either `quiz` or `explain`. Existing backend
   fixtures insert both kinds of records manually. Their passing result cannot
   verify the real teacher's available tools. Version 0.4.1 fixes the host opt-in
   and tests both mechanics settings and plugin disable; the actual mixed
   lesson journey remains part of #6.
2. **Full native app verification remains open** ([#6](https://github.com/rayoreher/learnharness/issues/6)).
   Complete dependency/artifact review, SDK/API generation, React integration
   checks and real browser/model/restart flows are still required. The earlier
   scanner-size decision is unanswered; the trusted limit remains unchanged.
   Inherited dependency findings are tracked in [#8](https://github.com/rayoreher/learnharness/issues/8).
3. **GitHub has no test result for this head.** Actions is disabled for this
   fork; there are no check runs, commit statuses or PR workflow runs at the
   tested commit. The inherited automation includes installs and release work;
   it needs exact source/hook review before activation. Workshop results are
   separate evidence, not a green GitHub CI run.
4. **UI acceptance is still open** ([#9](https://github.com/rayoreher/learnharness/issues/9)).
   The full-app 80-point score is unassigned. Earlier component previews and
   this backend rerun cannot establish it.

Manage the PR against its current head: inspect new diffs and review threads,
update the linked completion checklist, run checks appropriate to each change,
and retain honest evidence boundaries. Source changes invalidate results for
the changed scope. Mark ready and merge only after the acceptance items pass;
then verify the merged revision and versioned release. Existing deployment and
learner/account records remain outside this experiment.
