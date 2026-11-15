# LearnHarness Course Studio

Course Studio adds a course workspace to the LearnHarness fork: small lessons,
mixed exercises, immediate answer explanations, and durable concept review.
The original teaching and practice interfaces remain available.

## Run

Use Node.js 22.13 or later (Node 24 LTS recommended), and install Codex separately
using the official OpenAI instructions. From the repository root:

```sh
node course-app/server.mjs
```

Open `http://127.0.0.1:3030`. No package installation or build is needed for this
runner. The Course Studio modules import only Node standard-library modules and
each other. The runner does not start the inherited Pi/Electron runtime.

When running the existing Next application, choose **Courses** in its sidebar,
or open `/courses`. This integration requires the original application's normal
dependencies; those dependencies have a separate verification boundary.

## Use

1. Choose **Explore a sample** to try the complete learning loop without a model.
2. In **Connection**, connect the installed Codex CLI to ChatGPT. Course Studio
   uses its own Codex profile under its data directory. Authentication is managed
   by Codex; browser responses contain connection status and sign-in URLs.
3. Describe a learning goal, choose the starting level and exercise formats,
   and create a course. Generation continues if you navigate elsewhere.
4. Read a lesson, attempt its exercises, and continue after feedback. Mistakes
   remain in the review queue. Completion records coverage, separately from
   correctness and outstanding review.
5. Review after two other attempts, after 30 seconds, or after completing the
   lesson. The review may use a different exercise about the same objective.
   A later unassisted correct answer clears an outstanding concept. This is
   session remediation; long-term spaced repetition is a separate next-version
   policy, rather than a claim that a cleared concept is permanently learned.

Multiple choice and fill-blank use answer keys. Open answers use Codex and a
reference rubric when connected. Without a connection, open answers explicitly
use self-assessment. Flashcards require a recall rating after reveal. Revealing
an answer alone never records a successful recall. Self-assessments remain
labelled in history. The sample is supplied content, not a fallback for a failed
generation request.

ChatGPT requests are made through `codex app-server`, using its managed sign-in.
Only a `chatgpt` account is admitted for model work; API-key authentication is
not substituted. Model availability and usage depend on the account. Content
generation runs in an empty app-owned working directory with read-only access
and no approval tools. The browser never receives provider credentials.

The default device-code flow works from a browser on another machine: open the
displayed official sign-in link, enter the code and approve the connection.
The backend keeps the Codex profile; the UI receives the verification address
and the code intended for the user. The browser callback flow remains supported
through the API's explicit `method: "browser"` option for same-machine setups.

## Lesson-output plugins

Choose a course default or override one lesson's Format, Template, and Workflow.
Overrides are sparse: changing only a lesson's format still lets it inherit
future changes to the course's template or workflow. **Use course defaults**
removes the lesson override without removing attempts or review history.

- Text: complete saved explanatory content.
- Slides: paged scenes derived from that content.
- Captioned video: browser-local encoding of the lesson scenes, with playback
  and a downloadable WebM/MP4 artifact where supported. It has no narration and
  uses no external video service. Keep the tab open during recording.
- Interactive: reveal the lesson one scene at a time. These reveals do not
  count as graded answers or successful recall.

Guided, Example first, and Reference sheet templates are included. The
Try, then explore workflow opens the lesson after the first exercise attempt.
If a browser lacks video capabilities, a readable text lesson appears with
an explicit explanation; source material and progress remain unchanged.

The versioned extension contract is documented in `PLUGIN-CONTRACT.md`.

## Data and configuration

Default records: `data/course-studio/learning.json`, relative to the working
directory. Atomic replacement and a single-writer process lease protect writes.
An interrupted generation is recorded on restart and never silently replayed.
Copy learning records only after stopping the app. Keep the `codex/` profile
private; it contains authentication managed by Codex.

Environment settings:

| Variable | Purpose |
| --- | --- |
| `LH_COURSE_DATA_DIR` | Dedicated learning and Codex-profile directory |
| `LH_COURSE_PORT` | Local HTTP port; default `3030` |
| `LH_COURSE_CODEX_BIN` | Trusted installed Codex executable; default `codex` |

This version binds to loopback and rejects nonlocal hosts and cross-site API
calls. It is a personal local app, not a multi-user public hosting service.
For a remote server, use a secure tunnel. Local storage does not imply offline
inference: relevant course content and answers reach the connected model.

## Verify

From the repository root:

```sh
node --test --test-reporter=spec course-app/tests/*.test.mjs
```

Tests use temporary records and simulated Codex protocol responses; no model
inference or real credentials are required. See `VERIFICATION.md` for the exact
checks performed and remaining live-provider/browser verification.

## Versioned delivery

The full acceptance checklist is [issue #1](https://github.com/rayoreher/learnharness/issues/1).
The first-version implementation is tracked in [issue #2](https://github.com/rayoreher/learnharness/issues/2).
Next: versioned plugin contracts; lesson workflows and templates; text, slides,
video and interactive outputs; visual renderers; review policies; imports and
exports; wider browser and failure-recovery verification.

AGPL-3.0-only, matching the upstream project. The parent repository's license
and copyright notices remain authoritative for reused material.
