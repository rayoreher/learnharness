# Lesson format contributions

This fork adds two methods to the existing backend activation context:
`registerLessonFormat(format)` and `listLessonFormats()`. They use the original
plugin host, enable/disable lifecycle and registrations. No second loader or
model connection is involved. Existing plugins need no change.
The methods are optional capabilities in API v1's portable types; check for them
when a plugin also supports older upstream hosts.

Each contribution has `id`, `label`, `instructions` and a `kind`:

| Kind | Additional fields | Existing capability used |
| --- | --- | --- |
| `quiz` | `questionTypeId` | This activation's `registerQuestionType` teaching variant |
| `workflow` | `explanation`: `before-questions` or `after-first-answer` | Ordinary native teacher instructions and lesson tools |
| `output` | `language` | Frontend `registerCodeBlock` for the saved lesson Markdown |
| `diagram` | `language` | Frontend `registerCodeBlock` for generated diagram source |

The host creates the choice key as `pluginId:id`. Its catalog contains detached
metadata from enabled, ready activations. Quiz choices without a teaching type
in their own activation are omitted. Unregister/disable removes availability;
it does not delete existing lessons, accepted answers or review records.

For example, after registering a native numeric question:

```js
ctx.registerLessonFormat({
  kind: 'quiz', id: 'numeric', label: 'Numeric response',
  questionTypeId: 'numeric',
  instructions: 'Use the native numeric tool for a finite calculation.'
});
```

Quiz schemas must include the following committed payload fields:

```json
{
  "lessonId": "addition-step",
  "lessonFormat": "lesson-formats:numeric",
  "reference": "4",
  "explanation": "Combine two pairs.",
  "review": false
}
```

The native question uses `type: "check"` and the lesson's original `nodeId`.
The contributor owns answer validation and reveal presentation. Grading should
return `{ result: "correct" | "partial" | "incorrect", provenance: "..." }`;
include `assisted: true` when an answer used assistance. Other grading shapes
request ordinary teacher feedback against the precommitted reference, with no
extra model call. The host's accepted occurrence-bound result supplies progress;
calling a grade callback never creates an accepted attempt.

Lesson options lists contributions alongside built-ins. Each saved lesson keeps
the selected metadata. Historical bindings remain available for a question posed
before its format was deselected. The selected quiz mix controls first-pass
coverage; missed concepts remain independently queued until later review succeeds.
An unavailable plugin cannot be selected for a new lesson. Existing records stay
readable, and the learner can choose another format or re-enable the plugin.

Output renderers receive the complete saved Markdown as fence source. Diagram
renderers receive the source generated in their declared language. Lesson content
explicitly sets `allowPluginFences: true` on the existing `ui.mountMarkdown` widget.
That option preserves display-only host controls and uses the original renderer
registry and fallback. Calls omitting it keep the original host-only behavior.
Missing or failed renderers fall back to readable source. Renderer cleanup and
cancellation continue to belong to the original native frontend manager.

See [the dependency-free example](../../examples/plugins/lesson-formats) for a
numeric quiz, reflection-first structure, slide deck and SVG flow diagram.

Verification currently covers backend/native-loader integration and isolated
browser widget/renderer contracts. Tests added to `host-markdown.test.tsx` and
`plugin-markdown.test.tsx` require the complete reviewed React/Next dependencies
and have not yet run. Full-app browser/model testing remains required.
