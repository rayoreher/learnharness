# Lesson format contract

Lesson extensions use the existing API v1 activation, question and code-fence
registries. Enable **Lessons and mixed practice** through Core plugin settings.
It attaches small lessons to native plan nodes and preserves the original
teacher, accepted answers, confidence, persistence and connection.

## Contribute a choice

Call `ctx.registerLessonFormat` from backend activation. Each format has an
`id`, a learner-facing `label`, ordinary teacher `instructions` and one kind:

| Kind | Additional fields | Companion registration |
| --- | --- | --- |
| `quiz` | `questionTypeId` | Register that plugin's native question type and frontend question renderer |
| `workflow` | `explanation`: `before-questions` or `after-first-answer` | Instructions change the explanation timing within the native lesson |
| `output` | `language` | Register a code-fence renderer for the presentation |
| `diagram` | `language` | Register a code-fence renderer for the diagram |

The host creates a namespaced key. Enabled formats appear in Lesson options;
saved lessons retain their selections when a contributing plugin is disabled.
Missing renderers retain readable host fallback. Registration belongs to the
activation and its returned cleanup function. See the
[public types](plugin-api/plugin-lessons.md) and
[complete example](../examples/plugins/lesson-formats/README.md).

## Native questions and accepted evidence

A teacher tool contribution can request both original question tools with
`nativeQuestionTools: ["quiz", "explain"]`. This adds the original validated
tools on teacher turns; it does not override their definitions. Failed factories,
disabled activations, prober and practice turns contribute no such request.

Custom lesson questions commit `lessonId`, the namespaced `lessonFormat` key,
`reference`, `explanation` and `review` in their payload. They supply their own
question/answer validation and reveal presentation through the
[native question contract](plugin-question-contract.md).

Grades alone do not prove an answer was accepted. The lesson plugin reads
occurrence-bound native records. Show the committed answer and brief explanation
after acceptance; keep moving after mistakes and return missed concepts later.
Only a subsequent unassisted correct review answer clears a miss. Showing a
reference, cancelling an answer or completing lesson coverage cannot clear it.
Confidence can prioritize later practice and never changes a grade.

## Presentation

Text is the default. Slide and captioned video outputs, Mermaid diagrams and
ordinary code highlighting use the same native session cards. Output renderers
receive saved lesson Markdown; diagram renderers receive diagram source. Plugin
instructions are content for the normal teacher, never executable code.

The [lesson plugin](../plugins/lesson-practice/README.md) and
[code viewer](../plugins/code-viewer/README.md) are canonical source projects.
The code viewer reuses host highlighting, copy text and line metadata; it offers
no code execution or alternate account connection.
