# Component previews

These are **component fixtures**, not the running application or a replacement
app. They mount the real lesson/code-viewer modules and CSS with controlled
substitutes for the native Markdown/button widgets. They use LearnHarness's
Default and Catppuccin Latte palette definitions, with system-font fallback.
Native syntax highlighting, line numbers, full React integration, navigation and
model behavior are outside this fixture.

- [Desktop, dark](desktop-dark.png)
- [Desktop, light](desktop-light.png)
- [Narrow, 320 CSS pixels](narrow.png)
- [Scoped browser measurements](results.json)

The screenshots show layout and status hierarchy. Separate checks cover touch
targets and larger text; the narrow screenshot itself uses desktop pointer mode.
Full-app quality remains unscored under the [80-point rubric](../ui-quality-study.md).
