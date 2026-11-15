# Course Studio plugin API 1

The browser-safe registry lives in `public/course-studio/plugin-registry.js`.
It is shared with the server so persisted IDs and capability declarations
have one meaning. It does not install, fetch or evaluate arbitrary uploaded
plugin code. Outside plugins require the owner's source-intake workflow before
they are imported into the trusted local app.

## Registration

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
| `visual` | Reserved catalog entries for SVG and plain text; semantic diagram support is the next iteration |
| `exercise` | Catalog of the four current mechanics; general custom mechanics remain on the delivery checklist |
| `grader` | Catalog of answer-key, Codex rubric and self-assessment; general grader dispatch remains on the checklist |
| `review` | Current session remediation policy; selectable policies remain on the checklist |
| `source` | Goal-generated and included sample content; imports remain on the checklist |

The catalog declares future seams explicitly. Catalog presence alone does not
claim that arbitrary custom implementations of every slot are already runnable.

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
