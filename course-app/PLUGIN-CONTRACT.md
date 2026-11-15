# Course Studio plugin API 1

The browser-safe registry lives in `public/course-studio/plugin-registry.js`.
It is shared with the server so persisted IDs and capability declarations
have one meaning. It does not install, fetch or evaluate arbitrary uploaded
plugin code. Outside plugins require the owner's source-intake workflow before
they are imported into the trusted local app.

## Registration

Add reviewed contributions inside `registerLocalPlugins(registry)` in
`public/course-studio/extensions.js`, then restart the server and refresh the
browser. This shared entry point ensures the same IDs exist before server
validation and browser controls are created. Keep this module browser-safe;
provider work goes through the passed core context. Review changed code and its
dependencies using the owner's intake process before use. No restart-time
package download or executable upload mechanism is provided.

```js
registry.register({
  apiVersion: 1,
  id: 'my-explainer',
  slot: 'output',
  version: '1.0.0',
  label: 'My slide explanation',
  requires: []
}, {
  project(lesson) {
    return {
      type: 'slides',
      scenes: [{ title: lesson.title, text: lesson.summary }]
    };
  }
});
```

IDs use lower-case letters, digits, dots and hyphens and remain stable across
versions. Contributions are addressed by slot and ID. Collisions, invalid
manifests and incompatible API versions are refused; registration does not
overwrite an existing contribution. The returned disposer removes only that
registration. Manifest records and capability arrays are frozen.

## Extension slots and current implementation

| Slot | Contract and current support |
| --- | --- |
| `output` | `project(lesson)` returns text blocks, slide/video scenes or interactive scenes; all four renderers work |
| `template` | `arrange(lesson)` returns a lesson projection; guided/example-first/reference are supplied |
| `workflow` | `practiceFirst` selects the supported lesson-first or attempt-first sequencing |
| `visual` | `project(diagram)` returns validated SVG graph data, plain text or graph plus Mermaid source; all three supplied |
| `exercise` | `input` selects choice/text/recall/ordered controls; `grader` names an assessor; optional `validate(exercise)` adds content checks; six mechanics are supplied |
| `grader` | `grade({exercise, answer}, context)` returns a validated correct/partial/incorrect result and bounded feedback; Codex calls use `context.assess`; capability requirements are checked |
| `review` | Delay/required-success policy, with optional spaced-day intervals; session/reinforced/spaced are supplied |
| `source` | `prepare(input)` normalizes bounded UTF-8 notes or converts imported study records; text/Markdown/MindSpark supplied |

Contributions run through the supported shared primitives. A new input control
or output primitive requires a corresponding trusted renderer. Source adapters
return data to core validation; they never write learning records directly.
Goal and sample entries identify the two built-in course origins.

Exercise plugins use the shared question/reference-answer/explanation/concept
shape, with an options array for choice or ordering. Custom graders cannot
write progress directly. The core validates the result, records grader identity
and version, and updates review. A bad verdict creates no accepted attempt.
Ordering submissions must contain each option exactly once. New registered
mechanics are included in schema validation and structured generation.

Session review clears a missed concept after a later unassisted success.
Reinforced review requires two successful returns with a delay between them.
Spaced review also schedules successful concepts after 1, 3, 7, 14 and 30 days;
future retention checks are separate from outstanding mistakes. These are
explicit fixed intervals, not FSRS or a claim of optimized retention. Changing
policy preserves historical attempts and stored future schedules.

## Output and content authority

The core owns course IDs, objective/exercise identity, validated answer records,
progress, job admission, credentials and persistence. Projection plugins receive
the saved public lesson; switching output never creates a new course or marks
an exercise correct. Templates return a projection rather than mutating the
canonical lesson. Rendered text uses DOM text nodes; model-generated HTML is
never inserted as executable markup.

Video declares `canvas`, `canvas-stream`, and `media-recorder`. The capability
selector chooses text and exposes the reason when requirements are missing.
It does not silently substitute a remote provider or incur another media bill.
The video renderer releases recording tracks and object URLs when disposed.

Registered code is trusted local app code, not a security sandbox. Capability
metadata is negotiation and validation, not proof of isolation from the host.
Provider credentials are not part of the plugin contract.
