# Code viewer

Enable **Code viewer** in LearnHarness's existing **Settings → Core plugins**.
Ordinary fenced code in supported programming languages gains an editor-style
frame, a language header, Copy and Expand controls, and keyboard-accessible
scrolling. It also works inside the native lesson plugin's text and slide output.

Syntax colors and line numbers use LearnHarness's original Markdown/highlighting
widget. The nested widget stays host-only, avoiding recursive plugin rendering.
Existing `startLine` and `noLineNumbers` fence metadata are respected. Mermaid
and other diagram/lesson fences keep their own renderers; unsupported languages
keep the original native code block. Disabling this plugin restores that view.

This is a code viewer. It preserves the supplied snippet, including its raw copy
text; it does not execute code or edit the saved lesson. If clipboard access is
unavailable, the Copy button selects the original code in a read-only text field
for the learner's copy shortcut. No packages, external editor, backend service,
account access or data files are added.

`node scripts/build.mjs` copies the package files into `dist` for the original
Core plugin builder. The package includes the empty lock required by native
plugin setup. Browser/widget checks are separate from full-app verification.
