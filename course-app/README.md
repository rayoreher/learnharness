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
   A later unassisted correct answer clears an outstanding concept under the
   default policy. Other policies require two returns or schedule spaced recall.

Multiple choice, true/false and fill-blank use answer keys; ordering checks the
submitted sequence. Open answers use Codex and a
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
- Slides: paged scenes derived from that content, with a downloadable,
  self-contained HTML deck suitable for printing.
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

Use **Formats for this lesson → Add new practice** to generate new questions
in selected formats from the saved explanation. Existing questions and answers
stay intact. Added questions reopen that lesson's coverage and join its exercise
mix. Generation can make one bounded correction request when a model draft
fails validation; invalid content is never saved as a successful course.

## Diagrams, source material and portable learning

Semantic flow diagrams store nodes and relationships independently of their
presentation. Choose Flow diagram for graphical SVG, Plain-text diagram for one
relationship per line, or Diagram + Mermaid source for a graphic with copyable
Mermaid syntax. The app does not install or execute a Mermaid parser. Diagrams
also appear in slides and captioned video.

Add pasted notes or a UTF-8 text/Markdown excerpt up to 24 KB before generating
a course. The chosen source is retained with a digest and included in the model
request as study material. Source text never becomes executable lesson markup.

Export lesson notes as Markdown, a complete course as JSON, or the whole
workspace as a JSON backup from Connection. Workspace backups contain answer
history and review schedules; they exclude the Codex profile and account
configuration. Use Connection to import course JSON, a workspace backup, or old
MindSpark study records. Imports add independent learning paths. Workspace
restore validates every record before adding any, and never overwrites existing
paths. Course imports start with fresh progress. MindSpark's open questions,
multiple choice, fill-blank and flashcards are mapped to supported mechanics;
short readings become lesson content. Questions with several correct choices
become open questions with all reference choices retained.

## Review policies

Choose a policy in the course defaults or override a lesson:

- Return to missed concepts: a later unassisted success clears a mistake.
- Two successful returns: a mistake needs two successful returns, separated by
  intervening attempts or time, even if the lesson is already complete.
- Session review + spaced recall: clears mistakes normally and schedules later
  successful retrieval after 1, 3, 7, 14 and 30 days. This is a transparent fixed
  schedule rather than an FSRS implementation or a guarantee of retention.

The sidebar Review page draws due material from all courses. Each course also
has its own review view. Future schedules, self-assessment labels and past
attempts remain saved when you change policy.

## Data and configuration

Default records: `data/course-studio/learning.json`, relative to the working
directory. Atomic replacement and a single-writer process lease protect writes.
An interrupted generation is recorded on restart and never silently replayed.
Choose Retry generation to start it again explicitly. Browser requests use saved
receipts to recover lost acknowledgements without duplicating accepted work.
Pending receipts survive reloads in the current tab; pending self-assessments
also resume from the server's saved history. Damaged stored references stop
startup with the original file preserved. Workspace limits are 100 paths and
64 MB of learning records.
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
The versioned checkpoints include output, exercise, grading, review, visual and
source contributions, additions to saved lessons, and recovery checks. Version
1.0 delivers the complete standalone local-app scope. The optional inherited
Next bridge remains experimental and requires separate dependency/runtime
verification. It is not required to run Course Studio.

AGPL-3.0-only, matching the upstream project. The parent repository's license
and copyright notices remain authoritative for reused material.
